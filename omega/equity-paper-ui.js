'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/equity-paper.json';
 async function update(){
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();
   if(j.schema!==1||j.mode!=='VIRTUAL_TWO_VENUE_PAPER_SIMULATOR')throw Error('format invalide');
   const age=Math.floor((Date.now()-Date.parse(j.timestamp))/60000);
   $('epStatus').textContent=age>20?'⚠ JOURNAL ANCIEN':'● JOURNAL PAPER AUTO';
   $('epStatus').className='pill '+(age>20?'red':'ok');
   $('epPositions').textContent=fmt(j.openCount,0);
   $('epClosed').textContent=fmt(j.closedCount,0);
   $('epTotal').textContent=fmt(j.closedPaperNetUsd,2)+' $';
   $('epCapital').textContent=fmt(j.assumedCashAndMarginAtLeastUsd,0)+' $';
   $('epTimestamp').textContent=new Date(j.timestamp).toLocaleString('fr-FR');
  }catch(e){
   $('epStatus').textContent='⚠ JOURNAL INDISPONIBLE';
   $('epStatus').className='pill red';
  }
 }
 update();setInterval(update,60000);
})();