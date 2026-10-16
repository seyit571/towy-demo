'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=x=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:5}):'—';
  const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url='https://raw.githubusercontent.com/seyit571/towy-demo/omega-data/omega/data/triangles.json';
  async function get(){
    try{
      const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
      const d=await r.json();
      if(d.method!=='V2_RESERVE_MODEL_ONLY_NOT_TRANSACTION')throw Error('Unknown data method');
      const age=Math.max(0,Math.round((Date.now()-Date.parse(d.timestamp))/60000));
      $('triStatus').textContent=age>20?'⚠ DATA '+age+' MIN':'● REAL ONCHAIN RESERVES';
      $('triStatus').className='pill '+(age>20?'red':'ok');
      $('triBlock').textContent=Number(d.block||0).toLocaleString('fr-FR');
      $('triPools').textContent=d.poolsRead??'—';
      $('triPaths').textContent=Number(d.distinctPaths||0).toLocaleString('fr-FR');
      $('triTests').textContent=Number(d.amountsSampled||0).toLocaleString('fr-FR');
      $('triGross').textContent=d.grossPositiveTests??'—';
      $('triNet').textContent=d.indicativePositivePaths??'—';
      $('triOptimal').textContent=Number(d.optimalCandidates||0).toLocaleString('fr-FR');
      const best=(d.top||[])[0];
      $('triBestNet').textContent=best&&Number.isFinite(Number(best.netIndicativeUsd))?Number(best.netIndicativeUsd).toLocaleString('fr-FR',{minimumFractionDigits:4,maximumFractionDigits:5})+' 
      $('triRows').innerHTML=(d.top||[]).slice(0,12).map(x=>
        '<tr><td>'+safe(x.route)+'</td><td>'+safe(x.steps.map(s=>s.venue).join(' → '))+'</td><td>'+fmt(x.amount)+' '+safe(x.route.split('→')[0])+'</td><td>'+fmt(x.grossUsdAssumingPeg)+' $</td><td><b class="'+(x.netIndicativeUsd>0?'ok':'red')+'">'+fmt(x.netIndicativeUsd)+' $</b></td></tr>'
      ).join('')||'<tr><td colspan="5">No data</td></tr>';
    }catch(e){$('triStatus').textContent='⚠ '+String(e.message).slice(0,55);$('triStatus').className='pill red'}
  }
  $('triRefresh').onclick=get;get();setInterval(get,300000);
})();:'—';
      $('triBestSize').textContent=best?Number(best.amount).toLocaleString('fr-FR',{maximumFractionDigits:6})+' '+safe(best.route.split('→')[0]):'—';
      $('triRows').innerHTML=(d.top||[]).slice(0,12).map(x=>
        '<tr><td>'+safe(x.route)+'</td><td>'+safe(x.steps.map(s=>s.venue).join(' → '))+'</td><td>'+fmt(x.amount)+' '+safe(x.route.split('→')[0])+'</td><td>'+fmt(x.grossUsdAssumingPeg)+' $</td><td><b class="'+(x.netIndicativeUsd>0?'ok':'red')+'">'+fmt(x.netIndicativeUsd)+' $</b></td></tr>'
      ).join('')||'<tr><td colspan="5">No data</td></tr>';
    }catch(e){$('triStatus').textContent='⚠ '+String(e.message).slice(0,55);$('triStatus').className='pill red'}
  }
  $('triRefresh').onclick=get;get();setInterval(get,300000);
})();