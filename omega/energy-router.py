#!/usr/bin/env python3
"""OMEGA ENERGY ROUTER — real public buyer bids vs. executable supplier price quotes.

Market quotes are NONBINDING, and fulfilment is NOT proven: TronBid seller
payouts require delegated resources from an authorized seller wallet. Buying
delegation from another supplier into a third party's wallet is NOT, by itself,
a valid seller fill. No live orders, payments, signatures or transfers here.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import re
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup

DIR=Path(__file__).resolve().parent/"data"
DIR.mkdir(parents=True,exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc)
UA={"User-Agent":"Mozilla/5.0 (compatible; OMEGA-Research/1.0)","Accept":"application/json,text/html"}
errors=[]
def get(url,timeout=13):
    with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=timeout) as r:
        return r.read().decode("utf-8","replace")
def getj(url,timeout=13):
    return json.loads(get(url,timeout))
def quant(t):
    t=str(t).replace(",","").strip().upper()
    k=1000000 if t.endswith("M") else 1000 if t.endswith("K") else 1
    if k!=1:t=t[:-1]
    return round(float(t)*k)
def finite(x):
    try:
        n=float(x)
        return n if math.isfinite(n) else None
    except (TypeError,ValueError):return None
def parse_public_tronbid():
    soup=BeautifulSoup(get("https://tronbid.com/en"),"html.parser")
    bid_header=next((x for x in soup.find_all(string=True) if x.strip()=="Buyer orders"),None)
    if bid_header is None:
        raise RuntimeError("TronBid buyer section missing")
    card=bid_header.find_parent("div",class_=lambda c:c and "rounded-xl" in c.split())
    if card is None:raise RuntimeError("TronBid public buyer section container missing")
    rows=[]
    seen=set()
    for row in card.find_all("div",class_=lambda c:c and "grid-cols-[minmax(0,1.05fr)_minmax(0,.62fr)_minmax(0,.72fr)_minmax(0,1fr)_auto]" in c):
        t=" ".join(row.stripped_strings)
        if not t.endswith("Sell") or "SUN" not in t:continue
        a=re.search(r"([\d,]+)\s+(\d+)\s+(Minutes?|Hours?|Days?)",t,re.I)
        p=re.search(r"([\d,.]+)\s+SUN\b",t,re.I)
        f=re.search(r"([\d,.]+[KM]?)\s*/\s*([\d,.]+[KM]?)",t,re.I)
        if not a or not p:continue
        amount=int(a.group(1).replace(",",""))
        duration_n=int(a.group(2))
        duration_type=a.group(3).lower()
        key=f"{duration_n}{duration_type[0]}"
        used=quant(f.group(1)) if f else 0
        remaining=max(0,amount-used)
        one={"venue":"TronBid","duration":key,"label":f"{duration_n} {duration_type}","amount":amount,
            "filledApprox":used,"remainingApprox":remaining,
            "bidSunPerUnitPerDay":finite(p.group(1)),"publicRow":t[:260],
            "sourceUrl":"https://tronbid.com/en",
            "canSellerFulfillWithThirdPartyResource":False}
        sig=(key,amount,p.group(1),used)
        if sig not in seen:rows.append(one);seen.add(sig)
    return rows
def tronenergize_orders():
    j=getj("https://tronenergize.com/api/v1/market")
    rows=[]
    for x in j.get("data") or []:
        label=str(x.get("duration","")).lower()
        if "days" in label or "day" in label:unit="d"
        elif "hour" in label:unit="h"
        else:continue
        m=re.search(r"(\d+)",label)
        if not m:continue
        raw=str(x.get("price") or "")
        n=re.search(r"([\d.]+)",raw)
        if not n:continue
        rows.append({"venue":"TronEnergize","duration":m.group(1)+unit,"label":label,
                     "amount":int(x.get("energy") or 0),"remainingApprox":int(x.get("energy") or 0),
                     "bidSunPerUnitPerDay":float(n.group(1)),"sourceId":x.get("id"),
                     "sourceUrl":"https://tronenergize.com/api/v1/market",
                     "canSellerFulfillWithThirdPartyResource":False})
    return rows
def period(d):
    return {"1d":"1d","3d":"3d","30d":"30d","1h":"1h"}.get(d)
def priced(row):
    d=period(row["duration"])
    amount=int(row["remainingApprox"])
    if not d or amount<15000 or amount>200000000:
        return {**row,"status":"UNSUPPORTED_DURATION_OR_AMOUNT"}
    u=f"https://api.tronenergyrent.com/calculate-energy-price?period={d}&energyAmount={amount}"
    try:
        x=getj(u)
        if x.get("status")!="SUCCESS" or x.get("errorCode"):raise ValueError(str(x.get("errorDescription")))
        z=x["payload"]
        cost_sun=int(z["totalPriceSun"])
        available=int(z["availableEnergy"])
        if amount>available:
            return {**row,"status":"INSUFFICIENT_SUPPLY","availableEnergy":available}
        units=1 if d.endswith("h") else int(d[:-1])
        ask_unit_sun=float(row["bidSunPerUnitPerDay"])*units
        gross_income_sun=amount*ask_unit_sun
        gross_spread_trx=(gross_income_sun-cost_sun)/1e6
        # Seller commission shown on TronBid range up to 20%. TronEnergize actual
        # commissions uncertain; apply 20% stress for both, not a verified net.
        after_seller_stress_trx=(gross_income_sun*0.8-cost_sun)/1e6
        return {**row,"status":"GROSS_PRICE_GAP_ONLY" if gross_spread_trx>0 else "NO_PRICE_EDGE",
            "supplier":"TronEnergyRent","supplierQuoteUrl":u,
            "supplierPriceTrx":cost_sun/1e6,"totalGrossBuyerBidTrx":gross_income_sun/1e6,
            "rawGrossSpreadTrx":round(gross_spread_trx,6),
            "after20PctSellerFeeStressTrx":round(after_seller_stress_trx,6),
            "buyerOrderSettlementVerified":False,
            "supplierDelegateCanSatisfySellerAuthentication":False,
            "executionFeasible":False,
            "profitCapturedTrx":0}
    except Exception as e:
        return {**row,"status":"QUOTE_FAILED","error":str(e)[:110]}
def main():
    bids=[]
    try:bids.extend(parse_public_tronbid())
    except Exception as e:errors.append("TronBid: "+str(e)[:140])
    try:bids.extend(tronenergize_orders())
    except Exception as e:errors.append("TronEnergize: "+str(e)[:140])
    todo=[x for x in bids if period(x["duration"]) and x["remainingApprox"]>=15000]
    with ThreadPoolExecutor(max_workers=6) as pool:
        priced_rows=list(pool.map(priced,todo))
    priced_rows.sort(key=lambda x:x.get("after20PctSellerFeeStressTrx") or -1e10,reverse=True)
    fx=None
    try:
        d=getj("https://api.coinbase.com/v2/prices/TRX-EUR/spot")
        fx=float(d["data"]["amount"])
    except Exception as e:errors.append("TRX/EUR: "+str(e)[:125])
    for x in priced_rows:
        edge=x.get("after20PctSellerFeeStressTrx")
        x["afterStressEurIllustrative"]=round(edge*fx,4) if edge is not None and fx else None
    meaningful=[x for x in priced_rows if (x.get("after20PctSellerFeeStressTrx") or 0)>0]
    report={
        "schema":1,"timestamp":NOW.isoformat(timespec="seconds").replace("+00:00","Z"),
        "scope":"Public TRON energy BUY bids plus independent rental SUPPLIER quotes; read-only",
        "strategy":"Prepaid buyer marketplace order, direct energy delivery, seller payout",
        "state":"NOT_EXECUTABLE_WITHOUT_AUTHORIZED_RESOURCE_SELLER_AND_PREPAID_PURCHASER",
        "publicBidRowsFound":len(bids),"comparableQuoteCount":len(priced_rows),
        "nominalPositivePriceDifferences":len(meaningful),
        "orderFillsExecuted":0,"delegationsSent":0,"realizedEur":None,
        "verifiedNetPerMinuteEur":0,"verifiedNetPerHourEur":0,"verifiedNetTotalEur":0,
        "supplierAuthorizationToSell":False,
        "tradingWalletConnected":False,
        "fxTrxToEur":fx,
        "topGrossHypotheses":priced_rows[:20],
        "errors":errors,
        "blocker":"TronBid pays a verified seller who delegates its own staked resources. "
                  "An unrelated resource supplier delegation is not proof that our wallet "
                  "has earned the buyer order, and the buyer's payout cannot be claimed "
                  "without permission. Do not convert provider price gaps into captured cash.",
        "assumptions":"Seller fee stressed at 20%, not actual individual seller fee; API "
                      "supplier quotes are nonbinding, buyer order remaining amounts may "
                      "be rounded, market state moves; profits shown are pricing hypotheses only."
    }
    (DIR/"energy-router.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps({"bids":len(bids),"quotes":len(priced_rows),"positiveNominal":len(meaningful),
                      "top":[{"venue":x["venue"],"duration":x["duration"],"amount":x["remainingApprox"],
                              "grossTRX":x.get("rawGrossSpreadTrx"),
                              "stressTRX":x.get("after20PctSellerFeeStressTrx"),
                              "status":x["status"]} for x in priced_rows[:7]],
                      "errors":errors},ensure_ascii=False))
if __name__=="__main__":main()
