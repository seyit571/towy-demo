'use strict';
/* Public Velocity DLOB L3 read-only orderbook observations, not a filler bot or actual profit simulator. */
(function(){
 const $=s=>document.getElementById(s),sym=['SOL-PERP','BTC-PERP','ETH-PERP','HYPE-PERP'];
 const nf=(x,d=2)=>Number.isFinite(x)?x.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
 let last={};let counts={scans:0,cross:0,adds:0};let busy=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 $('velocityRows').innerHTML=sym.map(s=>'<tr><td><strong>'+s+'</strong></td><td id="vbid-'+s+'">—</td><td id="vask-'+s+'">—</td><td id="vsp-'+s+'">—</td><td id="vorders-'+s+'">—</td><td id="vnew-'+s+'">—</td><td id="vsignal-'+s+'"><span class="tag">En attente</span></td></tr>').join('');
 async function scanOne(symbol){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
  try{
   const url='https://dlob.velocity.exchange/l3?marketName='+encodeURIComponent(symbol)+'&marketType=perp';
   const r=await fetch(url,{signal:ctrl.signal,cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const d=await r.json(),age=Date.now()-Number(d.ts);
   if(!Array.isArray(d.bids)||!Array.isArray(d.asks)||!Number.isFinite(age)||age>20000||age< -10000)throw Error('Source obsolète');
   const bids=d.bids,asks=d.asks;
   const bid=bids.length?Number(bids[0].price)/1e6:null,ask=asks.length?Number(asks[0].price)/1e6:null;
   const spread=bid&&ask?(ask-bid)/((ask+bid)/2)*10000:null;
   const key=(x,side)=>String(x.maker||'')+'_'+String(x.orderId||'')+'_'+side;
   const ids=new Set([...bids.map(x=>key(x,'bid')),...asks.map(x=>key(x,'ask'))]);
   const old=last[symbol];
   const added=old?[...ids].filter(v=>!old.has(v)).length:0;
   last[symbol]=ids;
   $('vbid-'+symbol).textContent=nf(bid,3);
   $('vask-'+symbol).textContent=nf(ask,3);
   $('vsp-'+symbol).textContent=spread===null?'—':nf(spread)+' bps';
   $('vorders-'+symbol).textContent=(bids.length+asks.length).toLocaleString('fr-FR');
   $('vnew-'+symbol).textContent=String(added);
   const crossed=bid!==null&&ask!==null&&bid>=ask;
   $('vsignal-'+symbol).innerHTML=crossed?'<span class="tag bad">Croisement · À SIMULER</span>':'<span class="tag">Aucun croisement visible</span>';
   counts.scans++;counts.adds+=added;if(crossed)counts.cross++;
   return true;
  }catch(e){$('vsignal-'+symbol).innerHTML='<span class="tag bad">Indisponible</span>';return false}
  finally{clearTimeout(timer)}
 }
 async function run(){
  if(busy)return;busy=true;
  const ok=await Promise.all(sym.map(scanOne));
  const good=ok.filter(Boolean).length;
  $('velocityStatus').textContent=good===sym.length?'● SOLANA L3 ACTUALISÉ':'⚠ '+good+'/'+sym.length+' marchés disponibles';
  $('velocityStatus').className='pill '+(good===sym.length?'ok':'red');
  $('velocityOrders').textContent=[...Object.values(last)].reduce((a,set)=>a+set.size,0);
  $('velocityChanges').textContent=String(counts.adds);
  $('velocityCrosses').textContent=String(counts.cross);
  $('velocityTs').textContent=new Date().toLocaleTimeString('fr-FR');
  busy=false;
 }
 $('velocityRefresh').onclick=run;
 run();setInterval(run,12000);
})();