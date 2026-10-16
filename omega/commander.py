#!/usr/bin/env python3
"""OMEGA Decision Engine v1 — multi-chain signal triage with strict receipt accounting.

READ ONLY. No wallet, signatures, order submission or fabricated earnings.
Reads scanner evidence and produces a ranked queue; never upgrades expected
bonuses, quote-only cycles, or volume into captured P&L.
"""
import datetime as dt
import json
import math
from pathlib import Path

DIR=Path(__file__).resolve().parent/"data"
NOW=dt.datetime.now(dt.timezone.utc)
SOURCE_LIMITS={
 "evm.json":20,"sky.json":20,"keepers.json":20,"beefy-base.json":30,
 "bsc-v3.json":20,"bsc.json":20,"triangles.json":20,
 "solana-keepers.json":20,"capture-ledger.json":25,"snapshot.json":20,
}
def read(filename):
 try:
  j=json.loads((DIR/filename).read_text())
  return j if isinstance(j,dict) else None
 except (OSError,ValueError):
  return None
def when(x):
 try:
  t=dt.datetime.fromisoformat(str(x).replace("Z","+00:00"))
  return t.astimezone(dt.timezone.utc) if t.tzinfo else None
 except (ValueError,TypeError):return None
def finite(v):
 try:
  if v is None or isinstance(v,bool):return None
  x=float(v)
  return x if math.isfinite(x) else None
 except (TypeError,ValueError):return None
def status_code(age,limit,exists):
 if not exists:return "MISSING"
 if age is None or age< -3:return "INVALID_TIMESTAMP"
 return "FRESH" if age<=limit else "STALE"

docs={key:read(key) for key in SOURCE_LIMITS}
health={}
for file,ttl in SOURCE_LIMITS.items():
 doc=docs[file] or {}
 timestamp=doc.get("timestamp") or doc.get("generatedAt") or doc.get("observedAt") or doc.get("capturedAt")
 t=when(timestamp)
 age=round((NOW-t).total_seconds()/60,1) if t else None
 health[file]={"timestamp":timestamp,"ageMinutes":age,"status":status_code(age,ttl,docs[file] is not None),"maxAgeMinutes":ttl}

queue=[]
def add(network,mechanism,action,status,source,reason,upper=None,currency="USD",cost=None,proof=None):
 """Queue is a research queue; it is deliberately NOT a wallet earnings ledger."""
 row={"network":network,"mechanism":mechanism,"action":str(action)[:120],"status":status,
      "source":source,"sourceFresh":health[source]["status"]=="FRESH","reason":str(reason)[:220],
      "upperBoundUsd":round(upper,6) if upper is not None and math.isfinite(upper) else None,
      "gasEstimateUsd":round(cost,6) if cost is not None and math.isfinite(cost) else None,
      "requiresFullAtomicSimulation":True,"walletProfitVerified":False,
      "proof":proof}
 queue.append(row)

evm=docs["evm.json"] or {}
for p in evm.get("positions",[]):
 if not isinstance(p,dict):continue
 upper=finite(p.get("preSwapUpperBoundUsd"))
 gross=finite(p.get("grossBonusCeilingUsd"))
 if not p.get("onchainUnderwaterBeforeAccrual"):continue
 if not upper or upper<=0:continue
 add(p.get("chain","EVM"),"Morpho onchain liquidation",
     str(p.get("collateral","?"))+"/"+str(p.get("loan","?")),"NEEDS_SWAP_AND_FORK","evm.json",
     "Onchain pre-accrual health check; upper bound excludes swap/slippage/funding and competition",
     upper, cost=finite(p.get("gasEstimateUsd")),proof={"marketId":p.get("marketId"),"borrower":p.get("borrower"),"block":p.get("block")})

sky=docs["sky.json"] or {}
for x in sky.get("eligible",[]):
 if not isinstance(x,dict):continue
 reward=finite(x.get("rewardDAITheoretical"))
 if reward is None or reward<=0:continue
 add("Ethereum","Sky Clipper redo",x.get("name","Sky auction"),
     "READ_ONLY_CALL_OK" if x.get("simulation")=="ETH_CALL_OK" else "NEEDS_CALL_SIM",
     "sky.json","A theoretical DAI incentive; requires current auction eligibility, gas and race checks",
     reward,currency="DAI",proof={"auctionId":x.get("auctionId"),"address":x.get("address")})

keeper=docs["keepers.json"] or {}
for x in keeper.get("keepers",[]):
 if not isinstance(x,dict):continue
 n=finite(x.get("netUSDApprox"))
 if n is None or n<=0:continue
 add("Ethereum","Curve PegKeeper caller",x.get("name","PegKeeper"),
     "CALL_QUOTE_ONLY","keepers.json",
     "Approx LP valuation; must confirm callable update and actual received asset after gas",
     n,proof={"address":x.get("address")})

beef=docs["beefy-base.json"] or {}
for x in beef.get("candidates",[]):
 if not isinstance(x,dict):continue
 n=finite(x.get("netBeforeL1DataFeeETH"))
 if n is None or n<=0:continue
 # Not using the ETH quote as USD. No trusted ETH valuation here.
 add("Base","Beefy harvest caller",x.get("id","Beefy"),
     "RPC_RECEIPT_ONLY","beefy-base.json",
     "Positive RPC net ETH estimate excludes L1 data fee; no full fork wallet balance verified",
     None,proof={"address":x.get("address"),"netBeforeL1DataFeeEth":n})

