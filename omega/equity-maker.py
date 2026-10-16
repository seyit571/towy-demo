#!/usr/bin/env python3
"""OMEGA MAKER TAPE REPLAY V1

Tracks UNPOSTED maker limit quotes versus *subsequent* real XYZ trade prints.
A trade-through is a hypothetical opportunity, not a fill: unknown queue position,
broker hedge, maker fees and delayed market data can eliminate returns.
No keys, orders, broadcasts, or verified trading profits.
"""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import json
import math
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parent/"data"
ROOT.mkdir(parents=True,exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
URL="https://api.hyperliquid.xyz/info"
UA={"User-Agent":"OMEGA-ReadOnly-Maker-Tape/1.0","Content-Type":"application/json"}
MAX_QUOTES=30
QUOTE_LIFETIME_SECONDS=540
PRICE_DRIFT_LIMIT_BPS=25
EVENTS_MAX=2500
MIN_EVENT_SIZE=0.001

def when(x):
 try:
  y=dt.datetime.fromisoformat(str(x).replace("Z","+00:00"))
  return y.astimezone(dt.timezone.utc) if y.tzinfo else None
 except (ValueError,TypeError):return None

def load(name,fallback):
 try:return json.loads((ROOT/name).read_text())
 except (ValueError,OSError):return fallback

def api(market):
 data=json.dumps({"type":"recentTrades","coin":market}).encode()
 with urllib.request.urlopen(urllib.request.Request(URL,data=data,headers=UA),timeout=13) as r:
  a=json.load(r)
  if not isinstance(a,list):raise ValueError("Invalid tape")
  return a

def num(x):
 try:
  y=float(x)
  return y if math.isfinite(y) else None
 except (TypeError,ValueError):return None

def main():
 state=load("equity-maker-state.json",{"schema":1,"quotes":{},"throughs":[],"seenIds":[],"processedSnapshots":[]})
 if not isinstance(state,dict) or state.get("schema")!=1:
  state={"schema":1,"quotes":{},"throughs":[],"seenIds":[],"processedSnapshots":[]}
 state.setdefault("quotes",{})
 state.setdefault("throughs",[])
 state.setdefault("seenIds",[])
 state.setdefault("processedSnapshots",[])
 doc=load("equity-basis.json",{})
 dt_snap=when(doc.get("timestamp"))
 fresh=(doc.get("schema")==1 and dt_snap is not None
        and 0<=(NOW-dt_snap).total_seconds()<=600)
 tracks=sorted(
   (x for x in doc.get("signals",[])
    if isinstance(x,dict)
    and x.get("makerQuote",{}).get("positiveAtCurrentBestAsk")
    and x.get("stockTradeAgeSeconds",1000)<=50
    and x.get("bookAgeSeconds",1000)<=15
    and float(x.get("perpBookAskSize") or 0)>0),
   key=lambda x:x["makerQuote"]["netIfOnlyTopAskQtyFilledUsd"],reverse=True
 )[:MAX_QUOTES] if fresh else []
 indexes={x.get("ticker"):x for x in tracks}
 prev_quotes={k:v for k,v in state["quotes"].items() if k in indexes}
 watch={k:v for k,v in prev_quotes.items()
        if (created:=when(v.get("createdAt"))) and 0<(NOW-created).total_seconds()<=QUOTE_LIFETIME_SECONDS}
 seen=set(state["seenIds"])
 newthrough=[]
 errors=[]
 # A public trade with buyer as aggressor may match a passive ask at that price.
 # However, without a real resting order, the queue and fill are NOT verified.
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  fut={pool.submit(api,q["market"]):ticker for ticker,q in watch.items()}
  for future,ticker in fut.items():
   q=watch[ticker]
   row=indexes[ticker]
   limit=num(q.get("limitAsk"))
   stockask=num(row.get("equityAsk"))
   basis_stockask=num(q.get("stockAskAtQuote"))
   if not stockask or not limit or not basis_stockask:continue
   drift=abs(stockask/basis_stockask-1)*10000
   if drift>PRICE_DRIFT_LIMIT_BPS:
    continue
   try:
    ticks=future.result(timeout=17)
   except Exception as e:
    errors.append(ticker+": "+str(e)[:120]);continue
   for t in ticks:
    if t.get("side")!="B":continue
    tm=num(t.get("time"));px=num(t.get("px"));sz=num(t.get("sz"))
    if not tm or not px or not sz or sz<MIN_EVENT_SIZE:continue
    created=when(q.get("createdAt"))
    if not created or tm<=created.timestamp()*1000+250 or tm>NOW.timestamp()*1000+2000:continue
    # Require STRICT trade-through: prints at our ask do not prove queue priority.
    if px<=limit:continue
    tid=t.get("tid")
    id_=str(ticker)+"|"+str(tid)+"|"+str(int(tm))
    if id_ in seen:continue
    seen.add(id_)
    qty=min(sz,float(q.get("qtyBase") or 0))
    if qty<MIN_EVENT_SIZE:continue
    # Cost of a hypothetical hedge at the NEXT scanner's stock ask (not true broker execution!)
    notional=qty*stockask
    funding=(abs(float(row.get("perpFundingHourly") or 0))*float(q.get("holdHours") or 4))*notional
    perp_open_maker=qty*limit*float(q["makerFeeBps"])/10000
    perp_close_taker=qty*limit*float(q["takerFeeBps"])/10000
    broker_financing=notional*5/10000+1.0 # $1 minimum broker commission
    closing_slippage=notional*5/10000
    hypothetical=qty*(limit-stockask)-funding-perp_open_maker-perp_close_taker-broker_financing-closing_slippage
    ev={
      "id":id_,"ticker":ticker,"market":q["market"],
      "quoteCreatedAt":q["createdAt"],
      "tapeTradeAt":dt.datetime.fromtimestamp(tm/1000,dt.timezone.utc).isoformat(),
      "takerSide":t["side"],"publicTradeId":str(tid),"publicTx":t.get("hash"),
      "makerAskNotPosted":limit,"tradePx":px,"tradeQty":sz,
      "hypotheticalQtyMax":round(qty,6),
      "stockAskAtNextScan":stockask,
      "grossIfMakerPriorityAndBrokerHedgeUsd":round(qty*(limit-stockask),5),
      "modeledFeesCarryAndExitUsd":round(funding+perp_open_maker+perp_close_taker+broker_financing+closing_slippage,5),
      "netIfHypotheticallyFilledAndHedgedUsd":round(hypothetical,5),
      "queuePriorityEstablished":False,"brokerHedgeFilled":False,
      "makerOrderWasPosted":False,"profitEligibleForWalletLedger":False
    }
    newthrough.append(ev)
    state["throughs"].append(ev)
    # one virtual touch per quote, not every trade at price
    state["quotes"].pop(ticker,None)
    break
 # Re-price the quote only after the prior resting period was checked for
 # trade-through; never claim a match on prints that PRECEDED its creation.
 if fresh and doc["timestamp"] not in state["processedSnapshots"]:
  for ticker,row in indexes.items():
   maker=row.get("makerQuote") or {}
   price=num(maker.get("virtualAskLimit"))
   stockask=num(row.get("equityAsk"))
   if not price or not stockask or price<=stockask or not maker.get("positiveAtCurrentBestAsk"):continue
   created=when(state["quotes"].get(ticker,{}).get("createdAt"))
   if created and (NOW-created).total_seconds()<QUOTE_LIFETIME_SECONDS and ticker not in {z["ticker"] for z in newthrough}:
    # Existing candidate stays, until next cycle or stale reference.
    continue
   state["quotes"][ticker]={
     "ticker":ticker,"market":row["market"],"createdAt":NOW.isoformat(),
     "limitAsk":price,"stockAskAtQuote":stockask,
     "qtyBase":round(min(5000/stockask,float(row.get("perpBookAskSize") or 0)),6),
     "queueAheadBaseAtQuote":float(row.get("perpBookAskSize") or 0),
     "quoteCompetitive":True,
     "makerFeeBps":float(row.get("perpMakerSideBps") or 0),
     "takerFeeBps":float(row.get("perpTakerSideBps") or 0),
     "holdHours":4,
     "status":"UNPOSTED_VIRTUAL_MAKER_LIMIT"
   }
  state["processedSnapshots"].append(doc["timestamp"])
 state["processedSnapshots"]=state["processedSnapshots"][-240:]
 state["throughs"]=state["throughs"][-EVENTS_MAX:]
 state["seenIds"]=list(seen)[-EVENTS_MAX:]
 state["quotes"]={ticker:x for ticker,x in state["quotes"].items()
                  if (at:=when(x.get("createdAt"))) and
                  (NOW-at).total_seconds()<=QUOTE_LIFETIME_SECONDS}
 (ROOT/"equity-maker-state.json").write_text(json.dumps(state,indent=2,ensure_ascii=False)+"\n")
 report={
   "schema":1,"timestamp":NOW.isoformat(timespec="seconds").replace("+00:00","Z"),
   "mode":"UNPOSTED_MAKER_TAPE_REPLAY",
   "marketSource":"Hyperliquid XYZ recentTrades + Nasdaq public stock L1",
   "stocksFreshForPaper":len(indexes),"virtualMakerQuotesWatched":len(watch),
   "makerQuotesPricedAtActualBestAsk":len(indexes),
   "openVirtualQuotes":len(state["quotes"]),"totalPotentialTradeThroughs":len(state["throughs"]),
   "recentThroughs":state["throughs"][-18:],
   "newPotentialThroughs":len(newthrough),
   "conditionallyPositiveTradeThroughs":sum(1 for a in state["throughs"] if a["netIfHypotheticallyFilledAndHedgedUsd"]>0),
   "conditionallyPositiveNetUsd":round(sum(max(0,a["netIfHypotheticallyFilledAndHedgedUsd"]) for a in state["throughs"]),4),
   "paperModelGrossNetUsd":round(sum(a["netIfHypotheticallyFilledAndHedgedUsd"] for a in state["throughs"]),4),
   "positionsActuallyHedged":0,"walletNetRealizedUsd":None,
   "capitalReady":False,"errors":errors[:18],
   "limits":{
      "maxQuoteAgeSeconds":QUOTE_LIFETIME_SECONDS,"maxStockMidDriftBps":PRICE_DRIFT_LIMIT_BPS,
      "replayTimeResolution":"scheduled GitHub job roughly once every five minutes; recentTrades sampling is not comprehensive",
      "strictTradeThrough":True,"onlyPositiveAtCurrentBook":True
   },
   "caution":"This is NOT a real maker fill or profit. Observed taker transactions crossing hypothetical prices "
             "do not establish OMEGA queue priority. Trades and Nasdaq quotes are sampled, short-lived and non-synchronous; "
             "the broker hedge cannot be guaranteed. Never add any modeled PnL to the verified wallet ledger."
 }
 (ROOT/"equity-maker.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
 print(json.dumps({"stocks":len(indexes),"watched":len(watch),
                   "newTradeThrough":len(newthrough),"total":len(state["throughs"]),
                   "conditionalPositives":report["conditionallyPositiveTradeThroughs"],
                   "paperOnly":True,"errors":len(errors)}))
if __name__=="__main__":main()
