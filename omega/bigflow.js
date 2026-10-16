'use strict';
/* OMEGA BIGFLOW: measured market notional + sensitivity arithmetic; not a profit or execution simulator. */
(function(){
 const $=id=>document.getElementById(id);
 const money=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const euros=v=>Number.isFinite(v)?v.toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}):'—';
 const compact=v=>!Number.isFinite(v)?'—':v>=1e9?(v/1e9).toLocaleString('fr-FR',{maximumFractionDigits:2})+' Md':v>=1e6?(v/1e6).toLocaleString('fr-FR',{maximumFractionDigits:1})+' M':money(v);
 const endpoints={
  hyperliquid:'https://api.hyperliquid.xyz/info',
  raydium:'https://api-v3.raydium.io/main/info',
  fx:'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
 };
 let cache={hyperliquidUSD:null,raydiumUSD:null,assets:null,usdEur:null,fxDate:null,updated:null};
 let selectedShare=1,edgeBps=1,err=[];
 const ctl=(ms)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return [c,()=>clearTimeout(t)]};
 async function getJSON(url,body){
  const [c,done]=ctl(14000);
  try{
   const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:c.signal,cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   return await r.json();
  }finally{done()}
 }
 async function poll(){
  $('bigflowStatus').textContent='● Chargement API…';$('bigflowStatus').className='pill';
  err=[];
  const outputs=await Promise.allSettled([
   getJSON(endpoints.hyperliquid,{type:'metaAndAssetCtxs'}),
   getJSON(endpoints.raydium),
   getJSON(endpoints.fx)
  ]);
  if(outputs[0].status==='fulfilled'){
   const response=outputs[0].value;
   if(Array.isArray(response)&&Array.isArray(response[1])){
    cache.hyperliquidUSD=response[1].reduce((v,x)=>v+(Number(x.dayNtlVlm)||0),0);
    cache.assets=response[1].length;
   }else err.push('Hyperliquid : réponse inattendue');
  }else err.push('Hyperliquid : '+String(outputs[0].reason).slice(0,65));
  if(outputs[1].status==='fulfilled'){
   const d=outputs[1].value?.data;cache.raydiumUSD=d?Number(d.volume24):null;
   if(!Number.isFinite(cache.raydiumUSD))err.push('Raydium : volume indisponible');
  }else err.push('Raydium : '+String(outputs[1].reason).slice(0,65));
  if(outputs[2].status==='fulfilled'){
   const d=outputs[2].value;
   if(Number(d?.rates?.EUR)>0){cache.usdEur=Number(d.rates.EUR);cache.fxDate=d.date}
   else err.push('FX : taux invalide');
  }else err.push('FX : '+String(outputs[2].reason).slice(0,65));
  cache.updated=Date.now();render();
  $('bigflowStatus').textContent=err.length?'⚠ '+err.length+' source(s) indisponible(s)':'● FLUX MARCHÉ MESURÉ';
  $('bigflowStatus').className='pill '+(err.length?'red':'ok');
 }
 function render(){
  const h=cache.hyperliquidUSD,r=cache.raydiumUSD,fx=cache.usdEur;
  $('bigflowHyper').textContent=h===null?'—':compact(h)+' $';
  $('bigflowRay').textContent=r===null?'—':compact(r)+' $';
  $('bigflowMarkets').textContent=cache.assets==null?'—':money(cache.assets);
  $('bigflowRate').textContent=fx===null?'—':'1 $ = '+money(fx,5)+' €';
  $('bigflowFxDate').textContent=cache.fxDate?'Taux du '+cache.fxDate:'Taux indisponible';
  $('bigflowUpdated').textContent=cache.updated?new Date(cache.updated).toLocaleTimeString('fr-FR'):'—';
  const combined=h!==null&&r!==null&&fx!==null?(h+r)*fx:null;
  $('bigflowCombined').textContent=combined===null?'—':compact(combined)+' € / 24 h';
  $('bigflowShare').textContent=money(selectedShare,2)+' %';
  $('bigflowEdge').textContent=money(edgeBps,1)+' bps nets';
  $('bigflowShareSlider').value=String(selectedShare);
  $('bigflowEdgeSlider').value=String(edgeBps);
  const captured=combined===null?null:combined*(selectedShare/100)*(edgeBps/10000);
  const target=50*1440;
  const requiredBps=combined>0?target/(combined*(selectedShare/100))*10000:null;
  const requiredShare=combined>0?target/(combined*(edgeBps/10000))*100:null;
  $('bigflowScenarioDay').textContent=captured===null?'—':euros(captured);
  $('bigflowScenarioMinute').textContent=captured===null?'—':euros(captured/1440);
  $('bigflowRequiredEdge').textContent=requiredBps===null?'—':money(requiredBps,2)+' bps';
  $('bigflowRequiredShare').textContent=requiredShare===null?'—':money(requiredShare,2)+' % du volume';
  $('bigflowTargetProgress').textContent=captured===null?'—':money(captured/target*100,2)+' % de la cible théorique';
  const progress=captured===null?0:Math.min(100,Math.max(0,captured/target*100));
  const line=$('bigflowProgressLine');line.style.width=progress+'%';
  $('bigflowMissing').textContent=err.join(' · ')||'Scénario entièrement hypothétique : aucun ordre attribué à OMEGA';
 }
 $('bigflowShareSlider').addEventListener('input',e=>{selectedShare=Number(e.target.value);render()});
 $('bigflowEdgeSlider').addEventListener('input',e=>{edgeBps=Number(e.target.value);render()});
 $('bigflowRefresh').addEventListener('click',poll);
 poll();setInterval(poll,120000);
})();