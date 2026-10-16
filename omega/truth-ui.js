'use strict';
(function(){
const id=x=>document.getElementById(x);
const fmt=(v,d=3)=>Number.isFinite(Number(v))?Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':(Number(v)<0?'−':'')+'$'+Math.abs(Number(v)).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function show(){
try{
const res=await fetch('https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/truth-v3.json?t='+Date.now(),{cache:'no-store'});
if(!res.ok)throw Error('HTTP '+res.status);
const j=await res.json();if(j.version!==3)throw Error('Version non prise en charge');
const old=Math.max(0,Math.floor((Date.now()-Date.parse(j.timestamp))/60000));
id('truthStatus').textContent=old>90?'⚠ SNAPSHOT HISTORIQUE ('+old+' min)':'● SNAPSHOT VALIDÉ';
id('truthStatus').className='pill '+(old>90?'red':'ok');
id('truthRoutes').textContent=Number(j.bscOptimizer.tested).toLocaleString('fr-FR');
id('truthPositive').textContent=Number(j.bscOptimizer.positiveAfterAssumptions);
id('truthRewardPreflight').textContent=j.beefy.networks.reduce((a,x)=>a+Number(x.positivePreflightAfterGas||0),0);
id('truthTracePositive').textContent=Number(j.beefy.positiveAfterTraceAndGas);
id('truthTraced').textContent=j.beefy.traceSuccess+' / '+j.beefy.traced;
id('truthConfirmedProfit').textContent='0 €';
id('truthBestTri').textContent=money(j.bscOptimizer.best?.[0]?.netUsdt);
const rows=(j.beefy.rewards||[]).slice().sort((a,b)=>(Number(b.quotedRewardUSD||0)-Number(a.quotedRewardUSD||0)));
id('truthRows').innerHTML=rows.slice(0,15).map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+money(r.quotedRewardUSD)+'</td><td>'+money(r.actualTraceRewardUSD)+'</td><td>'+money(r.gasUSDEst)+'</td><td><b class="'+(Number(r.netAfterGasUSD)>0&&r.eligible?'ok':'red')+'">'+money(r.netAfterGasUSD)+'</b></td><td>'+(!r.eligible?'<span class="tag bad">ÉCHEC TRACE</span>':'<span class="tag">TRACE OK</span>')+'</td></tr>').join('');
id('truthTimestamp').textContent=new Date(j.timestamp).toLocaleString('fr-FR');
}catch(e){id('truthStatus').textContent='⚠ '+String(e.message).slice(0,60);id('truthStatus').className='pill red'}
}
id('truthReload').onclick=show;show();setInterval(show,300000);
})();