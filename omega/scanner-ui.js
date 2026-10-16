/* OMEGA cloud snapshot viewer. Public data only; no trade execution. */
'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const fmt=(v,dec=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('fr-FR',{maximumFractionDigits:dec,minimumFractionDigits:dec}):'—';
 const usd=v=>Number.isFinite(Number(v))?(Number(v)<0?'−':'')+'$'+Math.abs(Number(v)).toLocaleString('en-US',{maximumFractionDigits:2}):'—';
 const compact=v=>{const x=Number(v);if(!Number.isFinite(x))return '—';if(x>=1e9)return '$'+(x/1e9).toFixed(2)+' Md';if(x>=1e6)return '$'+(x/1e6).toFixed(2)+' M';if(x>=1e3)return '$'+(x/1e3).toFixed(1)+' k';return usd(x)};
 const safe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let last=null;
 const raw='https://raw.githubusercontent.com/seyit571/towy-demo/main/omega/data/';
 async function read(filename){
  const r=await fetch(raw+filename+'?t='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  return r.json();
 }
 async function refresh(){
  $('cloudStatus').textContent='● Récupération des mesures…';
  try{
   const d=await read('snapshot.json');if(!d||d.schema!==2)throw Error('Format de données inconnu');
   last=d;paint(d);
   $('cloudStatus').textContent='● SCANNER GITHUB CONNECTÉ';
   $('cloudStatus').className='pill ok';
  }catch(e){
   $('cloudStatus').textContent='⚠ Snapshot indisponible : '+String(e.message).slice(0,45);
   $('cloudStatus').className='pill red';
  }
  try{const h=await read('history.json');if(Array.isArray(h))drawHistory(h);}catch(e){$('cloudHistory').textContent='Historique en attente du premier scan.';}
 }
 function paint(d){
  const timestamp=Date.parse(d.capturedAt);
  const age=Date.now()-timestamp;
  $('cloudTime').textContent=Number.isFinite(age)?new Date(timestamp).toLocaleString('fr-FR')+' ('+Math.max(0,Math.floor(age/60000))+' min)':'—';
  $('cloudAge').textContent=!Number.isFinite(age)?'Date invalide':age>20*60000?'⚠ DONNÉES ANCIENNES':'● Scan récent';
  $('cloudAge').className='pill '+(age>20*60000?'red':'ok');
  const chains=Array.isArray(d.morpho)?d.morpho:[];
  const valid=chains.filter(x=>x.status==='ok');
  $('liveChains').textContent=valid.length+'/'+chains.length;
  $('riskGlobal').textContent=valid.reduce((a,x)=>a+(Number(x.countAtRisk)||0),0).toLocaleString('fr-FR');
  $('solPriceLive').textContent=d.solPriceUsd?usd(d.solPriceUsd):'—';
  $('solanaStrats').textContent=d.kamino&&d.kamino.status==='ok'?fmt(d.kamino.strategiesCount,0):'—';
  $('rayVolume').textContent=d.raydium&&d.raydium.status==='ok'?compact(d.raydium.sampleVolume24hUsd):'—';
  $('chainRows').innerHTML=chains.map(x=>
   '<div class="feedline"><div><strong>'+safe(x.chain||'Inconnu')+'</strong><span class="caption"> · Morpho Blue</span></div><div class="feedstat">'+
   (x.status==='ok'?'<span class="orange">'+Number(x.countAtRisk||0).toLocaleString('fr-FR')+'</span><small>'+Number(x.sampleUnder1||0)+' HF &lt;1 / '+Number(x.sampleCount||0)+' échant.</small>':'<span class="red">Erreur API</span>')+
   '</div></div>').join('');
  const quotes=Array.isArray(d.jupiter)?d.jupiter:[];
  const okCount=quotes.filter(x=>Number(x.quotedNetFeeAssumptionUsd)>0).length;
  const stresCount=quotes.filter(x=>Number(x.stressNetUsd)>0).length;
  $('quoteCount').textContent=quotes.length;
  $('quotePositive').textContent=okCount;
  $('quoteStressPositive').textContent=stresCount;
  $('simBest').textContent=quotes.length?usd(Math.max(...quotes.map(x=>Number(x.stressNetUsd)||-1e9))):'—';
  $('simBest').className='big '+(stresCount?'ok':'orange');
  $('simNote').textContent='Devis bidirectionnels Jupiter, non atomiques. Hypothèses : 50 bps de stress par jambe + 0,00005 SOL de frais. Aucune rentabilité exécutable validée.';
  $('quoteRows').innerHTML=quotes.map(x=>
   '<tr><td>'+safe(x.route)+'</td><td>'+fmt(x.inputSol,2)+' SOL</td><td>'+usd(x.quotedNetFeeAssumptionUsd)+'</td><td><b class="'+(x.stressNetUsd>0?'ok':'red')+'">'+usd(x.stressNetUsd)+'</b></td><td><span class="tag">DEUX QUOTES · NON ATOMIQUE</span></td></tr>').join('')||'<tr><td colspan="5">Pas de devis complet disponibles pour ce scan (429 ou route absente).</td></tr>';
  $('rayRows').innerHTML=((d.raydium&&d.raydium.pools)||[]).slice(0,12).map(x=>
   '<tr><td><a rel="noopener noreferrer" target="_blank" href="https://raydium.io/liquidity-pools/?search='+encodeURIComponent(x.address)+'">'+safe(x.name)+' ↗</a></td><td>'+safe(x.type)+'</td><td>'+compact(x.volume24hUsd)+'</td><td>'+compact(x.tvlUsd)+'</td></tr>').join('')||'<tr><td colspan="4">Données indisponibles.</td></tr>';
  $('errorCount').textContent=Array.isArray(d.errors)?d.errors.length:0;
  const notice=(d.errors||[]).slice(0,12);
  $('errorRows').innerHTML=notice.map(x=>'<div class="caption" style="padding:5px 0;border-bottom:1px solid var(--line)">'+safe(x)+'</div>').join('')||'<div class="caption ok">Aucune erreur API enregistrée</div>';
  $('executionProof').textContent='0 tx · 0 liquidation exécutée · aucun P&L vérifié';
 }
 function drawHistory(rows){
  const v=rows.slice(-100);$('historyCount').textContent=v.length+' snapshots historiques';
  if(v.length<2){$('cloudHistory').textContent='Historique : '+v.length+' point. Le graphique apparaît après le deuxième scan.';return;}
  const data=v.map(x=>Number(x.marketsScanned)||0);
  const min=Math.min(...data),max=Math.max(...data),span=Math.max(max-min,1);
  const points=data.map((n,i)=>(i/(data.length-1)*680).toFixed(1)+','+(90-(n-min)/span*80).toFixed(1)).join(' ');
  $('cloudHistory').innerHTML='<svg viewBox="0 0 680 100" style="width:100%;height:130px" role="img" aria-label="Evolution des positions à risque sur Morpho"><line x1="0" y1="92" x2="680" y2="92" stroke="#344358"/><polyline fill="none" stroke="#ff902f" stroke-width="2.5" points="'+points+'"/></svg><div class="toolbar caption"><span>Min : '+min+'</span><span>Max : '+max+'</span><span>Dernier : '+data[data.length-1]+'</span></div>';
 }
 $('cloudRefresh').addEventListener('click',refresh);
 refresh();
 setInterval(refresh,5*60000);
})();