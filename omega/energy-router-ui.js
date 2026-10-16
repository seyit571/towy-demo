'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const fmt=(n,unit='',digits=2)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('fr-FR',{minimumFractionDigits:digits,maximumFractionDigits:digits})+' '+unit:'—';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/energy-router.json';
 let busy=false;
 async function refresh(){
  if(busy)return;busy=true;
  try{
   const res=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!res.ok)throw Error('HTTP '+res.status);
   const j=await res.json();if(j.schema!==1||!Array.isArray(j.topGrossHypotheses))throw Error('Invalid market snapshot');
   const age=Math.max(0,Math.floor((Date.now()-Date.parse(j.timestamp))/60000));
   const healthy=age<=20&&!j.errors?.length;
   $('energyStatus').textContent=healthy?'● CARNET PUBLIC ACTUALISÉ':'⚠ SNAPSHOT OU SOURCE DÉGRADÉS';
   $('energyStatus').className='pill '+(healthy?'ok':'red');
   $('energyAge').textContent=Number.isFinite(age)?age+' min':'—';
   $('energyBids').textContent=String(j.publicBidRowsFound||0);
   $('energyQuotes').textContent=String(j.comparableQuoteCount||0);
   $('energySpreads').textContent=String(j.nominalPositivePriceDifferences||0);
   const max=j.topGrossHypotheses.filter(x=>x.status==='GROSS_PRICE_GAP_ONLY'&&x.afterStressEurIllustrative>0)[0];
   $('energyBestSpread').textContent=max?fmt(max.afterStressEurIllustrative,'€'):'—';
   $('energyMinute').textContent=fmt(j.verifiedNetPerMinuteEur,'€');
   $('energyHour').textContent=fmt(j.verifiedNetPerHourEur,'€');
   $('energyTotal').textContent=fmt(j.verifiedNetTotalEur,'€');
   $('energyExecuted').textContent=String(j.orderFillsExecuted??0);
   $('energyFx').textContent=fmt(j.fxTrxToEur,'€/TRX',5);
   $('energyWhy').textContent=j.blocker;
   $('energyRows').innerHTML=j.topGrossHypotheses.slice(0,12).map(x=>{
    const gap=x.afterStressEurIllustrative;
    const positive=gap>0&&x.status==='GROSS_PRICE_GAP_ONLY';
    return '<tr><td>'+esc(x.venue)+'</td><td>'+esc(x.label)+'</td><td>'+Number(x.remainingApprox).toLocaleString('fr-FR')+'</td><td>'+fmt(x.bidSunPerUnitPerDay,'SUN/j')+'</td><td>'+fmt(x.supplierPriceTrx,'TRX')+'</td><td><strong class="'+(positive?'orange':'red')+'">'+fmt(gap,'€')+'</strong></td><td><span class="tag '+(positive?'':'bad')+'">'+(positive?'HYPOTHÈSE':'NON RENTABLE')+'</span></td></tr>';
   }).join('');
  }catch(e){$('energyStatus').textContent='⚠ '+String(e.message).slice(0,64);$('energyStatus').className='pill red'}
  finally{busy=false}
 }
 $('energyRefresh').onclick=refresh;
 refresh();setInterval(refresh,60000);
})();