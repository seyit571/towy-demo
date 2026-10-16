'use strict';
(function(){
 const $=x=>document.getElementById(x);
 const root='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/';
 async function read(f){try{const r=await fetch(root+f+'?t='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
 async function paint(){
  const [b,v,e,s]=await Promise.all(['bsc.json','bsc-v3.json','evm.json','snapshot.json'].map(read));
  const tests=(Number(b?.scenarios)||0)+(Number(v?.scenarioCount)||0);
  $('overviewTests').textContent=tests?tests.toLocaleString('fr-FR'):'—';
  $('overviewPositive').textContent=String((Number(b?.positiveScenarios)||0)+(Number(v?.positiveAfterAssumptions)||0));
  $('overviewOnchain').textContent=e?.positions?String(e.positions.length):'—';
  $('overviewSol').textContent=s?.jupiterQuoteTotal!=null?String(s.jupiterQuoteTotal):'—';
  $('overviewAtomic').textContent='0';
  $('overviewRealized').textContent='0 €';
  const times=[b?.timestamp,v?.timestamp,e?.timestamp,s?.capturedAt].filter(Boolean).map(x=>Date.parse(x)).filter(Number.isFinite);
  const oldest=times.length?Math.min(...times):null;
  $('overviewFresh').textContent=oldest!=null?Math.max(0,Math.floor((Date.now()-oldest)/60000))+' min (source la plus ancienne)':'Sources indisponibles';
 }
 paint();setInterval(paint,300000);
})();