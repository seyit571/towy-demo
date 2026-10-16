'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const src='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/sky.json';
 async function refresh(){
  try{
   const r=await fetch(src+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const d=await r.json();
   if(d.source!=='Sky Chainlog and Clipper')throw Error('Source inconnue');
   const age=Math.floor((Date.now()-Date.parse(d.timestamp))/60000);
   $('skyStatus').textContent=age>20?'⚠ DONNÉES '+age+' MIN':'● ON-CHAIN';
   $('skyStatus').className='pill '+(age>20?'red':'ok');
   $('skyScanned').textContent=d.monitoredClippers;
   $('skyConfigured').textContent=d.counts?.rewardConfigured??'—';
   $('skyOpen').textContent=d.openAuctions;
   $('skyRedo').textContent=d.redoCandidates;
   $('skyBlock').textContent=Number(d.block).toLocaleString('fr-FR');
   $('skyRows').innerHTML=(d.clippers||[]).filter(x=>x.flatTipDAI>0&&x.stopped===0).sort((a,b)=>b.flatTipDAI-a.flatTipDAI).slice(0,10).map(x=>
    '<tr><td>'+clean(x.name.replace('MCD_CLIP_',''))+'</td><td>'+x.flatTipDAI.toFixed(0)+' DAI + '+x.chipPercent.toFixed(2)+' %</td><td>'+x.openAuctions+'</td><td>'+x.redoEligible+'</td></tr>'
   ).join('')||'<tr><td colspan="4">Aucune récompense configurée et active.</td></tr>';
  }catch(e){$('skyStatus').textContent='⚠ '+String(e.message).slice(0,45);$('skyStatus').className='pill red'}
 }
 $('skyReload').onclick=refresh;refresh();setInterval(refresh,300000);
})();