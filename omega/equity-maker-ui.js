'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const f=(v,d=2)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const src='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/equity-maker.json';
 async function refresh(){
  try{
   const r=await fetch(src+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();
   if(j.schema!==1||j.mode!=='UNPOSTED_MAKER_TAPE_REPLAY')throw Error('Invalid maker tape report');
   const age=(Date.now()-Date.parse(j.timestamp))/60000;
   $('emStatus').textContent=age>20?'⚠ TAPE PÉRIMÉ':'● TAPE PUBLIC SURVEILLÉ';
   $('emStatus').className='pill '+(age>20?'red':'ok');
   $('emWatched').textContent=f(j.virtualMakerQuotesWatched,0);
   $('emOpen').textContent=f(j.openVirtualQuotes,0);
   $('emTouch').textContent=f(j.totalPotentialTradeThroughs,0);
   $('emFavorable').textContent=f(j.conditionallyPositiveTradeThroughs,0);
   $('emConditional').textContent=f(j.paperModelGrossNetUsd,2)+' $';
   $('emPositiveOnly').textContent=f(j.conditionallyPositiveNetUsd,2)+' $';
   $('emLast').textContent=new Date(j.timestamp).toLocaleString('fr-FR');
   $('emEvents').innerHTML=(j.recentThroughs||[]).slice().reverse().slice(0,10).map(t=>
      '<tr><td>'+safe(t.ticker)+'</td>'+
      '<td>'+f(t.makerAskNotPosted,3)+' $</td>'+
      '<td>'+f(t.tradePx,3)+' $</td>'+
      '<td>'+f(t.hypotheticalQtyMax,3)+'</td>'+
      '<td>'+f(t.grossIfMakerPriorityAndBrokerHedgeUsd,3)+' $</td>'+
      '<td>'+f(t.modeledFeesCarryAndExitUsd,3)+' $</td>'+
      '<td><b class="'+(t.netIfHypotheticallyFilledAndHedgedUsd>0?'orange':'red')+'">'+f(t.netIfHypotheticallyFilledAndHedgedUsd,3)+' $</b></td></tr>'
   ).join('')||'<tr><td colspan="7">En attente de transactions arrivant APRÈS nos cotations virtuelles. Aucune exécution supposée.</td></tr>';
  }catch(e){
   $('emStatus').textContent='⚠ TAPE NON DISPONIBLE';
   $('emStatus').className='pill red';
  }
 }
 $('emRefresh').onclick=refresh;
 refresh();setInterval(refresh,60000);
})();