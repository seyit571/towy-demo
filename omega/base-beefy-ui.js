'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const root='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/';
 const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function read(f){try{let r=await fetch(root+f+'?t='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
 async function refresh(){
 const [q,f]=await Promise.all([read('base-beefy-quotes.json'),read('base-beefy-fork.json')]);
 if(!q){$('baseRewardStatus').textContent='⚠ CANDIDATS NON DISPONIBLES';return}
 $('baseRewardStatus').textContent='● DEVIS CHAIN-LIVE — NON CONFIRMÉS';$('baseRewardStatus').className='pill warn';
 $('baseRewardScanned').textContent=q.scanned??'—';
 $('baseRewardQuoted').textContent=q.nonzero??'—';
 $('baseRewardForked').textContent=f?.results?.length??'En attente';
 $('baseRewardPositive').textContent=f?.results?.filter(x=>x.atomicSucceeded&&Number(x.actualNetETHAfterGas)>0).length??'—';
 $('baseRewardRows').innerHTML=(q.top||[]).slice(0,15).map(x=>{
  const test=f?.results?.find(y=>y.contract?.toLowerCase()===x.address?.toLowerCase());
  const status=test?(test.atomicSucceeded?'FORK OK':'FORK REVERT'):'NON TESTÉ';
  const net=(test?.atomicSucceeded&&test.actualNetETHAfterGas!=null)?Number(test.actualNetETHAfterGas).toFixed(7)+' ETH':'—';
  return '<tr><td>'+safe(x.id.replace('aerodrome-cow-base-',''))+'</td><td>'+Number(x.rewardNative).toFixed(6)+' ETH</td><td>'+safe(status)+'</td><td>'+safe(net)+'</td></tr>';
 }).join('');
 }
 $('baseRewardRefresh').onclick=refresh;refresh();setInterval(refresh,300000);
})();