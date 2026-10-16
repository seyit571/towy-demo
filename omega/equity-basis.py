#!/usr/bin/env python3
"""OMEGA EQUITY BASIS v1 — Hyperliquid XYZ vs independently observed Nasdaq stock bid/ask.

* Real perps L2 prices, depth and funding from Hyperliquid API.
* Real stocks bid/ask and last-trade timestamp from public Nasdaq website.
* No orders signed, no capital, no actual positions, no execution simulation.
* Two different venues: entry price dislocations are neither atomic nor locked profit.
* Report projected break-even *conditional on future convergence*, never captured PnL.
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import math
from pathlib import Path
import re
import urllib.request
from zoneinfo import ZoneInfo

HERE=Path(__file__).resolve().parent
DATA=HERE/"data"
DATA.mkdir(exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
ET=ZoneInfo("America/New_York")
HL_URL="https://api.hyperliquid.xyz/info"
TICKERS=("NVDA","TSLA","AAPL","MSFT","AMD","AMZN","GOOGL","META","COIN","PLTR","HOOD","INTC","MU","MSTR")
NOTIONAL=5000.0
# Baseline assumptions only: real account tier, borrow and trading costs vary.
HL_PERP_TAKER_ROUNDTRIP_BPS=9.0
BROKER_FINANCING_AND_EQUITY_EXECUTION_BUFFER_BPS=5.0
CLOSING_SLIPPAGE_BUFFER_BPS=5.0
HOLD_HOURS=4
MAX_STOCK_TRADE_AGE_S=95
MAX_PERP_BOOK_AGE_S=35
HEADERS={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36","Accept":"application/json,text/plain,*/*"}
errors=[]

def req(url, payload=None, timeout=12, headers=None):
    data=json.dumps(payload).encode() if payload is not None else None
    h=HEADERS|({"Content-Type":"application/json"} if data is not None else {})
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=h),timeout=timeout) as r:
        return json.load(r)

def parse_price(s):
    if isinstance(s,(int,float)):n=float(s)
    else:
        m=re.search(r"[\d,]+(?:\.\d+)?",str(s))
        n=float(m.group(0).replace(",","")) if m else 0.0
    return n if math.isfinite(n) and n>0 else None

def fetch_nasdaq(ticker):
    url=f"https://api.nasdaq.com/api/quote/{ticker}/info?assetclass=stocks"
    j=req(url,timeout=13,headers={"Origin":"https://www.nasdaq.com"})
    p=(j.get("data") or {}).get("primaryData") or {}
    bid=parse_price(p.get("bidPrice"))
    ask=parse_price(p.get("askPrice"))
    if bid is None or ask is None or ask<bid: raise ValueError("invalid equity bid/ask")
    timestamp=p.get("lastTradeTimestamp")
    if not timestamp:raise ValueError("stock trade timestamp unavailable")
    observed=dt.datetime.strptime(timestamp," %b %d, %Y %I:%M %p ET") if timestamp.startswith(" ") else dt.datetime.strptime(timestamp,"%b %d, %Y %I:%M %p ET")
    observed=observed.replace(tzinfo=ET).astimezone(dt.timezone.utc)
    age=(NOW-observed).total_seconds()
    if age< -90 or age>MAX_STOCK_TRADE_AGE_S:raise ValueError(f"stock reference stale {age:.0f}s")
    if p.get("isRealTime") is not True:raise ValueError("Nasdaq quote not real-time")
    return {"ticker":ticker,"equityBid":bid,"equityAsk":ask,"equityLast":parse_price(p.get("lastSalePrice")),
            "nasdaqTradeTimestamp":observed.isoformat(),"stockTradeAgeSeconds":round(age),
            "freshStockTrade":True,"bidAskTimestampIndependent":False,
            "source":"Nasdaq.com public equity L1","referenceType":"Stock displayed bid/ask; quotation timestamp not supplied"}

def fetch_hl_meta():
    j=req(HL_URL,{"type":"metaAndAssetCtxs","dex":"xyz"},timeout=14)
    meta,contexts=j
    m={}
    for i,item in enumerate(meta["universe"]):
        sym=str(item.get("name","")).replace("xyz:","")
        c=contexts[i] if i<len(contexts) else {}
        m[sym]={"market":item["name"],"mark":parse_price(c.get("markPx")),
                "oracle":parse_price(c.get("oraclePx")),"volume24hUsd":float(c.get("dayNtlVlm") or 0),
                "fundingHourly":float(c.get("funding") or 0),"openInterest":float(c.get("openInterest") or 0)}
    return m

def fetch_perp_book(ticker):
    book=req(HL_URL,{"type":"l2Book","coin":"xyz:"+ticker},timeout=13)
    stamp=book.get("time")
    age=NOW.timestamp()-float(stamp)/1000 if stamp else None
    if age is None or not math.isfinite(age) or age< -15 or age>MAX_PERP_BOOK_AGE_S:
        raise ValueError(f"perp book stale {age}")
    levels=book.get("levels",[])
    if len(levels)!=2 or not levels[0] or not levels[1]:raise ValueError("empty L2 book")
    return {"bids":[{"px":float(x["px"]),"sz":float(x["sz"])} for x in levels[0][:20]],
            "asks":[{"px":float(x["px"]),"sz":float(x["sz"])} for x in levels[1][:20]],
            "bookTimestamp":dt.datetime.fromtimestamp(float(stamp)/1000,dt.timezone.utc).isoformat(),
            "bookAgeSeconds":round(age,1)}

def vwap_for_quantity(levels,qty):
    remaining=qty
    filled=0
    gross=0.0
    for level in levels:
        price,size=level["px"],level["sz"]
        if size<=0 or price<=0:continue
        take=min(size,remaining)
        gross+=take*price
        filled+=take
        remaining-=take
        if remaining<=1e-7:break
    return (gross/filled if filled>0 else None,remaining<=1e-7)

def scan_one(ticker,metadata):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:
        a=p.submit(fetch_nasdaq,ticker)
        b=p.submit(fetch_perp_book,ticker)
        stock=a.result(timeout=22)
        book=b.result(timeout=22)
    mid=(stock["equityBid"]+stock["equityAsk"])/2
    qty=NOTIONAL/mid
    sell_px,can_sell=vwap_for_quantity(book["bids"],qty)
    buy_px,can_buy=vwap_for_quantity(book["asks"],qty)
    if not sell_px or not buy_px:raise ValueError("insufficient perp order depth")
    funding_cost_bps=abs(metadata["fundingHourly"])*10000*HOLD_HOURS
    worst_cost_bps=HL_PERP_TAKER_ROUNDTRIP_BPS+BROKER_FINANCING_AND_EQUITY_EXECUTION_BUFFER_BPS+CLOSING_SLIPPAGE_BUFFER_BPS+funding_cost_bps
    cases=[]
    for direction,perp_price,stock_price,book_ok in [
      ("SHORT_PERP_LONG_EQUITY",sell_px,stock["equityAsk"],can_sell),
      ("LONG_PERP_SHORT_EQUITY",buy_px,stock["equityBid"],can_buy),
    ]:
        gross_bps=((perp_price-stock_price) if direction.startswith("SHORT") else (stock_price-perp_price))/mid*10000
        hurdle_bps=worst_cost_bps
        candidate_bps=gross_bps-hurdle_bps
        cases.append({
          "direction":direction,
          "entryEquityPx":stock_price,"entryPerpVWAP":round(perp_price,6),
          "grossEntryDislocationBps":round(gross_bps,3),
          "roundtripCostAndCarryStressBps":round(hurdle_bps,3),
          "ifFullConvergenceNetScenarioBps":round(candidate_bps,3),
          "ifFullConvergenceNetScenarioUsd":round(candidate_bps*NOTIONAL/10000,4),
          "perpDepthAllowsNotional":book_ok,
          "requiresBrokerCollateral":True,
          "shortEquityNeedsBorrowLocate":direction.startswith("LONG"),
          "fullyHedgedExecutionSimulated":False,
          "tradableNetProfitValidated":False,
          "status":"THEORETICAL_CONVERGENCE_ONLY" if book_ok else "INSUFFICIENT_PERP_BOOK",
        })
    best=max(cases,key=lambda c:c["ifFullConvergenceNetScenarioBps"])
    return {
      "ticker":ticker,"market":metadata["market"],
      **stock,
      "perpBestBid":book["bids"][0]["px"],"perpBestAsk":book["asks"][0]["px"],
      "perpBookBidSize":book["bids"][0]["sz"],"perpBookAskSize":book["asks"][0]["sz"],
      "perpMark":metadata["mark"],"perpOracle":metadata["oracle"],
      "perpFundingHourly":metadata["fundingHourly"],"perpVolume24hUsd":round(metadata["volume24hUsd"]),
      "notionalUsdAssumed":NOTIONAL,"bookAgeSeconds":book["bookAgeSeconds"],
      "bookTimestamp":book["bookTimestamp"],"best":best,
      "hypotheticalPositiveAfterBuffers":best["ifFullConvergenceNetScenarioUsd"]>0,
      "executedTransactions":0,"verifiedProfitUsd":0,
    }

def main():
    meta=fetch_hl_meta()
    chosen=[t for t in TICKERS if t in meta and meta[t]["volume24hUsd"]>100000]
    result=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:
        futures={p.submit(scan_one,t,meta[t]):t for t in chosen}
        for fut,ticker in futures.items():
            try:result.append(fut.result(timeout=32))
            except Exception as e:errors.append({"ticker":ticker,"detail":str(e)[:135]})
    result.sort(key=lambda x:x["best"]["ifFullConvergenceNetScenarioUsd"],reverse=True)
    positive=[x for x in result if x["hypotheticalPositiveAfterBuffers"]]
    report={
     "schema":1,"timestamp":NOW.isoformat(timespec="seconds").replace("+00:00","Z"),
     "mode":"DUAL_MARKET_QUOTE_PRECHECK_ONLY",
     "marketCountXYZ":len(meta),"stocksRequested":len(chosen),"stocksFresh":len(result),
     "stocksWithTheoreticalPositiveDislocation":len(positive),
     "fundedNotionalPerCaseUsd":NOTIONAL,
     "realizedProfitUsd":None,"verifiedNetSimulatedUsd":0,"executedProfitPerMinuteEur":0,
     "fullTwoLegExecutionSimulations":0,"capitalReady":False,
     "brokerQuoteSource":"Public Nasdaq listed bid/ask; latest trade timestamp only, not independent quote timestamp",
     "perpQuoteSource":"Hyperliquid xyz HIP-3 best 20 L2 levels",
     "roundtripPerpTakerBps":HL_PERP_TAKER_ROUNDTRIP_BPS,
     "brokerAndFinancingBufferBps":BROKER_FINANCING_AND_EQUITY_EXECUTION_BUFFER_BPS,
     "closingSlippageBufferBps":CLOSING_SLIPPAGE_BUFFER_BPS,
     "carryHorizonHours":HOLD_HOURS,
     "signals":result,"errors":errors,
     "requiredToGoLive":["Available broker stock margin or cash plus Hyperliquid margin","Authorized brokerage APIs and broker short locate where needed",
                         "Time-synchronized quote freshness and full two-leg liquidity","Both-leg transaction replay and roundtrip exit cost",
                         "Account fee tier, funding carry, margin and liquidation stress",
                         "Risk limits, manual explicit approval to fund or trade"],
     "disclaimer":"Not capital free, not a flashloan operation. Stocks and Hyperliquid perps cannot be "
                  "atomically hedged across venues. A positive conditional convergence scenario "
                  "is not a trading signal, a realized gain or a verified full simulation. "
                  "Equity markets close on nights/weekends; do not carry stale quotes."
    }
    (DATA/"equity-basis.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps({"asof":report["timestamp"],"total":len(meta),"fresh":len(result),
                      "positivesScenario":len(positive),
                      "top":[{"symbol":x["ticker"],"grossBps":x["best"]["grossEntryDislocationBps"],
                              "netScenarioUsd":x["best"]["ifFullConvergenceNetScenarioUsd"],
                              "direction":x["best"]["direction"]} for x in result[:8]],
                      "errors":errors[:8]},ensure_ascii=False))
if __name__=="__main__":main()
