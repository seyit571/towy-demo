/* Read-only EVM preflight board. Never treat gross ceilings as simulated/realized profits. */
'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const usd=x=>typeof x==='number'&&Number.isFinite(x)?(x<0?'−':'')+'$'+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const u='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/evm.json';
 async function refresh(){
  try{
   const r=await fetch(u+'?v='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   if(data.type!=='ONCHAIN_ELIGIBILITY_AND_UPPER_BOUNDS')throw Error('Schema inconnu');
   const age=(Date.now()-Date.parse(data.timestamp))/60000;
   $('evmAge').textContent=(Number.isFinite(age)&&age>=0?Math.floor(age)+' min':'?')+' depuis dernier contrôle on-chain';
   $('evmStatus').textContent=Number.isFinite(age)&&age>20?'⚠ SNAPSHOT ANCIEN':'● SNAPSHOT ON-CHAIN';
   $('evmStatus').className='pill '+(age>20?'red':'ok');
   const positions=Array.isArray(data.positions)?data.positions:[];
   const checked=positions.length;
   const found=positions.filter(x=>x.onchainUnderwaterBeforeAccrual).length;
   const upper=positions.filter(x=>x.onchainUnderwaterBeforeAccrual&&Number(x.preSwapUpperBoundUsd)>0);
   const highest=upper.length?Math.max(...upper.map(x=>Number(x.preSwapUpperBoundUsd))):null;
   $('evmChecked').textContent=checked;
   $('evmUnderwater').textContent=found;
   $('evmUpperCount').textContent=upper.length;
   $('evmUpperMax').textContent=highest===null?'—':usd(highest);
   $('evmProfitMinute').textContent='0 $';
   $('evmProfitHour').textContent='0 $';
   $('evmProfitTotal').textContent='0 $';
   $('evmSimPassed').textContent=String(data.atomicSimulationsPassed||0);
   $('evmRealized').textContent='0 $';
   $('evmRows').innerHTML=positions.slice().sort((a,b)=>(b.preSwapUpperBoundUsd??-1e8)-(a.preSwapUpperBoundUsd??-1e8)).slice(0,16).map(x=>
    '<tr><td>'+esc(x.chain)+'</td><td>'+esc(x.collateral)+' → '+esc(x.loan)+'</td><td>'+usd(x.borrowUsd)+'</td><td>'+usd(x.grossBonusCeilingUsd)+'</td><td>'+usd(x.gasEstimateUsd)+'</td><td><b class="'+(x.preSwapUpperBoundUsd>0?'orange':'red')+'">'+usd(x.preSwapUpperBoundUsd)+'</b></td><td><span class="tag">'+esc(x.qualification)+'</span></td></tr>').join('')||'<tr><td colspan="7">Aucun candidat examiné.</td></tr>';
   $('evmErrors').textContent=(data.errors||[]).length+' erreur(s) RPC/API';
  }catch(e){
   $('evmStatus').textContent='⚠ '+String(e.message).slice(0,52);$('evmStatus').className='pill red';
  }
 }
 $('evmRefresh').onclick=refresh;
 refresh();setInterval(refresh,5*60000);
})();