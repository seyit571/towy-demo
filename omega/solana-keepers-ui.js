'use strict';
/* OMEGA read-only Solana Flow Radar. Neither L3 orders nor previous other bots' liquidations are income. */
(function(){
 const $=id=>document.getElementById(id);
 const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('fr-FR'):'—';
 const source='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/solana-keepers.json';
 let active=false;
 async function paint(){
  if(active)return;active=true;
  try{
   const r=await fetch(source+'?v='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();if(j.schema!==1||!Array.isArray(j.velocityMarkets))throw Error('Format incorrect');
   $('skeeperSignatures').textContent=n(j.recentSignaturesFetched);
   $('skeeperDecoded').textContent=n(j.transactionsReturned);
   $('skeeperLiquidations').textContent=n(j.liquidationsDetectedInCurrentSample);
   $('skeeperUnique').textContent=n(j.liquidationsUniquelyObservedAcrossRuns);
   $('skeeperOrders').textContent=n(j.velocityOrderCount);
   $('skeeperCrosses').textContent=n(j.potentialCrosses);
   $('skeeperAtomic').textContent=n(j.atomicTransactionsSimulated);
   const at=Date.parse(j.observedAt),age=Math.floor((Date.now()-at)/60000);
   $('skeeperTime').textContent=Number.isFinite(at)?new Date(at).toLocaleString('fr-FR'):'—';
   $('skeeperStatus').textContent=age>=20?'⚠ SCAN OBSOLÈTE · '+age+' min':'● CAPTEUR SOLANA CONNECTÉ';
   $('skeeperStatus').className='pill '+(age>=20?'red':'ok');
   const entries=j.velocityMarkets;
   $('skeeperRows').innerHTML=entries.map(x=>'<tr><td>'+safe(x.market)+'</td><td>'+safe(x.status==='ok'?'L3 actif':'Indisponible')+'</td><td>'+n(x.orders)+'</td><td>'+(x.spreadBps==null?'—':x.spreadBps+' bps')+'</td><td>'+n(x.potentialMatchSignals||0)+'</td></tr>').join('');
   const liq=j.liquidationHistory||[];
   $('skeeperHistory').innerHTML=liq.length?liq.slice(-8).reverse().map(x=>'<div class="feedline"><div><strong>Kamino · liquidation confirmée</strong><br><span class="caption">'+safe(x.instructions.join(', '))+'</span></div><a target="_blank" rel="noopener noreferrer" href="https://solscan.io/tx/'+encodeURIComponent(x.signature)+'">Transaction ↗</a></div>').join(''):'<p class="caption">Aucune liquidation constatée dans cet échantillon. Cela ne signifie pas qu’il n’y en a pas sur l’ensemble du protocole.</p>';
   $('skeeperErrors').textContent=(j.errors||[]).length+' erreur(s) · '+j.transactionsSuccessfulSampled+' transactions demandées au RPC.';
  }catch(e){$('skeeperStatus').textContent='⚠ '+String(e.message).slice(0,48);$('skeeperStatus').className='pill red'}
  finally{active=false}
 }
 $('skeeperRefresh').onclick=paint;
 paint();setInterval(paint,300000);
})();