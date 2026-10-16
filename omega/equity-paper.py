#!/usr/bin/env python3
"""OMEGA XYZ/EQUITY paper portfolio — uses ONLY fresh independent dual-venue quotes.

WARNING: modeled fills are NOT atomic, realized, or guaranteed; requires actual
cash/margin to hedge the two legs. Never counted in verified wallet PnL.
No keys, signatures, trading calls, or broadcasts.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo

PATH=Path(__file__).resolve().parent/"data"
PATH.mkdir(exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
SYMBOL_CAPITAL_USD=5000.0
MAX_CONCURRENT=2
ENTRY_MIN_SURPLUS_BPS=2.0
HL_TAKER_BPS_PER_SIDE=4.5
EQUITY_BROKER_AND_FINANCING_COST_BPS=5.0
EXIT_SLIPPAGE_BUFFER_BPS=5.0
MAX_HOLD_HOURS=4.0
STOP_LOSS_USD=45.0

def read(name,fallback):
 try:return json.loads((PATH/name).read_text())
 except (OSError,ValueError):return fallback

def when(stamp):
 try:return dt.datetime.fromisoformat(str(stamp).replace("Z","+00:00")).astimezone(dt.timezone.utc)
 except (ValueError,TypeError):return None

def money(x):return round(float(x),4)
def nowiso():return NOW.isoformat(timespec="seconds").replace("+00:00","Z")

state=read("equity-paper-state.json",{"schema":1,"open":[],"closed":[],"seenSnapshots":[]})
if not isinstance(state,dict) or state.get("schema")!=1:
 state={"schema":1,"open":[],"closed":[],"seenSnapshots":[]}
snapshot=read("equity-basis.json",{})
snapshot_dt=when(snapshot.get("timestamp"))
snapshot_fresh=snapshot_dt is not None and 0<=(NOW-snapshot_dt).total_seconds()<960
eligible=(snapshot.get("mode")=="DUAL_MARKET_QUOTE_PRECHECK_ONLY" and snapshot_fresh)
signals={s.get("ticker"):s for s in snapshot.get("signals",[]) if isinstance(s,dict)}
if snapshot.get("timestamp") in state["seenSnapshots"]:eligible=False
closed_new=[]
if eligible:
 for p in list(state["open"]):
  row=signals.get(p["ticker"])
  if not row:continue
  elapsed=max(0,(NOW-when(p["entryTimestamp"])).total_seconds()/3600)
  qty=float(p["quantity"])
  if not row.get("freshStockTrade"):continue
  px_stock=float(row["equityBid"])
  px_perp=float(row["perpBestAsk"])
  if float(row["perpBookAskSize"])<qty:continue
  gross=qty*((px_stock-float(p["stockEntryAsk"]))+(float(p["perpEntryBid"])-px_perp))
  hl_fees=(qty*(px_perp+float(p["perpEntryBid"])))*HL_TAKER_BPS_PER_SIDE/10000
  financing_cost=qty*float(p["stockEntryAsk"])*EQUITY_BROKER_AND_FINANCING_COST_BPS/10000
  close_slippage=qty*float(p["stockEntryAsk"])*EXIT_SLIPPAGE_BUFFER_BPS/10000
  hourly_funding_bps=abs(float(row.get("perpFundingHourly") or 0))*10000
  funding_cost=qty*float(p["perpEntryBid"])*hourly_funding_bps*elapsed/10000
  net=gross-hl_fees-financing_cost-close_slippage-funding_cost
  if net>=8 or net<=-STOP_LOSS_USD or elapsed>=MAX_HOLD_HOURS:
   closed=dict(p,exitTimestamp=nowiso(),stockExitBid=px_stock,perpExitAsk=px_perp,
               holdingHours=round(elapsed,4),grossUsd=money(gross),
               perpRoundtripFeesUsd=money(hl_fees),
               brokerAndFinancingBufferUsd=money(financing_cost),
               slippageBufferUsd=money(close_slippage),
               fundingCostUsd=money(funding_cost),
               paperNetUsd=money(net),result="PAPER_ESTIMATED_FILLED_NOT_WALLET")
   state["closed"].append(closed)
   closed_new.append(closed)
   state["open"].remove(p)
 # Do not manufacture a shortable equity borrow; only short perps/long spot.
 candidates=[r for r in signals.values()
             if r.get("best",{}).get("direction")=="SHORT_PERP_LONG_EQUITY"
             and r.get("best",{}).get("perpDepthAllowsNotional")
             and (r.get("best",{}).get("ifFullConvergenceNetScenarioBps") or -1000)>=ENTRY_MIN_SURPLUS_BPS
             and r["ticker"] not in {p["ticker"] for p in state["open"]}]
 candidates.sort(key=lambda r:r["best"]["ifFullConvergenceNetScenarioBps"],reverse=True)
 for r in candidates:
  if len(state["open"])>=MAX_CONCURRENT:break
  best=r["best"]
  stock_px=float(best["entryEquityPx"])
  perp_px=float(best["entryPerpVWAP"])
  quantity=SYMBOL_CAPITAL_USD/((float(r["equityBid"])+float(r["equityAsk"]))/2)
  if quantity>float(r.get("perpBookBidSize") or 0):
   # No guaranteed best-bid depth; skip until full L2 replay supported
   continue
  x={"id":hashlib.sha256((r["ticker"]+"|"+snapshot["timestamp"]).encode()).hexdigest()[:16],
     "ticker":r["ticker"],"entryTimestamp":nowiso(),"direction":best["direction"],
     "quantity":quantity,"stockEntryAsk":stock_px,"perpEntryBid":perp_px,
     "modeledNotionalUsd":SYMBOL_CAPITAL_USD,
     "initialGrossBps":best["grossEntryDislocationBps"],
     "initialNetIfConvergesBps":best["ifFullConvergenceNetScenarioBps"],
     "transactionActuallyPlaced":False}
  state["open"].append(x)
 state["seenSnapshots"].append(snapshot["timestamp"])
 state["seenSnapshots"]=state["seenSnapshots"][-2000:]
state["cumulativePaperUsd"]=round(float(state.get("cumulativePaperUsd") or 0)+sum(float(p.get("paperNetUsd") or 0) for p in closed_new),6)
state["closedCountAll"]=int(state.get("closedCountAll") or 0)+len(closed_new)
state["closed"]=state["closed"][-1000:]
(PATH/"equity-paper-state.json").write_text(json.dumps(state,indent=2,ensure_ascii=False)+"\n")
closed=state["closed"]
profit=money(state["cumulativePaperUsd"])
report={"schema":1,"timestamp":nowiso(),"mode":"VIRTUAL_TWO_VENUE_PAPER_SIMULATOR",
        "lastSnapshot":snapshot.get("timestamp"),"quoteEligible":eligible,
        "notionalPerVirtualPairUsd":SYMBOL_CAPITAL_USD,
        "assumedCashAndMarginAtLeastUsd":SYMBOL_CAPITAL_USD*2*MAX_CONCURRENT,
        "openPositions":state["open"],"openCount":len(state["open"]),
        "closedCount":state["closedCountAll"],"closedPaperNetUsd":profit,
        "newlyClosedCount":len(closed_new),"lastClosings":closed[-12:],
        "actualOrdersSent":0,"realizedWalletProfitUsd":None,
        "profitTargetsAreNotGuaranteed":True,
        "minimumEntryNetSurplusBps":ENTRY_MIN_SURPLUS_BPS,
        "disclaimer":"Paper-only and capital-assuming. Stock L1 quotes not confirmed broker fills; "
            "cross-market transactions are not atomic. Do not treat modeled PnL as "
            "validated fork receipts, executable arbitrage or real wallet profits."}
(PATH/"equity-paper.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({"paperPositions":len(state["open"]),"closed":len(closed),
                  "paperNetUsd":profit,"snapshotFresh":snapshot_fresh,
                  "processed":eligible,"newClosed":len(closed_new)}))
