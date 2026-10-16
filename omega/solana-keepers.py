#!/usr/bin/env python3
"""OMEGA Solana keeper flow: Kamino onchain liquidation-event observatory + Velocity L3.
No wallet; no signed actions; no fictional fee rewards or simulated trades.
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import math
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(parents=True, exist_ok=True)
NOW = dt.datetime.now(dt.timezone.utc)
KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
]
L3 = "https://dlob.velocity.exchange/l3"
MARKETS = ["SOL-PERP", "BTC-PERP", "ETH-PERP", "HYPE-PERP", "JUP-PERP", "WIF-PERP"]
UA = {"User-Agent": "OMEGA-ReadOnly-FlowMonitor/1.0", "Accept": "application/json"}
ERRORS = []


def request(url, json_body=None, timeout=10):
    body = json.dumps(json_body).encode() if json_body is not None else None
    headers = {**UA, "Content-Type": "application/json"} if body else UA
    q = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(q, timeout=timeout) as r:
        return json.load(r)


def rpc(method, params, timeout=12):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    last = None
    for endpoint in RPCS:
        try:
            doc = request(endpoint, payload, timeout)
            if "error" in doc:
                raise ValueError(str(doc["error"])[:160])
            return doc.get("result")
        except Exception as exc:
            last = f"{endpoint}: {type(exc).__name__}: {str(exc)[:100]}"
    raise RuntimeError(last)


def scan_orders(market):
    from urllib.parse import urlencode
    url = L3 + "?" + urlencode({"marketName": market, "marketType": "perp"})
    doc = request(url, timeout=9)
    ms = doc.get("ts")
    age_seconds = (NOW.timestamp() * 1000 - float(ms)) / 1000 if ms else None
    if age_seconds is None or not math.isfinite(age_seconds) or age_seconds < -10 or age_seconds > 30:
        raise ValueError(f"stale L3 snapshot (age={age_seconds})")
    bids, asks = doc.get("bids"), doc.get("asks")
    if not isinstance(bids, list) or not isinstance(asks, list):
        raise ValueError("L3 malformed bids/asks")

    valid = lambda x: isinstance(x, dict) and x.get("maker") and x.get("orderId") is not None and int(x.get("price") or 0) > 0 and int(x.get("size") or 0) > 0
    bid = [x for x in bids if valid(x)]
    ask = [x for x in asks if valid(x)]
    best_bid = float(bid[0]["price"]) / 1e6 if bid else None
    best_ask = float(ask[0]["price"]) / 1e6 if ask else None
    spread = (best_ask - best_bid) / ((best_bid + best_ask) / 2) * 10000 if best_bid and best_ask else None
    crosses = []
    # Crossed book alone is NOT a fillable order. Makers may self-cross or be stale.
    for b in bid[:8]:
        for a in ask[:8]:
            if int(b["price"]) >= int(a["price"]) and b["maker"] != a["maker"]:
                crosses.append({
                    "bidMaker": b["maker"], "askMaker": a["maker"],
                    "bidId": b["orderId"], "askId": a["orderId"],
                    "bidPriceUsd": int(b["price"]) / 1e6,
                    "askPriceUsd": int(a["price"]) / 1e6,
                    "maxBaseUnitsRaw": min(int(b["size"]), int(a["size"])),
                    "fillable": False, "feeRewardVerified": False,
                })
    return {
        "market": market, "status": "ok", "l3AgeSec": round(age_seconds, 3),
        "bids": len(bid), "asks": len(ask), "orders": len(bid) + len(ask),
        "bestBid": best_bid, "bestAsk": best_ask,
        "spreadBps": round(spread, 3) if spread is not None else None,
        "crosses": crosses[:6], "potentialMatchSignals": len(crosses),
        "executionSimulated": False,
    }


def get_tx(signature):
    doc = rpc("getTransaction", [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}])
    if not isinstance(doc, dict):
        return None
    meta = doc.get("meta") or {}
    if meta.get("err") is not None:
        return None
    logs = meta.get("logMessages") or []
    wanted = [
        x for x in logs if
        "Instruction: LiquidateObligationAndRedeemReserveCollateral" in x
    ]
    if not wanted:
        return {"signature": signature, "liquidation": False}
    return {
        "signature": signature, "liquidation": True,
        "slot": doc.get("slot"), "blockTime": doc.get("blockTime"),
        "instructions": sorted(set(x.split("Instruction: ", 1)[-1] for x in wanted)),
        "rpcStatus": "CONFIRMED_SUCCESS",
        "repaymentAmountUsd": None,
        "liquidatorBonusUsd": None,
        "profitableForOmega": False,
        "simulatedByOmega": False,
    }


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(scan_orders, market): market for market in MARKETS}
        orders = []
        for f, m in futures.items():
            try:
                orders.append(f.result(timeout=17))
            except Exception as e:
                ERRORS.append(f"Velocity {m}: {type(e).__name__}: {str(e)[:110]}")
                orders.append({"market": m, "status": "unavailable", "orders": None, "potentialMatchSignals": 0})

    signatures = []
    try:
        signatures = rpc("getSignaturesForAddress", [KLEND, {"limit": 100}], timeout=10) or []
    except Exception as exc:
        ERRORS.append("Kamino signatures: " + str(exc)[:170])

    success = [x for x in signatures if isinstance(x, dict) and x.get("signature") and not x.get("err")]
    successful_sample = success[:18]
    transactions = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(get_tx, x["signature"]): x for x in successful_sample}
        for task, signature in futures.items():
            try:
                result = task.result(timeout=30)
                if result is not None:
                    transactions.append(result)
            except Exception as exc:
                ERRORS.append("Kamino transaction " + signature["signature"][:10] + ": " + str(exc)[:100])

    liquidation_new = [x for x in transactions if x.get("liquidation")]
    history_path = DATA / "solana-keeper-history.json"
    try:
        history = json.loads(history_path.read_text())
        if not isinstance(history, list):
            history = []
    except (ValueError, OSError):
        history = []
    seen = {x.get("signature") for x in history if isinstance(x, dict)}
    for x in liquidation_new:
        if x["signature"] not in seen:
            history.append(x)
            seen.add(x["signature"])
    history = history[-400:]
    history_path.write_text(json.dumps(history, indent=2) + "\n")
    now = NOW.isoformat(timespec="seconds").replace("+00:00", "Z")
    result = {
        "schema": 1, "observedAt": now, "mode": "READ_ONLY",
        "kaminoProgramId": KLEND, "liquidationsDetectedInCurrentSample": len(liquidation_new),
        "liquidationsUniquelyObservedAcrossRuns": len(history),
        "transactionsSuccessfulSampled": len(successful_sample),
        "transactionsReturned": len(transactions),
        "recentSignaturesFetched": len(signatures),
        "liquidationHistory": history[-25:],
        "velocityMarkets": orders,
        "velocityOrderCount": sum(x["orders"] or 0 for x in orders),
        "potentialCrosses": sum(x["potentialMatchSignals"] for x in orders),
        "matchableOnchainConfirmed": 0, "atomicTransactionsSimulated": 0,
        "netEligibleProfitUsd": 0, "realizedProfitUsd": None,
        "errors": ERRORS[:30],
        "limitations": (
            "Recent Kamino program signature SAMPLE ONLY (at most 100 latest, 18 decoded). "
            "Liquidation transactions are historical actions taken by someone else, not opportunities "
            "our bot can still capture. Velocity L3 book may not be matchable even if it crosses. "
            "No wallet, executable Solana instruction bundle, priority fee or liquidation profit "
            "settlement is currently validated. No double counting across snapshots."
        )
    }
    (DATA / "solana-keepers.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({
        "observedAt": now, "kaminoSignatures": len(signatures),
        "successSampled": len(successful_sample),
        "liquidationTx": len(liquidation_new), "totalRecorded": len(history),
        "orders": result["velocityOrderCount"], "crosses": result["potentialCrosses"],
        "errors": len(ERRORS)
    }))


if __name__ == "__main__":
    main()
