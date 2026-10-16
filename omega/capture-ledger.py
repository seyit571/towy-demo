#!/usr/bin/env python3
"""OMEGA capture ledger v1 — deterministic, non-replaying, read-only accounting.

Never turns observed market volume, quoted incentive, historical rival profit,
failed simulation, repeat execution or an unconverted token into P&L.
Exact wallet-delta settlement is required to count a simulated positive.
A funding/execution wallet has not been connected, so no actual realized P&L is claimed.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
NOW = dt.datetime.now(dt.timezone.utc)
UTC = dt.timezone.utc

def load(name):
    p = DATA / name
    try:
        doc = json.loads(p.read_text())
        return doc if isinstance(doc, dict) else None
    except (ValueError, OSError):
        return None

def num(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None

def iso(value):
    if not value:
        return None
    try:
        t = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if t.tzinfo is None:
            return None
        return t.astimezone(UTC)
    except ValueError:
        return None

def safe_id(*parts):
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:20]

proofs = []
source_status = {}
datasets = {}
for f in ("atomic-fork.json", "beefy-fork.json", "beefy-base.json",
          "truth-v3.json", "snapshot.json", "triangles.json", "bsc-v3.json",
          "sky.json", "evm.json", "bsc.json", "beefy-base-anvil.json"):
    doc = load(f)
    datasets[f] = doc
    stamp = doc.get("timestamp") or doc.get("capturedAt") if doc else None
    source_status[f] = {"available": doc is not None, "sourceTimestamp": stamp}

# 1) Actual atomic receipts on BNB fork. BSW proceeds were *not sold for USDT*;
# consequently reported USD is only indicative and not acceptable as proven net USD.
atomic = datasets["atomic-fork.json"] or {}
for i, row in enumerate(atomic.get("attempts") or []):
    if not isinstance(row, dict):
        continue
    completed = row.get("atomic") is True and row.get("success") is True
    tx = row.get("txHash")
    net = num(row.get("netUSDIllustrative"))
    proofs.append({
        "id": safe_id("bsc-atomic-fork", atomic.get("sourceBlock"), tx or f"failure-{i}"),
        "network": "BNB Chain", "mechanism": "Pancake/Biswap flash swap",
        "mode": "FORK_ATOMIC" if completed else "FORK_REVERTED",
        "source": "atomic-fork.json", "block": atomic.get("sourceBlock"),
        "receipt": tx if completed else None, "completed": completed,
        "recipientBalanceVerified": completed,
        "sourceTimestamp": None,  # file contains no authoritative run timestamp
        "payoutToken": "BSW", "netUsdIndicative": net,
        "fullySettledNet": False,
        "profitEligible": False,
        "reason": "BSW payout not converted to verified stablecoin net of liquidation"
                  if completed else "transaction reverted; fork gas may be paid",
    })

# 2) Genuine wallet delta, native BNB plus WBNB credit minus the paid gas.
beefy = datasets["beefy-fork.json"] or {}
for row in beefy.get("examples") or []:
    if not isinstance(row, dict):
        continue
    completed = row.get("atomicExecutionSucceeded") is True
    native = num(row.get("nativeDeltaBNB"))
    wrapped = num(row.get("walletCreditWBNB"))
    netBNB = num(row.get("netAfterGasBNB"))
    netUsd = num(row.get("netAfterGasUsd"))
    consistent = (
        completed and native is not None and wrapped is not None
        and netBNB is not None and netUsd is not None
        and abs((native + wrapped) - netBNB) <= 1e-10
        and bool(row.get("transactionHashFork"))
    )
    proofs.append({
        "id": safe_id("beefy-bnb-fork", beefy.get("forkBlock"), row.get("strategy")),
        "network": "BNB Chain", "mechanism": "Beefy harvest caller reward",
        "mode": "FORK_ATOMIC" if completed else "FORK_REVERTED",
        "source": "beefy-fork.json", "block": beefy.get("forkBlock"),
        "receipt": row.get("transactionHashFork") if completed else None,
        "completed": completed, "recipientBalanceVerified": consistent,
        "sourceTimestamp": beefy.get("timestamp"), "payoutToken": "WBNB+BNB",
        "netUsdIndicative": netUsd,
        "fullySettledNet": consistent, "profitEligible": consistent and netBNB > 0,
        "reason": "native + wrapped balance difference after execution and gas"
                  if consistent else "wallet delta not fully verified",
    })

# 3) eth_simulateV1: actual logs may be visible, but no *fork wallet receipt*.
base = datasets["beefy-base.json"] or {}
for x in base.get("candidates") or []:
    if not isinstance(x, dict):
        continue
    profit = num(x.get("netBeforeL1DataFeeETH"))
    proofs.append({
        "id": safe_id("beefy-base-eth-sim", base.get("timestamp"), x.get("address")),
        "network": "Base", "mechanism": "Beefy harvest RPC simulation",
        "mode": "RPC_PREFLIGHT", "source": "beefy-base.json",
        "block": x.get("blockNumber"), "receipt": None,
        "completed": x.get("success") is True, "recipientBalanceVerified": False,
        "sourceTimestamp": base.get("timestamp"), "payoutToken": "WETH",
        "netUsdIndicative": None, "fullySettledNet": False,
        "profitEligible": False,
        "reason": "No fork wallet receipt; excludes L1 data fee; net ETH before L1 fee: " + str(profit),
    })

# Dedup *economic action* across identical receipts or target+block.
unique = {}
for item in proofs:
    unique[item["id"]] = item
proofs = list(unique.values())

# One economic opportunity is countable only once for its market/block.
# Multiple flash-size optimizations of the same pools and block are alternatives,
# not independent revenue events. Keep the best validated opportunity only.
candidates = [p for p in proofs if p["profitEligible"] is True
              and (num(p["netUsdIndicative"]) or 0) > 0]
current_by_opportunity = {}
for p in candidates:
    group = (p["network"], p["mechanism"], p["block"],
             "FLASH_POOL_PAIR" if p["mechanism"] == "Pancake/Biswap flash swap"
             else p["id"])
    economic_key = safe_id(*group)
    candidate = dict(p, economicKey=economic_key)
    old = current_by_opportunity.get(economic_key)
    if old is None or candidate["netUsdIndicative"] > old["netUsdIndicative"]:
        current_by_opportunity[economic_key] = candidate

# Persist accepted independent captures across scheduled scans, not just the
# latest status snapshot. Verified fork gains remain separate from mainnet.
history_path = DATA / "capture-history.json"
try:
    historical = json.loads(history_path.read_text())
    historical = historical if isinstance(historical, list) else []
except (OSError, ValueError):
    historical = []
history = {}
for p in historical:
    if (isinstance(p, dict) and p.get("economicKey")
            and p.get("profitEligible") is True and
            (num(p.get("netUsdIndicative")) or 0) > 0):
        history[p["economicKey"]] = p
for key, p in current_by_opportunity.items():
    if key not in history:
        history[key] = p
positive = list(history.values())
history_path.write_text(json.dumps(positive[-10000:], indent=2, ensure_ascii=False) + "\n")
now_secs = NOW.timestamp()
def within(seconds):
    return [p for p in positive
            if (t := iso(p["sourceTimestamp"])) is not None
            and 0 <= now_secs - t.timestamp() < seconds]

def profit_usd(events):
    return round(sum(num(e["netUsdIndicative"]) or 0 for e in events), 8)

# No private keys, live wallet, funding transactions or signed mainnet actions.
# P&L realized is NOT sampled from user wallet: a null means "unverified".
report = {
    "schema": 1, "generatedAt": NOW.isoformat(timespec="seconds").replace("+00:00", "Z"),
    "accounting": "receipt and balance delta only, snapshot-deduplicated, no historical replay",
    "liveExecutionEnabled": False, "mainnetWalletConnected": False,
    "realizedMainnetTotalUsd": None,
    "realizedMainnetLastMinuteUsd": None,
    "realizedMainnetLastHourUsd": None,
    "actualTransactionsSentByOmega": 0,
    "forkNetProfitVerified": {
        "lastMinuteUsd": profit_usd(within(60)),
        "lastHourUsd": profit_usd(within(3600)),
        "totalUsd": profit_usd(positive),
        "verifiedPositiveActions": len(positive),
        "deduplicatedActions": len(proofs),
        "atomicReceiptsOk": sum(x["mode"] == "FORK_ATOMIC" and x["completed"] for x in proofs),
        "atomicsWithVerifiedWalletDeltas": sum(x["mode"] == "FORK_ATOMIC" and x["recipientBalanceVerified"] for x in proofs),
        "quoteOnlyExcluded": True,
    },
    "tested": {
        "forkFlashRoutes": len(atomic.get("attempts") or []),
        "forkBeefyHarvests": len(beefy.get("examples") or []),
        "baseRpcHarvestPreflights": len(base.get("candidates") or []),
        "stablecoinRoutesEvaluated": ((datasets["triangles.json"] or {}).get("amountsSampled")),
        "bscV3PriceScenarios": ((datasets["bsc-v3.json"] or {}).get("scenarioCount")),
    },
    "sources": source_status,
    "actions": proofs[:120],
    "disclaimer": (
        "Simulated wallet profits require atomic receipts and non-replayed token balance "
        "deltas after gas and fees. A failure or indicative price quote never counts as profit. "
        "A positive fork test is not a promise of mainnet capture. No wallet connected, "
        "therefore realized balance is unavailable rather than invented."
    )
}
(DATA / "capture-ledger.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({
    "time": report["generatedAt"], "unique_proofs": len(proofs),
    "atomic_completed": report["forkNetProfitVerified"]["atomicReceiptsOk"],
    "wallet_verified": report["forkNetProfitVerified"]["atomicsWithVerifiedWalletDeltas"],
    "positive": len(positive), "minUSD": report["forkNetProfitVerified"]["lastMinuteUsd"],
    "hourUSD": report["forkNetProfitVerified"]["lastHourUsd"],
    "totalUSD": report["forkNetProfitVerified"]["totalUsd"],
    "sources_ok": sum(x["available"] for x in source_status.values()),
}, ensure_ascii=False));
