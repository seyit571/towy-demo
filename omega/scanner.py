#!/usr/bin/env python3
"""OMEGA Quant read-only market snapshots. No keys, no transactions, no profit guarantees."""
import json
import os
import time
import datetime
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(parents=True, exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
UA = {"User-Agent": "OMEGA-Quant-Shadow/2.0", "Accept": "application/json"}
SOL = "So11111111111111111111111111111111111111112"
TOKENS = {
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNvSZezyQPzfwD",
    "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "RAY": "4k3Dyjzvzp8eMZWUXbWuo4U8oXc78gq9jRprQe6K87CP",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCaKGj7sZXqoQ2WEzJd",
}
CHAINS = {8453: "Base", 1: "Ethereum", 42161: "Arbitrum", 10: "Optimism", 137: "Polygon", 130: "Unichain", 480: "World Chain", 4663: "Robinhood", 999: "HyperEVM", 143: "Monad"}
SLIPPAGE_BPS = 50
FEE_ASSUMED_SOL = 0.00005
errors = []

def get(url, timeout=14):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)

def post(url, body, timeout=15):
    req = urllib.request.Request(url, json.dumps(body).encode(), headers={**UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)

def usd(x):
    try: return round(float(x), 3)
    except (ValueError, TypeError): return 0

def morpho(chain):
    q = """query Risk($ids:[Int!],$threshold:Float!,$first:Int!){
      marketPositions(first:$first,orderBy:HealthFactor,orderDirection:Asc,
        where:{chainId_in:$ids,healthFactor_lte:$threshold,marketListed:true}){
        pageInfo{countTotal} items{
          healthFactor user{address}
          market{marketId loanAsset{symbol} collateralAsset{symbol}}
          state{borrowAssetsUsd collateralUsd}
        }
      }
    }"""
    data = post("https://api.morpho.org/graphql", {
        "query": q, "variables": {"ids": [chain], "threshold": 1.02, "first": 100}})
    if data.get("errors"):
        raise RuntimeError(str(data["errors"][0])[:180])
    info = data["data"]["marketPositions"]
    items = info["items"]
    sample = [{
        "borrower": x.get("user", {}).get("address", ""),
        "marketId": x.get("market", {}).get("marketId", ""),
        "collateral": (x.get("market", {}).get("collateralAsset") or {}).get("symbol", "?"),
        "loan": (x.get("market", {}).get("loanAsset") or {}).get("symbol", "?"),
        "healthFactor": round(float(x.get("healthFactor") or 0), 6),
        "borrowUsd": usd((x.get("state") or {}).get("borrowAssetsUsd")),
    } for x in items]
    return {
        "chain": CHAINS[chain], "chainId": chain, "countAtRisk": info["pageInfo"]["countTotal"],
        "sampleCount": len(sample), "sampleUnder1": sum(x["healthFactor"] < 1 for x in sample),
        "sampleDebtUsd": round(sum(x["borrowUsd"] for x in sample), 2),
        "positions": sample[:30], "status": "ok",
    }

def quote(mint_in, mint_out, amount):
    params = urllib.parse.urlencode({
        "inputMint": mint_in, "outputMint": mint_out,
        "amount": str(int(amount)), "slippageBps": str(SLIPPAGE_BPS),
        "restrictIntermediateTokens": "true",
    })
    time.sleep(2.1)  # protect shared keyless Jupiter rate limits
    url = "https://lite-api.jup.ag/swap/v1/quote?" + params
    try:
        return get(url, timeout=12)
    except urllib.error.HTTPError as e:
        if e.code != 429:
            raise
        time.sleep(12)
        return get(url, timeout=12)

def price_sol():
    q = quote(SOL, TOKENS["USDC"], 10**9)
    return int(q["outAmount"]) / 1_000_000

def jupiter_scan(price):
    result = []
    # Every two-leg quote is an indicative non-atomic market observation, not a replay
    # of a broadcastable transaction. We do NOT classify any as executable.
    for token_name, mint in list(TOKENS.items())[:3]:
        for amount_sol in (0.5, 1):
            try:
                n = int(amount_sol * 10**9)
                q1 = quote(SOL, mint, n)
                q2 = quote(mint, SOL, int(q1["outAmount"]))
                out = int(q2["outAmount"]) / 10**9
                mid = out - amount_sol
                after_fee = mid - FEE_ASSUMED_SOL
                after_buffer = out * (1 - SLIPPAGE_BPS / 10000) ** 2 - amount_sol - FEE_ASSUMED_SOL
                result.append({
                    "route": "SOL→" + token_name + "→SOL",
                    "token": token_name, "inputSol": amount_sol,
                    "quotedReturnSol": round(out, 9),
                    "quotedGrossSol": round(mid, 9),
                    "quotedNetFeeAssumptionUsd": round(after_fee * price, 5),
                    "stressNetUsd": round(after_buffer * price, 5),
                    "feeAssumptionSol": FEE_ASSUMED_SOL,
                    "slippageStressBpsEachLeg": SLIPPAGE_BPS,
                    "route1": [p["swapInfo"].get("label", "") for p in q1.get("routePlan", [])],
                    "route2": [p["swapInfo"].get("label", "") for p in q2.get("routePlan", [])],
                    "executableVerified": False,
                    "onchainSimulated": False,
                })
            except Exception as exc:
                errors.append("Jupiter " + token_name + " " + str(amount_sol) + "SOL: " + str(exc)[:90])
            time.sleep(0.25)
    result.sort(key=lambda x: x["stressNetUsd"], reverse=True)
    return result

def raydium():
    q = urllib.parse.urlencode({
        "poolType": "all", "poolSortField": "volume24h",
        "sortType": "desc", "pageSize": "15", "page": "1"})
    d = get("https://api-v3.raydium.io/pools/info/list?" + q)
    if not d.get("success"): raise RuntimeError("Raydium returned unsuccessful status")
    pools = d["data"]["data"]
    out = [{
        "name": (x.get("mintA") or {}).get("symbol", "?") + "/" + (x.get("mintB") or {}).get("symbol", "?"),
        "address": x.get("id", ""), "type": x.get("type", ""),
        "volume24hUsd": usd((x.get("day") or {}).get("volume")), "tvlUsd": usd(x.get("tvl"))
    } for x in pools]
    return {"samplePoolCount": len(out), "sampleVolume24hUsd": round(sum(x["volume24hUsd"] for x in out),2),
            "sampleTvlUsd": round(sum(x["tvlUsd"] for x in out),2), "pools": out, "status": "ok"}

def kamino():
    data = get("https://api.kamino.finance/strategies?env=mainnet-beta&status=LIVE", timeout=20)
    if not isinstance(data, list): raise RuntimeError("Kamino response not a list")
    types = {}
    for x in data:
        k = str(x.get("type") or "UNKNOWN")
        types[k] = types.get(k, 0) + 1
    return {"strategiesCount": len(data), "types": types, "status": "ok"}

def run_one(label, fn):
    try: return fn()
    except Exception as e:
        errors.append(label + ": " + str(e)[:220])
        return {"status":"error","message":str(e)[:130]}

snapshot = {
    "schema": 2, "capturedAt": NOW, "mode": "READ_ONLY",
    "realizedProfitUsd": 0, "onchainSimulatedProfitUsd": None, "executedTransactions": 0,
    "caveat": "Jupiter quotes are sequential, non-atomic estimates; they do not establish flashloan feasibility, liquidations or wallet profits.",
}
snapshot["morpho"] = [run_one(n, lambda c=c: morpho(c)) for c,n in CHAINS.items()]
snapshot["raydium"] = run_one("Raydium", raydium)
snapshot["kamino"] = run_one("Kamino", kamino)
price = run_one("Jupiter SOL price", price_sol)
snapshot["solPriceUsd"] = price if isinstance(price, (int,float)) else None
snapshot["jupiter"] = run_one("Jupiter cycles", lambda: jupiter_scan(price)) if isinstance(price, (int,float)) else []
snapshot["jupiterQuoteTotal"] = len(snapshot["jupiter"]) if isinstance(snapshot["jupiter"], list) else 0
snapshot["jupiterQuotedPositive"] = sum(x["quotedNetFeeAssumptionUsd"] > 0 for x in snapshot["jupiter"]) if isinstance(snapshot["jupiter"], list) else 0
snapshot["jupiterStressPositive"] = sum(x["stressNetUsd"] > 0 for x in snapshot["jupiter"]) if isinstance(snapshot["jupiter"], list) else 0
snapshot["errors"] = errors[:60]
p = DATA / "snapshot.json"
p.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n")
history_file = DATA / "history.json"
try:
    old = json.loads(history_file.read_text()) if history_file.exists() else []
    if not isinstance(old, list): old = []
except Exception:
    old = []
old.append({
    "time": NOW, "marketsScanned": sum(x.get("countAtRisk",0) or 0 for x in snapshot["morpho"]),
    "jupiterQuotes": snapshot["jupiterQuoteTotal"], "jupiterPositive": snapshot["jupiterQuotedPositive"],
    "jupiterStressPositive": snapshot["jupiterStressPositive"], "realizedUsd": 0,
})
history_file.write_text(json.dumps(old[-300:], ensure_ascii=False, separators=(",", ":")) + "\n")
print(json.dumps({
    "timestamp": NOW, "morpho_chains": [(x.get("chain"),x.get("countAtRisk")) for x in snapshot["morpho"]],
    "jupiter_quotes": snapshot["jupiterQuoteTotal"], "quoted_positive": snapshot["jupiterQuotedPositive"],
    "stress_positive": snapshot["jupiterStressPositive"], "raydium_volume_24h_sample": snapshot["raydium"].get("sampleVolume24hUsd"),
    "kamino_strategies": snapshot["kamino"].get("strategiesCount"), "errors": len(errors)
}, ensure_ascii=False))
