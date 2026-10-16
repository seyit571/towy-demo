'use strict';
/* OMEGA CAPTURE TRUTH: economic action receipts, not market volume, projections or replay. */
(function(){
 const $=id=>document.getElementById(id);
 const money=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:4});
 const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('fr-FR'):'—';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const src='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/capture-ledger.json';
 let fx=0.88865; // explicit last known reference until updated from FX feed
 let j=null;
 async function update(){
  $('captureStatus').textContent='● Chargement des preuves…';
  try{
   const [r,f]=await Promise.all([
    fetch(src+'?t='+Date.now(),{cache:'no-store'}),
    fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR',{cache:'no-store'}).catch(()=>null)
   ]);
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   if(data.schema!==1||!data.forkNetProfitVerified||!Array.isArray(data.actions))throw Error('Format comptable inconnu');
   j=data;
   if(f?.ok){const x=await f.json();if(Number(x.rates?.EUR)>0)fx=Number(x.rates.EUR)}
   render();
  }catch(e){$('captureStatus').textContent='⚠ '+String(e.message).slice(0,55);$('captureStatus').className='pill red'}
 }
 function render(){
  if(!j)return;
  const n=j.forkNetProfitVerified;
  $('captureMinute').textContent=money(n.lastMinuteUsd*fx);
  $('captureHour').textContent=money(n.lastHourUsd*fx);
  $('captureTotal').textContent=money(n.totalUsd*fx);
  $('captureRealized').textContent=j.mainnetWalletConnected?money((j.realizedMainnetTotalUsd??0)*fx):'Non suivi';
  $('captureReceipts').textContent=fmt(n.atomicReceiptsOk);
  $('captureDeltas').textContent=fmt(n.atomicsWithVerifiedWalletDeltas);
  $('capturePositive').textContent=fmt(n.verifiedPositiveActions);
  $('captureDedup').textContent=fmt(n.deduplicatedActions);
  const date=Date.parse(j.generatedAt),age=Math.floor((Date.now()-date)/60000);
  $('captureTimestamp').textContent=new Date(date).toLocaleString('fr-FR');
  $('captureStatus').textContent=age>=30?'⚠ PROUVEUR INACTIF · '+age+' min':'● REGISTRE VÉRIFIÉ · '+Math.max(0,age)+' min';
  $('captureStatus').className='pill '+(age>=30?'red':'ok');
  $('captureKnownRate').textContent='USD/EUR = '+fx.toLocaleString('fr-FR',{maximumFractionDigits:5});
  const rows=j.actions.slice().sort((a,b)=>(Number(Boolean(b.completed))-Number(Boolean(a.completed)))).slice(0,16);
  $('captureRows').innerHTML=rows.map(p=>{
   const qualifies=p.profitEligible===true;
   return '<tr><td>'+esc(p.network)+'</td><td>'+esc(p.mechanism)+'</td><td>'+
    (p.mode==='FORK_ATOMIC'?'<span class="tag">FORK OK</span>':p.mode==='RPC_PREFLIGHT'?'<span class="tag">RPC seulement</span>':'<span class="tag bad">REVERT</span>')+
    '</td><td>'+money(p.netUsdIndicative===null?null:p.netUsdIndicative*fx)+'</td><td><span class="tag '+(qualifies?'':'bad')+'">'+(qualifies?'CAPTURE ADMISSIBLE':'NON COMPTÉ')+'</span></td></tr>';
  }).join('');
  $('captureWarning').textContent=j.disclaimer;
 }
 $('captureRefresh').onclick=update;
 update();setInterval(update,60000);
})();