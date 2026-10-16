'use strict';
(function(){
const $=x=>document.getElementById(x);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function read(){
try{
const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/bsc-v3.json?now='+Date.now();
const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
const j=await r.json();if(j.method!=='SAME_BLOCK_V3_ETH_CALL_V2_RESERVES_QUOTED_NOT_ATOMIC_EXEC')throw Error('Unknown data');
const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(j.timestamp))/60000));
$('v3Status').textContent=minutes>20?'⚠ DATA '+minutes+' MIN':'● SAME-BLOCK QUOTER';
$('v3Status').className='pill '+(minutes>20?'red':'ok');
$('v3Scenarios').textContent=Number(j.scenarioCount||0).toLocaleString('fr-FR');
$('v3Positive').textContent=Number(j.positiveAfterAssumptions||0).toLocaleString('fr-FR');
$('v3Block').textContent=Number(j.block||0).toLocaleString('fr-FR');
$('v3Best').textContent=j.best?.length?fmt(j.best[0].netAfterFlashGasUsdApprox)+' $':'—';
$('v3Rows').innerHTML=(j.best||[]).slice(0,12).map(x=>'<tr><td>USDT/'+esc(x.token)+'</td><td>'+esc(x.route)+'</td><td>'+fmt(x.amountUsdApprox)+' USDT</td><td>'+fmt(x.grossAfterDexFeesUsdApprox)+'</td><td><b class="'+(x.netAfterFlashGasUsdApprox>0?'ok':'red')+'">'+fmt(x.netAfterFlashGasUsdApprox)+'</b></td></tr>').join('')||'<tr><td colspan="5">Aucune cotation disponible</td></tr>';
}catch(e){$('v3Status').textContent='⚠ '+String(e.message).slice(0,40);$('v3Status').className='pill red'}
}
$('v3Reload').onclick=read;read();setInterval(read,300000)
})();