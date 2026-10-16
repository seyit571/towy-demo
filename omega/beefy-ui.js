'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const fix=(x,n=6)=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('fr-FR',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function reload(){
 try{
  const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/beefy-fork.json?'+Date.now();
  const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
  const d=await res.json();if(d.type!=='FORK_BEEFY_HARVEST'||!Array.isArray(d.examples))throw Error('Unknown proof');
  const rows=d.examples;
  $('beefyChecked').textContent=rows.length;
  $('beefyPassed').textContent=rows.filter(x=>x.atomicExecutionSucceeded===true).length;
  $('beefyPositive').textContent=rows.filter(x=>x.atomicExecutionSucceeded&&x.netAfterGasBNB>0).length;
  $('beefyBlock').textContent=Number(d.forkBlock).toLocaleString('fr-FR');
  $('beefyRows').innerHTML=rows.map(x=>
   '<tr><td>'+esc(x.id.replace('pancake-cow-bsc-','').replace('-vault',''))+'</td><td>'+esc(x.quotedRewardWBNB)+' WBNB</td><td>'+esc(x.walletCreditWBNB)+' WBNB</td><td>'+esc(x.feeBNB)+' BNB</td><td><b class="'+(Number(x.netAfterGasBNB)>0?'ok':'red')+'">'+fix(x.netAfterGasUsd,4)+' $</b></td></tr>').join('');
  $('beefyStatus').textContent='● REÇUS FORK ET SOLDE WALLET MESURÉS';$('beefyStatus').className='pill ok';
 }catch(e){$('beefyStatus').textContent='⚠ '+String(e.message).slice(0,50);$('beefyStatus').className='pill red'}
 }
 $('beefyRefresh').onclick=reload;reload();
})();