'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('fr-FR',{maximumFractionDigits:8}):'—';
 async function refresh(){
  try{
   const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/beefy-base.json?now='+Date.now();
   const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
   const d=await r.json();if(!d.source?.includes('eth_simulateV1'))throw Error('Source inattendue');
   const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(d.timestamp))/60000));
   $('baseBeefyStatus').textContent=minutes>85?'⚠ SCAN ANCIEN ('+minutes+' min)':'● SIMULATEUR RPC OFFICIEL';
   $('baseBeefyStatus').className='pill '+(minutes>85?'red':'ok');
   $('baseBeefyActive').textContent=d.strategiesActive;
   $('baseBeefyQuotes').textContent=d.rewardsNonzero;
   $('baseBeefyPassed').textContent=d.successfulSimulations+' / '+d.simulated;
   $('baseBeefyPositive').textContent=d.positiveAfterSafetyMargin;
   $('baseBeefyUpdated').textContent=new Date(d.timestamp).toLocaleString('fr-FR');
   $('baseBeefyRows').innerHTML=(d.candidates||[]).slice(0,15).map(x=>
    '<tr><td>'+safe(x.id.replace('aerodrome-cow-base-','').replace('-vault',''))+'</td><td>'+fmt(x.quotedETH)+'</td><td>'+fmt(x.creditETH)+'</td><td>'+fmt(x.gasEstimateETH)+'</td><td><b class="'+(x.netBeforeL1DataFeeETH>0?'ok':'red')+'">'+fmt(x.netBeforeL1DataFeeETH)+'</b></td><td>'+ (x.success?'ETH_CALL OK':'ÉCHEC') +'</td></tr>'
   ).join('')||'<tr><td colspan="6">Aucune donnée de simulation.</td></tr>';
  }catch(e){$('baseBeefyStatus').textContent='⚠ '+String(e.message).slice(0,60);$('baseBeefyStatus').className='pill red'}
 }
 $('baseBeefyReload').onclick=refresh;refresh();setInterval(refresh,300000);
})();