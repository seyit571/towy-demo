'use strict';
/* OMEGA EQUITY BASIS — evidence-only. A live quote difference is NOT earned P&L. */
(function(){
 const $=id=>document.getElementById(id);
 const fmt=(n,digits=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;':'&quot;',"'":'&#39;'}[c]));
 const URL='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/equity-basis.json';
 let fetching=false;
 async function refresh(){
  if(fetching)return;fetching=true;
  try{
   const response=await fetch(URL+'?v='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const j=await response.json();
   if(j.schema!==1||!Array.isArray(j.signals))throw Error('Invalid source report');
   const age=(Date.now()-Date.parse(j.timestamp))/60000;
   const fresh=age>=0&&age<=12;
   $('eqStatus').className='pill '+(fresh?'ok':'red');
   $('eqStatus').textContent=fresh?'● COTATIONS PERP + NASDAQ ACTIVES':'⚠ DONNÉES ANCIENNES OU BOURSE FERMÉE';
   $('eqLastScan').textContent=new Date(j.timestamp).toLocaleString('fr-FR');
   $('eqUniverse').textContent=fmt(j.marketCountXYZ,0);
   $('eqSymbols').textContent=fmt(j.stocksFresh,0);
   $('eqTheoretical').textContent=fmt(j.stocksWithTheoreticalPositiveDislocation,0);
   $('eqValidated').textContent=fmt(j.fullTwoLegExecutionSimulations,0);
   $('eqCapital').textContent=fmt(j.fundedNotionalPerCaseUsd,0)+' $';
   const best=j.signals[0]||null;
   $('eqBest').textContent=best?fmt(best.best.ifFullConvergenceNetScenarioUsd,2)+' $':'—';
   $('eqRows').innerHTML=j.signals.slice(0,20).map(x=>{
    const b=x.best||{},ok=b.ifFullConvergenceNetScenarioUsd>0;
    return '<tr><td><strong>'+escape(x.ticker)+'</strong><div class="caption">'+fmt(x.perpVolume24hUsd,0)+' $/24h</div></td>'+
      '<td>'+fmt(x.equityBid,3)+' / '+fmt(x.equityAsk,3)+'</td>'+
      '<td>'+fmt(x.perpBestBid,3)+' / '+fmt(x.perpBestAsk,3)+'</td>'+
      '<td>'+escape(b.direction==='SHORT_PERP_LONG_EQUITY'?'Short perp + achat action':'Long perp + vente action')+'</td>'+
      '<td>'+fmt(b.grossEntryDislocationBps,2)+' bps</td>'+
      '<td>'+fmt(b.roundtripCostAndCarryStressBps,2)+' bps</td>'+
      '<td><b class="'+(ok?'orange':'red')+'">'+fmt(b.ifFullConvergenceNetScenarioUsd,3)+' $</b><div class="caption">Scénario convergence, non gagné</div></td></tr>';
   }).join('')||'<tr><td colspan="7">Aucune action avec cours suffisamment frais. Les perps restent visibles, mais il est incorrect d’utiliser des cotations actions périmées.</td></tr>';
   $('eqErrors').textContent=(j.errors||[]).length+' symbole(s) non contrôlés · aucune position prise · aucun bénéfice réalisé';
  }catch(e){
   $('eqStatus').className='pill red';
   $('eqStatus').textContent='⚠ SCAN EQUITY BASIS INDISPONIBLE';
   $('eqErrors').textContent=String(e.message);
  }finally{fetching=false}
 }
 $('eqRefresh').onclick=refresh;
 refresh();
 setInterval(refresh,60000);
})();