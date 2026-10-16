#!/usr/bin/env python3
"""OMEGA BROTHERS EXACT NVDA PARAMETERS - CAPITAL VS. ATOMIC FLASH FEASIBILITY.

Original parameters from the operators' September 2026 account:
["NVDA", 55, 400, {"maxDelta":800, "slippage":0.1}]
makerSize:400, makerOffsetBuy:0.12, makerOffsetSell:0.12,
cancelDelta:0.02, takerRatioBuy:0.05, takerRatioSell:0.1,
takerMin:1, takerMax:2000, limit:110000, makerEnabled:true,
preMarketOffset:0.04.

The two legs are a TradFi broker and Hyperliquid perps.  A normal EVM flash
loan must return principal in one onchain transaction; it cannot be left on
IBKR as collateral across trading sessions.  Alternative Aave variable debt
requires preapproved credit delegation/supplied collateral; not free capital.

This is a QUOTE-BASED conditional scenario only; no maker order posted, no
verified market fill, no futures broker hedging, no profits booked.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import pathlib
from zoneinfo import ZoneInfo

DATA=pathlib.Path(__file__).resolve().parent/"data"
DATA.mkdir(exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
PARAMS={"market":"xyz:NVDA","ticker":"NVDA","minHedgeShares":55,
        "maxHedgeSharesPerBrokerOrder":400,"maxDeltaShares":800,
        "maxBrokerSlippageUsdPerShare":0.10,
        "makerSizeShares":400,"makerOffsetBuyUsd":0.12,
        "makerOffsetSellUsd":0.12,"cancelDeltaUsd":0.02,
        "takerRatioBuy":0.05,"takerRatioSell":0.1,
        "takerMin":1,"takerMax":2000,
        "limit":110000,"makerEnabled":True,"preMarketOffsetUsd":0.04}
def obj(name):
 try:return json.loads((DATA/name).read_text())
 except (OSError,ValueError):return {}
def numeric(x,default=None):
 try:
  y=float(x)
  return y if math.isfinite(y) else default
 except (TypeError,ValueError):return default
def roundmoney(v):return round(float(v),5)
base=obj("equity-basis.json")
rows=[x for x in base.get("signals",[]) if x.get("ticker")=="NVDA"]
row=rows[0] if rows else None
latest=dt.datetime.fromisoformat(base.get("timestamp","1970-01-01T00:00:00+00:00").replace("Z","+00:00"))
quote_fresh=0 <= (NOW-latest).total_seconds() <= 720
result={"schema":1,"generatedAt":NOW.isoformat(timespec="seconds").replace("+00:00","Z"),
        "strategy":"REPLICA_OF_CBB_BROTHERS_NVDA","mode":"SHADOW_UNEXECUTABLE_FLASH_REPLACEMENT",
        "originalPublishedParameters":PARAMS,
        "originalSource":"https://blog.hyperindex.org/equity-perps-arbitrage-bot/",
        "flashLoanDocumentation":"https://aave.com/docs/aave-v3/guides/flash-loans",
        "sourceSnapshotAt":base.get("timestamp"),"sourceQuotesFresh":quote_fresh and bool(row),
        "cashAndMarginAvailableUsd":0,"flashLoanCanSubstituteCapital":False,
        "flashLoanPurpose":"intra-transaction EVM liquidity only, not cross-venue open-position funding",
        "brokerageConnection":False,"hyperliquidWalletConnected":False,
        "realOrders":0,"fullyHedgedFills":0,"verifiedProfitUsd":0,
        "flashOnlyRealizableProfitUsd":0,
        "flashOnlyFundedPositions":0,
        "fundingCanAccrueUsingOnlyFlashLoan":False,
        "blocker":"IBKR broker margin and a multi-hour Hyperliquid perp position survive beyond one blockchain transaction. Flash principal must be returned before transaction end.",
        "reasonNoExactProfit":"Missing real future executions, broker fees/permissions, two-leg fills and actual exit prices. Snapshots cannot yield an exact realized trade PnL."
}
if quote_fresh and row:
 ask=numeric(row["equityAsk"]);bid=numeric(row["equityBid"])
 perp_bid=numeric(row["perpBestBid"]);perp_ask=numeric(row["perpBestAsk"])
 maker_bps=numeric(row.get("perpMakerSideBps"),0.3)
 taker_bps=numeric(row.get("perpTakerSideBps"),0.9)
 funding_hourly=numeric(row.get("perpFundingHourly"),0)
 if all(x is not None and x>0 for x in [ask,bid,perp_bid,perp_ask]):
  fair=(bid+ask)/2
  # Conservative book-formatting to cents. The published offset is $0.12/share.
  # No implied guaranteed queue priority. These aren't submitted post-only orders.
  maker_sell=math.ceil((fair+PARAMS["makerOffsetSellUsd"])*100)/100
  maker_buy=math.floor((fair-PARAMS["makerOffsetBuyUsd"])*100)/100
  post_only_ask_valid=maker_sell>perp_bid
  post_only_bid_valid=maker_buy<perp_ask
  scenarios=[]
  for shares in [PARAMS["minHedgeShares"],PARAMS["maxHedgeSharesPerBrokerOrder"]]:
   stock_cost=shares*ask
   min_hl_margin=shares*maker_sell/20.0  # theoretical 20x minimum, not approved leverage
   notional=shares*maker_sell
   raw_spread=shares*(maker_sell-ask)
   perp_commissions=notional*(maker_bps+taker_bps)/10000
   broker_roundtrip_commission=2.0  # $1 minimum each broker leg, as illustrative
   worst_funding_4h=4*abs(funding_hourly)*notional
   outcomes=[]
   for slip in (0.01,0.05,0.10):
    slippage=shares*slip*2 # broker entry and eventual exit
    net=raw_spread-perp_commissions-broker_roundtrip_commission-worst_funding_4h-slippage
    outcomes.append({"brokerSlippagePerSharePerSideAssumedUsd":slip,
                     "grossEntrySpreadUsd":roundmoney(raw_spread),
                     "perpEntryMakerPlusExitTakerFeesUsd":roundmoney(perp_commissions),
                     "roundtripBrokerMinCommissionUsd":broker_roundtrip_commission,
                     "worstCaseFourHourFundingUsd":roundmoney(worst_funding_4h),
                     "brokerEntryAndExitSlippageCostUsd":roundmoney(slippage),
                     "conditionalNetIfFuturePerfectConvergenceUsd":roundmoney(net),
                     "isExecutableOrBooked":False})
   scenarios.append({
     "shares":shares,"equityLongCashNeededUsd":roundmoney(stock_cost),
     "perpMinimumInitialMarginAt20xUsd":roundmoney(min_hl_margin),
     "indicativeCombinedFundingRequirementUsd":roundmoney(stock_cost+min_hl_margin),
     "capitalActuallyAvailableUsd":0,
     "flashLoanCanRemainAsEquityBrokerCollateral":False,
     "exactBrokerFillOrFutureExitObserved":False,
     "scenarioResults":outcomes})
  result.update({
    "equityBid":bid,"equityAsk":ask,"hyperliquidPerpBid":perp_bid,"hyperliquidPerpAsk":perp_ask,
    "fairMid":roundmoney(fair),"virtualMakerSell":maker_sell,"virtualMakerBuy":maker_buy,
    "sellOrderWouldBePostOnly":post_only_ask_valid,
    "buyOrderWouldBePostOnly":post_only_bid_valid,
    "perpGrowthModeTakerSideFeeBps":taker_bps,
    "perpGrowthModeMakerSideFeeBps":maker_bps,
    "hyperliquidHourlyFunding":funding_hourly,
    "originalHedgeConfigurations":scenarios,
    "cashOrBrokerCreditNeededBeforeRealExecution":True,
    "noCapitalMaxBrokerEquityShares":0,
    "fourHourMarketRisk":"Projected full convergence at unchanged fair reference is an assumption, not proven exit",
  })
else:
 result["skipReason"]="No fresh Nasdaq quote. Do not reuse old IBKR-equivalent prices for exact market replay."
(DATA/"brothers-flash-test.json").write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({k:result.get(k) for k in ("generatedAt","sourceQuotesFresh","equityAsk","hyperliquidPerpAsk","virtualMakerSell","flashLoanCanSubstituteCapital","flashOnlyRealizableProfitUsd")},ensure_ascii=False))
if result.get("originalHedgeConfigurations"):
 for x in result["originalHedgeConfigurations"]:
  print(json.dumps({"shares":x["shares"],"capitalUsd":x["indicativeCombinedFundingRequirementUsd"],
                    "ifConvergedIllustrationUsd":[z["conditionalNetIfFuturePerfectConvergenceUsd"] for z in x["scenarioResults"]]},ensure_ascii=False))
