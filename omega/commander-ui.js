'use strict';
/* OMEGA Commander: economic gate, not trading wallet or fictional return. */
(function(){
 const by=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR'):'—';
 const usd=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:5}):'—';
 const URL='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/commander.json';
 let state=null;
 const marketMap={'Morpho':'Morpho','Sky':'Sky','Curve':'Curve','BeefyBase':'Beefy Base','Solana':'Solana','BNB':'BNB Solvers'};
 function elapsed(){
  if(!state)return;
  const date=Date.parse(state.generatedAt);
  const age=Number.isFinite(date)?Math.max(0,(Date.now()-date)/60000):Infinity;
  const status=by('cmdStatus');
  status.textContent=age>20?'⚠ ANCIEN RAPPORT · '+Math.floor(age)+' MIN':'● COMMANDEUR SHADOW ACTIF';
  status.className='pill '+(age>20?'red':'ok');
  by('cmdLast').textContent=Number.isFinite(date)?new Date(date).toLocaleString('fr-FR'):'Indisponible';
  by('cmdAge').textContent=Number.isFinite(age)?Math.floor(age)+' min':'—';
 }
 function render(j){
  state=j;elapsed();
  const health=Object.entries(j.sourceStatus||{});
  const fresh=health.filter(([k,v])=>v.status==='FRESH').length;
  by('cmdSources').textContent=fresh+' / '+health.length;
  by('cmdStale').textContent=String(health.length-fresh);
  by('cmdQueue').textContent=String(j.queueTotal??'—');
  by('cmdReady').textContent=String(j.actionableNow??'—');
  by('cmdVerified').textContent=String(j.proofNetSimulatedUsd?.uniquePositive??'—');
  by('cmdMinute').textContent=usd(j.proofNetSimulatedUsd?.minuteUsd);
  by('cmdHour').textContent=usd(j.proofNetSimulatedUsd?.hourUsd);
  by('cmdTotal').textContent=usd(j.proofNetSimulatedUsd?.totalUsd);
  by('cmdWallet').textContent=j.walletMainnetConnected?'CONNECTÉ':'NON CONNECTÉ';
  const candidates=j.signalQueue||[];
  by('cmdCandidates').innerHTML=candidates.length?
   candidates.slice(0,12).map(x=>{
    const st=x.sourceFresh?'À VALID':'SOURCE ANCIENNE';
    const cost=x.gasEstimateUsd!=null?usd(x.gasEstimateUsd):'—';
    return '<tr><td>'+x.rank+'</td><td>'+escape(x.network)+'</td><td>'+escape(x.mechanism)+'<div class="caption">'+escape(x.action)+'</div></td><td>'+usd(x.upperBoundUsd)+'</td><td>'+cost+'</td><td><span class="tag '+(x.sourceFresh?'':'bad')+'">'+st+'</span><div class="caption">'+escape(x.status)+'</div></td></tr>';
   }).join('')
   :'<tr><td colspan="6">Aucun candidat avec une marge positive dans les derniers tests. Les scanners poursuivent les contrôles.</td></tr>';
  by('cmdFreshness').innerHTML=health.map(([name,v])=>{
   const good=v.status==='FRESH';
   return '<div class="feedline"><div><strong>'+escape(name)+'</strong><div class="caption">'+escape(v.timestamp??'Pas de données')+'</div></div><div style="text-align:right"><span class="tag '+(good?'':'bad')+'">'+escape(v.status)+'</span><div class="caption">'+(v.ageMinutes==null?'—':number(v.ageMinutes)+' min')+'</div></div></div>'
  }).join('');
  const ecosystems=j.ecosystems||{};
  const labels=[
   ['Morpho',ecosystems.Morpho?.onchainScreened,'Positions EVM vérifiées'],
   ['Sky',ecosystems.Sky?.contractsInspected,'Contrats Sky analysés'],
   ['Curve',ecosystems.Curve?.inspected,'PegKeepers contrôlés'],
   ['BeefyBase',ecosystems.BeefyBase?.liveStrategies,'Vaults Beefy Base'],
   ['Solana',ecosystems.Solana?.l3Orders,'Ordres Solana L3'],
   ['BNB',ecosystems.BNB?.optimalCycles,'Cycles BNB optimisés']
  ];
  by('cmdMarkets').innerHTML=labels.map(([key,v,desc])=>'<div class="card"><div class="label">'+escape(marketMap[key])+'</div><div class="big">'+number(v)+'</div><div class="caption">'+escape(desc)+'</div></div>').join('');
 }
 async function update(){
  by('cmdManual').disabled=true;
  try{
   const c=new AbortController(),t=setTimeout(()=>c.abort(),13000);
   let r;
   try{r=await fetch(URL+'?ts='+Date.now(),{cache:'no-store',signal:c.signal})}finally{clearTimeout(t)}
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();
   if(j.schema!==1||j.mode!=='AUTONOMOUS_READ_ONLY_ROUTER')throw Error('Rapport invalide');
   render(j);
  }catch(e){
   const s=by('cmdStatus');s.textContent='⚠ ROUTEUR INDISPONIBLE';s.className='pill red';
   by('cmdError').textContent=String(e.message).slice(0,140);
  }finally{by('cmdManual').disabled=false}
 }
 by('cmdManual').onclick=update;
 update();
 setInterval(elapsed,10000);
 setInterval(update,60000);
})();