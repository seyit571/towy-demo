'use strict';
(function(){
const $=x=>document.getElementById(x);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{maximumFractionDigits:6}):'—';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/bsc.json';
async function refresh(){
try{
const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
const d=await r.json();if(d.classification!=='AMM_RESERVE_TWO_LEG_QUOTE_NOT_EXECUTED')throw Error('Données inconnues');
const age=(Date.now()-Date.parse(d.timestamp))/60000;
$('bscStatus').textContent=age>20?'⚠ Mesures de '+Math.floor(age)+' min':'● BNB V2 DATA';
$('bscStatus').className='pill '+(age>20?'red':'ok');
$('bscBlock').textContent=Number(d.block).toLocaleString('fr-FR');
$('bscPools').textContent=Number(d.readPools||0);
$('bscTests').textContent=Number(d.scenarios||0);
$('bscPositive').textContent=Number(d.positiveScenarios||0);
$('bscBest').textContent=(d.top&&d.top.length)?fmt(d.top[0].grossAfterDexFees)+' '+esc(d.top[0].token):'—';
$('bscRows').innerHTML=(d.top||[]).slice(0,12).map(x=>'<tr><td>'+esc(x.token)+' / '+esc(x.against)+'</td><td>'+esc(x.via1)+' → '+esc(x.via2)+'</td><td>'+fmt(x.amount)+' '+esc(x.token)+'</td><td><span class="'+(x.grossAfterDexFees>0?'ok':'red')+'">'+fmt(x.grossAfterDexFees)+' '+esc(x.token)+'</span></td><td>'+fmt(x.grossPercent)+' %</td></tr>').join('');
}catch(e){$('bscStatus').textContent='⚠ '+String(e.message).slice(0,50);$('bscStatus').className='pill red'}
}
$('bscReload').onclick=refresh;refresh();setInterval(refresh,300000);
})();