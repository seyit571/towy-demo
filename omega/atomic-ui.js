'use strict';
(function(){
const $=id=>document.getElementById(id);
const el=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(Number(n))?(Number(n)<0?'−':'')+'$'+Math.abs(Number(n)).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:5}):'—';
const qty=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{maximumFractionDigits:6}):'—';
async function update(){
 try{
 const r=await fetch('https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/atomic-fork.json?u='+Date.now(),{cache:'no-store'});
 if(!r.ok)throw Error('HTTP '+r.status);
 const d=await r.json();
 if(d.source!=='Ganache local fork'||!Array.isArray(d.attempts))throw Error('Source non validée');
 const rows=d.attempts;
 const success=rows.filter(x=>x.success===true&&x.atomic===true);
 const best=success.slice().sort((a,b)=>Number(b.netUSDIllustrative||-1e6)-Number(a.netUSDIllustrative||-1e6))[0]||null;
 const successfulNet=success.filter(x=>Number(x.netUSDIllustrative)>0);
 $('forkSuccessful').textContent=success.length+' / '+rows.length;
 $('forkGross').textContent=best?qty(best.profitBSW)+' BSW':'—';
 $('forkNet').textContent=best?money(best.netUSDIllustrative):'—';
 $('forkNet').className='big '+(best&&best.netUSDIllustrative>0?'ok':'red');
 $('forkNetPositive').textContent=successfulNet.length;
 $('forkSourceBlock').textContent=Number(d.sourceBlock||d.forkBlock).toLocaleString('fr-FR');
 $('forkTestWallet').textContent='TEST WALLET — sans argent réel';
 $('forkPriceBNB').textContent=money(d.bnbUSDPriceFromOnchainQuote);
 $('forkStatus').textContent='● SIMULATIONS ATOMIQUES SUR FORK';
 $('forkStatus').className='pill ok';
 $('forkRows').innerHTML=rows.map(x=>'<tr><td>'+qty(x.borrowBusd)+' BUSD</td><td><span class="tag '+(x.success?'':'bad')+'">'+(x.success?'OK · fork':'REVERT · fork')+'</span></td><td>'+qty(x.profitBSW)+' BSW</td><td>'+money(x.gasCostUSDIllustrative)+'</td><td><b class="'+(x.netUSDIllustrative>0?'ok':'red')+'">'+money(x.netUSDIllustrative)+'</b></td><td>'+ (x.txHash?'<code>'+el(x.txHash.slice(0,10))+'…</code>':'—')+'</td></tr>').join('');
 }catch(e){$('forkStatus').textContent='⚠ '+String(e.message).slice(0,60);$('forkStatus').className='pill red'}
}
$('forkRefresh').onclick=update;update();setInterval(update,300000);
})();