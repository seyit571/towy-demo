'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:5}):'—';
  const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/keepers.json';
  async function refresh(){
    try{
      const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw Error('HTTP '+r.status);
      const data=await r.json();
      if(data.source!=='Curve V2 caller rewards')throw Error('Rapport inconnu');
      const age=Math.round((Date.now()-Date.parse(data.timestamp))/60000);
      $('keeperStatus').className='pill '+(age>20?'red':'ok');
      $('keeperStatus').textContent=(age>20?'⚠ DONNÉES ANCIENNES':'● LECTURE RPC VALIDÉE');
      $('keeperBlock').textContent=Number(data.block||0).toLocaleString('fr-FR');
      $('keeperReward').textContent=String(data.marketWithReward);
      $('keeperPositive').textContent=String(data.marketsPositiveAfterEstimatedGas);
      $('keeperSimulated').textContent=String(data.atomicSimulationsPassed);
      $('keeperTable').innerHTML=(data.keepers||[]).map(x=>
         '<tr><td>'+esc(x.name)+'</td><td>'+fmt(x.rewardUSDApprox)+' $</td><td>'+esc(x.callSimulation)+'</td><td>'+fmt(x.netUSDApprox)+' $</td></tr>'
      ).join('')||'<tr><td colspan="4">Aucune mesure disponible</td></tr>';
    }catch(e){$('keeperStatus').className='pill red';$('keeperStatus').textContent='⚠ '+String(e.message).slice(0,42)}
  }
  $('keeperReload').onclick=refresh;refresh();setInterval(refresh,300000);
})();