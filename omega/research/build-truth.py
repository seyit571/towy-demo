#!/usr/bin/env python3
"""Combine OMEGA read-only probes. Fail closed: don't overwrite valid reports with unverified data."""
from pathlib import Path
import datetime
import json
import os

root = Path(os.environ.get("OMEGA_RESEARCH_DIR", "/tmp/omega-evm"))
target = Path(os.environ.get("OMEGA_OUTPUT_PATH", str(root / "truth-v3.json")))
tri = json.loads((root / "tri-results.json").read_text())
beefy = json.loads((root / "beefy-report.json").read_text())
trace = json.loads((root / "beefy-trace-report.json").read_text())

if tri.get("samples", 0) < 1000:
    raise RuntimeError("Insufficient independently quoted AMM scenarios")
if trace.get("tested", 0) < 5 or trace.get("tracedSuccess", 0) < 3:
    raise RuntimeError("Insufficient successful beneficiary traces; refuse to publish")
networks = []
for chain in beefy.get("reports", []):
    if not isinstance(chain.get("results"), list):
        continue
    networks.append(
        {
            "chain": chain["chain"],
            "strategiesChecked": chain.get("selected", 0),
            "positiveCallReward": chain.get("positiveReward", 0),
            "positivePreflightAfterGas": chain.get("positiveAfterGas", 0),
        }
    )
rewards = []
for v in trace["rows"]:
    rewards.append(
        {
            k: v.get(k)
            for k in (
                "name",
                "strategy",
                "quotedRewardUSD",
                "actualTraceRewardUSD",
                "traceGasUsed",
                "gasUSDEst",
                "netAfterGasUSD",
                "eligible",
                "error",
            )
        }
    )
out = {
    "version": 3,
    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "bscOptimizer": {
        "timestamp": tri["timestamp"],
        "block": tri["block"],
        "pools": tri["poolsObserved"],
        "routes": tri["uniqueRoutes"],
        "tested": tri["samples"],
        "positiveAfterAssumptions": tri["positiveRoutesAtBest"],
        "flashFeeAssumedBps": tri["assumptions"]["flashFeeBps"],
        "best": [
            {
                k: v.get(k)
                for k in (
                    "route",
                    "legs",
                    "inputUsdt",
                    "grossUsdt",
                    "flashCostUsdt",
                    "gasCostUsdt",
                    "netUsdt",
                )
            }
            for v in tri["top"][:8]
        ],
    },
    "beefy": {
        "timestamp": trace["timestamp"],
        "block": trace["block"],
        "networks": networks,
        "traced": trace["tested"],
        "traceSuccess": trace["tracedSuccess"],
        "positiveAfterTraceAndGas": trace["netPositive"],
        "rewards": sorted(
            rewards,
            key=lambda x: (x.get("netAfterGasUSD") is None, -(x.get("netAfterGasUSD") or 0)),
        ),
    },
    "realizedUsd": 0,
    "verifiedPositiveAtomicUsd": 0,
    "methodology": (
        "Rewards verified via simulated WETH/ERC20 Transfer logs to beneficiary from "
        "debug_traceCall, minus estimated inclusion gas at current fee. All data "
        "is pre-execution; no realized trades. Do not extrapolate to per-minute revenue."
    ),
}
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(
    "COMBINED",
    out["bscOptimizer"]["tested"],
    "scenarios,",
    out["beefy"]["traced"],
    "keeper traces,",
    out["beefy"]["positiveAfterTraceAndGas"],
    "profitable",
)
