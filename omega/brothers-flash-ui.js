'use strict';
/* Original CBB NVDA setup: fresh independent prices, explicit funding gate. */
(function(){
  const el=id=>document.getElementById(id);
  const money=(x,unit='$',digits=2)=>Number.isFinite(Number(x))?Number(x).toLocaleString('fr-FR',{minimumFractionDigits:digits,maximumFractionDigits:digits})+' '+unit:'—';
  const src='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/brothers-flash-test.json';
  async function paint(){
    try{
      const r=await fetch(src+'?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw Error('HTTP '+r.status);
      const j=await r.json();
      if(j.schema!==1||j.strategy!=='REPLICA_OF_CBB_BROTHERS_NVDA')throw Error('Format non reconnu');
      const minutes=(Date.now()-Date.parse(j.generatedAt))/60000;
      const fresh=j.sourceQuotesFresh&&minutes>=0&&minutes<=20;
      el('brStatus').className='pill '+(fresh?'ok':'red');
      el('brStatus').textContent=fresh?'● AUDIT NVDA ACTUEL':'⚠ COTATIONS ANCIENNES / BOURSE FERMÉE';
      el('brTimestamp').textContent=new Date(j.generatedAt).toLocaleString('fr-FR');
      el('brEquity').textContent=money(j.equityAsk);
      el('brPerp').textContent=money(j.hyperliquidPerpAsk);
      el('brQuote').textContent=money(j.virtualMakerSell);
      el('brFlash').textContent=j.flashLoanCanSubstituteCapital?'OUI':'IMPOSSIBLE';
      el('brActual').textContent=money(j.verifiedProfitUsd);
      el('brRows').innerHTML=(j.originalHedgeConfigurations||[]).map(x=>'<tr><td><strong>'+x.shares+'</strong></td><td>'+money(x.equityLongCashNeededUsd)+'</td><td>'+money(x.indicativeCombinedFundingRequirementUsd)+'</td>'+x.scenarioResults.map(z=>'<td>'+money(z.conditionalNetIfFuturePerfectConvergenceUsd)+'</td>').join('')+'<td>Non : dette flash à rembourser avant règlement IBKR</td></tr>').join('')||
          '<tr><td colspan="7">Aucune cotation actions suffisamment fraîche pour chiffrer le clone.</td></tr>';
    }catch(e){
      el('brStatus').className='pill red';
      el('brStatus').textContent='⚠ TEST INDISPONIBLE';
    }
  }
  el('brRefresh').onclick=paint;
  paint();setInterval(paint,60000);
})();