for source,field,label in [("triangles.json","netIndicativeUsd","BNB optimal path"),
                           ("bsc-v3.json","netAfterFlashGasUsdApprox","BNB V3 route")]:
 doc=docs[source] or {}
 for x in doc.get("top",[]):
  if not isinstance(x,dict):continue
  n=finite(x.get(field))
  if n is None or n<=0:continue
  add("BNB Chain",label,x.get("route","DEX route"),"PRICE_MODEL_ONLY",source,
      "Positive reserve/quote math is not a transaction. Must reproduce with atomic flash financing, exact gas and payout token.",n,
      proof={"block":doc.get("block"),"amount":x.get("amount",x.get("amountUsdApprox"))})

sol=docs["solana-keepers.json"] or {}
for x in sol.get("velocityMarkets",[]):
 if not isinstance(x,dict):continue
 count=int(x.get("potentialMatchSignals") or 0)
 if count:
  add("Solana","Velocity keeper matcher",x.get("market","perp market"),
      "ORDER_BOOK_CROSSED_ONLY","solana-keepers.json",
      f"{count} crossed book candidate(s); neither fillable instructions nor keeper reward yet simulated.")

for x in sol.get("liquidationHistory",[]):
 if not isinstance(x,dict):continue
 # Past liquidation receipts are NEVER opportunities; intentionally skip queue.
 pass

# Higher confirmed economic ceiling wins, but invalid and stale evidence is discounted.
priority={"READ_ONLY_CALL_OK":4,"NEEDS_SWAP_AND_FORK":3,"NEEDS_CALL_SIM":2,
          "RPC_RECEIPT_ONLY":1,"CALL_QUOTE_ONLY":1,"PRICE_MODEL_ONLY":0,
          "ORDER_BOOK_CROSSED_ONLY":0}
queue.sort(key=lambda q:(q["sourceFresh"],priority.get(q["status"],0),q.get("upperBoundUsd") or -1),reverse=True)
for index,p in enumerate(queue):
 p["rank"]=index+1
 p["dispatchReady"]=False   # no configured capital wallet or complete executor

ledger=docs["capture-ledger.json"] or {}
proof=ledger.get("forkNetProfitVerified") or {}
sums={}
for x in [
 ("minuteUsd","lastMinuteUsd"),("hourUsd","lastHourUsd"),("totalUsd","totalUsd"),
 ("uniquePositive","verifiedPositiveActions"),("atomicReceiptsOk","atomicReceiptsOk"),
 ("walletBalanceVerifications","atomicsWithVerifiedWalletDeltas")]:
 sums[x[0]]=finite(proof.get(x[1])) if docs["capture-ledger.json"] is not None else None

bad=[f for f,x in health.items() if x["status"]!="FRESH"]
report={
 "schema":1,"generatedAt":NOW.isoformat(timespec="seconds").replace("+00:00","Z"),
 "mode":"AUTONOMOUS_READ_ONLY_ROUTER",
 "automation":"Scheduled on GitHub Actions. Freshness depends on GitHub scheduler; not per-block HFT.",
 "targetNetEURPerMinute":50,"targetNetEURPerHour":3000,"targetNetEURPerDay":72000,
 "economicSafetyGate":"ONLY FINAL SETTLED WALLET DELTAS AFTER ALL FEES COUNT",
 "realExecutionEnabled":False,"walletMainnetConnected":False,"walletProfitMainnetEUR":None,
 "proofNetSimulatedUsd":sums,
 "signalQueue":queue[:70],"queueTotal":len(queue),
 "actionableNow":0, "dispatchReady":0,
 "sourceStatus":health,"degradedSources":bad,"degradedCount":len(bad),
 "ecosystems":{
  "Morpho":{"totalUnderwaterAPI":sum(int(x.get("atRisk") or 0) for x in evm.get("networks",[])),
            "onchainScreened":len(evm.get("positions",[])),
            "grossUpperBoundPositive":sum(1 for x in evm.get("positions",[]) if (finite(x.get("preSwapUpperBoundUsd")) or 0)>0)},
  "Sky":{"contractsInspected":sky.get("monitoredClippers"),"redoEligible":sky.get("redoCandidates")},
  "Curve":{"inspected":keeper.get("marketsChecked"),"positiveAfterGasEstimate":keeper.get("marketsPositiveAfterEstimatedGas")},
  "BeefyBase":{"liveStrategies":beef.get("strategiesActive"),"positiveAfterSafetyMargin":beef.get("positiveAfterSafetyMargin")},
  "Solana":{"kaminoTransactionsSampled":sol.get("transactionsReturned"),
            "recentLiquidations":sol.get("liquidationsDetectedInCurrentSample"),
            "l3Orders":sol.get("velocityOrderCount"),"l3Crosses":sol.get("potentialCrosses")},
  "BNB":{"optimalCycles":(docs["triangles.json"] or {}).get("amountsSampled"),
          "candidateCyclesPositiveAfterAssumptions":(docs["triangles.json"] or {}).get("indicativePositivePaths")}
 },
 "whyZero":
 "No transaction has demonstrated a settled strictly positive profit after all expenses. "
 "Live market volume is not a fee entitlement; provisional quotes never become wallet profit.",
 "nextExecutionGate":[
  "Build official protocol instructions and flash callback",
  "Simulate complete bundle against a block/slot fork",
  "Assert lending repayment and stablecoin payout",
  "Measure gas, priority fees, slippage, slashing and inclusion competitiveness",
  "Deduplicate opportunity by block/slot and economic event",
  "Require risk-limit approval before any real wallet action"
 ]
}
(DIR/"commander.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({"sourceHealth":{k:v["status"] for k,v in health.items()},
 "queueTotal":report["queueTotal"],"leading":report["signalQueue"][:2],
 "proofUSD":sums,"actionableNow":report["actionableNow"]},ensure_ascii=False))
