(()=>{
'use strict';
const KEY='towy-unified-v1';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const services={
 roadside:{tow:'Remorquage',battery:'Batterie',tire:'Crevaison',fuel:'Panne sèche',winch:'Treuillage'},
 business:{recovery:'Récupération chez un client',tow:'Remorquage vers garage',transfer:'Transfert entre garages',delivery:'Livraison de véhicule'},
 transport:{auto:'Transport de véhicule'}
};
const categoryName={roadside:'Dépannage',business:'Mission garage',transport:'Transport'};
const vehicleName={car:'Voiture',suv:'SUV / 4x4',van:'Utilitaire léger',moto:'Moto / scooter'};
const statusName={pending:'À attribuer',assigned:'Acceptée',pickedup:'En cours',done:'Terminée',cancelled:'Annulée'};
const providers=[
 {id:'p1',name:'Moselle Assistance Démo',city:'Thionville',kinds:['roadside','business'],plateau:true,online:true},
 {id:'p2',name:'Metz Plateau Démo',city:'Metz',kinds:['roadside','business','transport'],plateau:true,online:true},
 {id:'p3',name:'Grand Est AutoLog Démo',city:'Nancy',kinds:['transport','business'],plateau:true,online:true}
];
const tomorrow=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const eu=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fresh(){return {jobs:[
{id:'TY-1001',category:'business',owner:'demo',company:'Garage Pilote Démo',service:'recovery',vehicle:'car',condition:'nonrolling',model:'Renault Clio',from:'Thionville',to:'Yutz',km:8,date:tomorrow(1),priority:'today',notes:'Véhicule de démonstration',estimate:116,status:'pending',providerId:null,offers:[],chosenOffer:null,at:Date.now()-180000},
{id:'TY-1002',category:'transport',owner:'demo',company:'',service:'auto',vehicle:'suv',condition:'rolling',model:'Volkswagen Tiguan',from:'Metz',to:'Lyon',km:450,date:tomorrow(7),priority:'planned',notes:'Trajet fictif',estimate:null,status:'pending',providerId:null,offers:[{id:'OF-501',providerId:'p2',price:440,days:3,message:'Plateau disponible',at:Date.now()-10000},{id:'OF-502',providerId:'p3',price:395,days:4,message:'Enlèvement flexible',at:Date.now()-5000}],chosenOffer:null,at:Date.now()-160000}
],providers:providers.map(p=>({...p,kinds:[...p.kinds]})),nextJob:1003,nextOffer:503};}
function load(){try{const obj=JSON.parse(localStorage.getItem(KEY));if(obj&&Array.isArray(obj.jobs)&&Array.isArray(obj.providers)&&Number.isFinite(obj.nextJob)&&Number.isFinite(obj.nextOffer))return obj}catch(e){}return fresh()}
let state=load(),role='home',selectedProvider='p1',category='roadside',owner='client',detailId=null,biddingId=null,filters={client:'all',garage:'all',control:'all'},toastHandle=null;
const findJob=id=>state.jobs.find(j=>j.id===id),findPro=id=>state.providers.find(p=>p.id===id);
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
function say(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>$('#toast').classList.remove('show'),3600)}
function close(id){$('#'+id).classList.remove('open');if(id==='detailModal')detailId=null;if(id==='offerModal')biddingId=null}
function go(which,updateHash=true){if(!['home','client','garage','partner','control'].includes(which))return;role=which;$$('.view').forEach(x=>x.classList.toggle('active',x.id===which));$$('.mainnav button').forEach(x=>x.classList.toggle('active',x.dataset.view===which));['createModal','detailModal','offerModal'].forEach(close);render();if(updateHash&&location.hash!=='#'+which){history.replaceState(null,'','#'+which)}window.scrollTo({top:0,behavior:'instant'})}
$$('[data-view]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();go(b.dataset.view)}));
function setCategory(cat){if(!services[cat])cat='roadside';category=cat;$('#jobCategory').value=cat;$('#jobService').innerHTML=Object.entries(services[cat]).map(([k,v])=>'<option value="'+k+'">'+escape(v)+'</option>').join('');const show=cat==='business';$('#companyGroup').style.display=show?'block':'none';$('#jobCompany').required=show;$('#jobPriority').value=cat==='transport'?'planned':cat==='roadside'?'urgent':'today';$('#jobPriority').disabled=cat==='transport';updateEstimate()}
function openCreate(cat,requestedOwner){owner=requestedOwner==='garage'||requestedOwner==='client'?requestedOwner:cat==='business'?'garage':'client';$('#createForm').reset();$('#jobDate').value=tomorrow(0);$('#jobDate').min=tomorrow(0);setCategory(cat);$('#createTitle').textContent=cat==='business'?'Nouvelle mission de garage':cat==='transport'?'Transporter un véhicule':'Demander un dépannage';$('#createModal').classList.add('open')}
$$('[data-new]').forEach(b=>b.addEventListener('click',()=>openCreate(b.dataset.new,b.dataset.owner)));
$('#jobCategory').addEventListener('change',e=>{setCategory(e.target.value);if(category==='business')owner='garage';else if(role==='garage')owner='garage';else owner='client'});
function calcPrice(){const km=Math.min(300,Math.max(1,Number($('#jobKm').value)||1));const isNon=$('#jobCondition').value==='nonrolling';const vehicle=$('#jobVehicle').value;const service=$('#jobService').value,priority=$('#jobPriority').value;
const base={tow:72,battery:55,tire:59,fuel:65,winch:120,recovery:65,transfer:64,delivery:60}[service]||65;const mult={car:1,suv:1.14,van:1.3,moto:.95}[vehicle]||1;const urgency={planned:1,today:1.18,urgent:1.4}[priority]||1;return Math.round((base+km*2.7+(isNon?20:0))*mult*urgency)}
function updateEstimate(){const isTransport=category==='transport';$('#pricingCaption').textContent=isTransport?'Transport planifié — appels d’offres':'Estimation indicative · non contractuelle';$('#pricingValue').textContent=isTransport?'Sur devis':eu(calcPrice());$('#pricingExplain').textContent=isTransport?'Les partenaires de test proposent leurs tarifs. Aucun prix réel garanti.':'Calcul fictif selon km, véhicule et priorité. Aucun tarif réel validé.'}
['jobService','jobVehicle','jobCondition','jobKm','jobPriority'].forEach(id=>$('#'+id).addEventListener('input',updateEstimate));
$('#createForm').addEventListener('submit',e=>{
 e.preventDefault();if(!e.currentTarget.reportValidity())return;
 const from=$('#jobFrom').value.trim(),to=$('#jobTo').value.trim(),company=$('#jobCompany').value.trim(),model=$('#jobModel').value.trim(),km=Number($('#jobKm').value),date=$('#jobDate').value;
 if(from.length<2||to.length<2||!Number.isInteger(km)||km<1||km>300){say('Vérifiez les villes et la distance.');return}
 if(from.toLocaleLowerCase('fr')===to.toLocaleLowerCase('fr')){say('La ville de départ doit différer de la destination.');return}
 if(date<tomorrow(0)){say('Choisissez une date actuelle ou future.');return}
 if(category==='business'&&company.length<2){say('Indiquez un nom de garage de démonstration.');return}
 const job={id:'TY-'+state.nextJob++,category,owner,company:category==='business'?company:'',service:$('#jobService').value,vehicle:$('#jobVehicle').value,condition:$('#jobCondition').value,model,from,to,km,date,priority:$('#jobPriority').value,notes:$('#jobNotes').value.trim().slice(0,300),estimate:category==='transport'?null:calcPrice(),status:'pending',providerId:null,offers:[],chosenOffer:null,at:Date.now()};
 state.jobs.unshift(job);save();close('createModal');const v=owner==='garage'?'garage':'client';go(v);say('Mission de démonstration '+job.id+' créée.');openDetails(job.id)
});
function compatible(p,j){return p&&p.online&&p.kinds.includes(j.category)&&(!['nonrolling'].includes(j.condition)||p.plateau)}
function statusPill(job){return '<span class="status '+escape(job.status)+'">'+statusName[job.status]+'</span>'}
function jobCard(job,context){let action='<button class="tiny light" data-open="'+job.id+'">Détails ↗</button>',cost=job.category==='transport'?(job.chosenOffer?eu(job.offers.find(o=>o.id===job.chosenOffer)?.price||0):job.offers.length+' devis'):eu(job.estimate);
 if(context==='partnerAvailable'){action=job.category==='transport'?'<button class="tiny" data-bid="'+job.id+'">Proposer un prix ↗</button>':'<button class="tiny" data-take="'+job.id+'">Accepter '+cost+' ↗</button>'}
 if(context==='partnerActive'&&job.status==='assigned')action='<button class="tiny green" data-progress="'+job.id+'" data-next="pickedup">Confirmer enlèvement</button>';
 if(context==='partnerActive'&&job.status==='pickedup')action='<button class="tiny green" data-progress="'+job.id+'" data-next="done">Terminer mission</button>';
 if(context==='control'&&job.status==='pending'&&job.category!=='transport')action='<button class="tiny" data-match="'+job.id+'">Attribuer démo ↗</button><button class="tiny light" data-open="'+job.id+'">Détails</button>';
 const company=job.company?' · '+escape(job.company):'';
 const head=(job.model?escape(job.model):vehicleName[job.vehicle])+' · '+services[job.category][job.service];
 return '<article class="mission"><div><div class="badgeline">'+statusPill(job)+'<span class="status neutral">'+categoryName[job.category]+'</span>'+(job.owner==='demo'?'<span class="status neutral">EXEMPLE</span>':'')+'</div><h3>'+head+'</h3><div class="muted">'+escape(job.from)+' → '+escape(job.to)+' · '+job.km+' km · '+escape(job.date.split('-').reverse().join('/'))+company+'<br>Référence '+escape(job.id)+(job.providerId?' · '+escape(findPro(job.providerId)?.name||''):'')+'</div></div><div class="actionzone"><span class="value">'+cost+'</span><div class="buttons">'+action+'</div></div></article>'
}
const blank=s=>'<div class="empty">'+s+'</div>';
const statsHtml=items=>items.map(([label,value,note])=>'<div class="stat"><label>'+label+'</label><strong>'+value+'</strong><small>'+note+'</small></div>').join('');
function roleMetrics(jobs){return [['Mes demandes',jobs.length,'Créées dans ce navigateur'],['À attribuer',jobs.filter(j=>j.status==='pending').length,'Missions de test'],['En cours',jobs.filter(j=>['assigned','pickedup'].includes(j.status)).length,'Acceptées ou enlevées'],['Terminées',jobs.filter(j=>j.status==='done').length,'Aucune intervention réelle']]}
function filterJobs(jobs,by){return jobs.filter(j=>by==='all'||j.category===by||j.status===by)}
function renderClientGarage(which){const ownerType=which==='client'?'client':'garage',jobs=state.jobs.filter(j=>j.owner===ownerType),choice=filters[which];
 $('#'+which+'Stats').innerHTML=statsHtml(roleMetrics(jobs));
 $('#'+which+'Jobs').innerHTML=filterJobs(jobs,choice).length?filterJobs(jobs,choice).map(j=>jobCard(j,which)).join(''):blank('Aucune demande dans cette catégorie. Créez une mission pour tester le circuit.');
}
function renderPartner(){
 const p=findPro(selectedProvider)||state.providers[0];selectedProvider=p.id;
 $('#partnerSelect').innerHTML=state.providers.map(x=>'<option value="'+escape(x.id)+'">'+escape(x.name)+'</option>').join('');
 $('#partnerSelect').value=selectedProvider;$('#partnerName').textContent=p.name;
 $('#partnerDescription').textContent=p.city+' · '+p.kinds.map(k=>categoryName[k]).join(' / ')+' · '+(p.plateau?'Plateau disponible':'Assistance légère');
 $('#partnerOnline').checked=p.online;
 const available=state.jobs.filter(j=>j.status==='pending'&&compatible(p,j)&&(j.category!=='transport'||!j.offers.some(o=>o.providerId===p.id)));
 const assigned=state.jobs.filter(j=>j.providerId===p.id&&['assigned','pickedup','done'].includes(j.status));
 const proposed=state.jobs.filter(j=>j.category==='transport'&&j.offers.some(o=>o.providerId===p.id));
 $('#partnerCount').textContent=available.length+' mission(s)';
 $('#partnerAvailableJobs').innerHTML=available.length?available.map(j=>jobCard(j,'partnerAvailable')).join(''):blank(p.online?'Aucune nouvelle mission compatible. Créez une demande dans le parcours client ou garage.':'Activez la disponibilité pour recevoir des missions de démonstration.');
 $('#partnerAssignedJobs').innerHTML=assigned.length?assigned.map(j=>jobCard(j,'partnerActive')).join(''):blank('Aucune mission attribuée à ce transporteur de test.');
 $('#partnerBidJobs').innerHTML=proposed.length?proposed.map(j=>jobCard(j,'partnerBids')).join(''):blank('Aucune proposition de transport envoyée.');
}
function renderControl(){
 const jobs=state.jobs;
 const quoted=jobs.filter(j=>j.status==='pending'&&j.category==='transport'&&j.offers.length>0).length;
 const totalDemo=jobs.filter(j=>j.status==='done').reduce((sum,j)=>sum+(j.category==='transport'?(j.offers.find(x=>x.id===j.chosenOffer)?.price||0):(j.estimate||0)),0);
 $('#controlStats').innerHTML=statsHtml([['Missions',jobs.length,'Registre unique'],['À attribuer',jobs.filter(j=>j.status==='pending').length,'Dont '+quoted+' transports avec devis'],['Clôturées',jobs.filter(j=>j.status==='done').length,'Simulations uniquement'],['Volume fictif',eu(totalDemo),'Aucun chiffre d’affaires réel']]);
 $('#providerRoster').innerHTML=state.providers.map(p=>'<article><strong>'+escape(p.name)+'</strong><small>'+escape(p.city)+' · '+(p.online?'Disponible':'Indisponible')+' · '+p.kinds.map(k=>categoryName[k]).join(', ')+'</small></article>').join('');
 const shown=filterJobs(jobs,filters.control);$('#controlJobs').innerHTML=shown.length?shown.map(j=>jobCard(j,'control')).join(''):blank('Aucune mission dans cette catégorie.');
}
function render(){renderClientGarage('client');renderClientGarage('garage');renderPartner();renderControl()}
$('#partnerSelect').addEventListener('change',e=>{selectedProvider=e.target.value;render()});
$('#partnerOnline').addEventListener('change',e=>{const p=findPro(selectedProvider);if(!p)return;p.online=e.target.checked;save();render();say(p.online?'Prestataire disponible (simulation).':'Prestataire indisponible (simulation).')});
$$('[id$="Filters"]').forEach(group=>group.addEventListener('click',e=>{const b=e.target.closest('[data-scope-filter]');if(!b)return;const which=group.id.replace('Filters','');filters[which]=b.dataset.scopeFilter;group.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()}));
function displayOffer(q,j){const p=findPro(q.providerId);const permitted=j.owner===role&&j.status==='pending';return '<div class="offerrow"><div><strong>'+escape(p?.name||'Prestataire démo')+'</strong><p>'+q.days+' jour(s) · '+escape(q.message||'Proposition de transport fictive')+'</p></div><div class="cost"><b>'+eu(q.price)+'</b>'+(j.chosenOffer===q.id?'<span class="status done">Retenu</span>':permitted?'<button class="tiny" data-choose="'+escape(j.id)+'" data-offer="'+escape(q.id)+'">Choisir cette offre ↗</button>':'')+'</div></div>'}
function openDetails(id){
 const j=findJob(id);if(!j)return;detailId=id;
 $('#detailTitle').textContent=services[j.category][j.service]+' · '+j.id;
 $('#detailSubtitle').textContent=categoryName[j.category]+' · '+statusName[j.status];
 $('#detailBody').innerHTML='<strong>'+escape(j.from)+' → '+escape(j.to)+'</strong><br>'+escape(j.model||vehicleName[j.vehicle])+' · '+j.km+' km · '+escape(j.date.split('-').reverse().join('/'))+'<br>Véhicule : '+(j.condition==='nonrolling'?'Non roulant / en panne':'Roulant')+' · Priorité : '+escape(j.priority)+'<br>'+ (j.company?'Établissement : '+escape(j.company)+'<br>':'')+(j.notes?'Instructions : '+escape(j.notes)+'<br>':'')+'Tarif : <b>'+(j.category==='transport'?(j.chosenOffer?eu(j.offers.find(x=>x.id===j.chosenOffer)?.price||0):'Sur devis'):eu(j.estimate))+'</b><br>Statut : <b>'+statusName[j.status]+'</b>'+(j.providerId?'<br>Partenaire : '+escape(findPro(j.providerId)?.name||''):'');
 $('#detailOffers').innerHTML=j.category==='transport'?'<h3>'+j.offers.length+' proposition(s) tarifaires</h3>'+(j.offers.length?j.offers.slice().sort((a,b)=>a.price-b.price).map(q=>displayOffer(q,j)).join(''):blank('Aucune proposition. Allez dans TOWY Pro pour simuler un devis.')):'';
 const ownerView=j.owner===role;let actions='<button class="btn outline small" data-detail-close>Fermer</button>';
 if(ownerView&&j.status==='pending')actions+='<button class="btn outline small" data-cancel="'+j.id+'">Annuler la demande</button>';
 if(role==='partner'&&j.providerId===selectedProvider&&j.status==='assigned')actions+='<button class="btn orange small" data-progress="'+j.id+'" data-next="pickedup">Confirmer enlèvement</button>';
 if(role==='partner'&&j.providerId===selectedProvider&&j.status==='pickedup')actions+='<button class="btn orange small" data-progress="'+j.id+'" data-next="done">Terminer mission</button>';
 if(role==='control'&&j.status==='pending'&&j.category!=='transport')actions+='<button class="btn orange small" data-match="'+j.id+'">Attribuer automatiquement (démo)</button>';
 $('#detailActions').innerHTML=actions;$('#detailModal').classList.add('open');
}
function takeJob(id){const j=findJob(id),p=findPro(selectedProvider);if(!j||j.status!=='pending'||j.category==='transport'||!compatible(p,j)){say('Mission non compatible ou déjà attribuée.');return}j.providerId=p.id;j.status='assigned';save();render();close('detailModal');say('Mission '+j.id+' acceptée (simulation).')}
function progress(id,next){const j=findJob(id);if(!j)return;if(role!=='control'&&(role!=='partner'||j.providerId!==selectedProvider))return;if(j.status==='assigned'&&next==='pickedup'||j.status==='pickedup'&&next==='done'){j.status=next;save();render();if($('#detailModal').classList.contains('open'))openDetails(id);say(j.id+' : '+statusName[next]+' (simulation).')}}
function autoMatch(id){const j=findJob(id);if(!j||role!=='control'||j.status!=='pending'||j.category==='transport'){say('Attribution impossible pour cette mission.');return}
 const elig=state.providers.filter(p=>compatible(p,j)).sort((a,b)=>Number(b.city.toLocaleLowerCase('fr')===j.from.toLocaleLowerCase('fr'))-Number(a.city.toLocaleLowerCase('fr')===j.from.toLocaleLowerCase('fr')));
 if(!elig.length){say('Aucun prestataire de démonstration compatible et disponible.');return}
 j.providerId=elig[0].id;j.status='assigned';save();render();if($('#detailModal').classList.contains('open'))openDetails(id);say(j.id+' attribuée à '+elig[0].name+' (règle de démo, sans GPS).')
}
function openBid(id){const j=findJob(id),p=findPro(selectedProvider);if(role!=='partner'||!j||j.category!=='transport'||j.status!=='pending'||!compatible(p,j)||j.offers.some(q=>q.providerId===p.id)){say('Impossible de proposer un devis pour cette mission.');return}
 biddingId=id;$('#offerForm').reset();$('#offerDays').value='3';$('#offerTitle').textContent='Devis '+j.id+' · '+j.from+' → '+j.to;close('detailModal');$('#offerModal').classList.add('open')
}
$('#offerForm').addEventListener('submit',e=>{
 e.preventDefault();if(!e.currentTarget.reportValidity())return;const j=findJob(biddingId),p=findPro(selectedProvider);const amount=Number($('#offerAmount').value),days=Number($('#offerDays').value);
 if(!j||j.status!=='pending'||j.category!=='transport'||!compatible(p,j)||j.offers.some(x=>x.providerId===p.id))return;
 if(!Number.isInteger(amount)||amount<20||amount>20000||!Number.isInteger(days)||days<1||days>45){say('Prix ou délai incorrect.');return}
 j.offers.push({id:'OF-'+state.nextOffer++,providerId:p.id,price:amount,days,message:$('#offerMessage').value.trim().slice(0,150),at:Date.now()});save();close('offerModal');render();say('Proposition fictive de '+eu(amount)+' envoyée.')
});
function choose(id,offerId){const j=findJob(id);if(!j||j.owner!==role||j.category!=='transport'||j.status!=='pending')return;const q=j.offers.find(x=>x.id===offerId);if(!q||!findPro(q.providerId))return;
 if(!confirm('Accepter l’offre test de '+findPro(q.providerId).name+' à '+eu(q.price)+' ? Aucun paiement réel.'))return;
 j.chosenOffer=offerId;j.providerId=q.providerId;j.status='assigned';save();render();openDetails(id);say('Offre acceptée. Mission attribuée (simulation).')
}
function cancelJob(id){const j=findJob(id);if(!j||j.owner!==role||j.status!=='pending')return;if(!confirm('Annuler la demande '+id+' ?'))return;j.status='cancelled';save();render();if($('#detailModal').classList.contains('open'))openDetails(id);say(id+' annulée.')}
document.addEventListener('click',e=>{
 let b=e.target.closest('[data-open]');if(b){openDetails(b.dataset.open);return}
 b=e.target.closest('[data-take]');if(b){takeJob(b.dataset.take);return}
 b=e.target.closest('[data-bid]');if(b){openBid(b.dataset.bid);return}
 b=e.target.closest('[data-progress]');if(b){progress(b.dataset.progress,b.dataset.next);return}
 b=e.target.closest('[data-match]');if(b){autoMatch(b.dataset.match);return}
 b=e.target.closest('[data-choose]');if(b){choose(b.dataset.choose,b.dataset.offer);return}
 b=e.target.closest('[data-cancel]');if(b){cancelJob(b.dataset.cancel);return}
 b=e.target.closest('[data-detail-close]');if(b){close('detailModal');return}
 b=e.target.closest('[data-close]');if(b){close(b.dataset.close);return}
});
$$('.modalback').forEach(x=>x.addEventListener('click',e=>{if(e.target===x)close(x.id)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modalback.open').forEach(m=>close(m.id))});
$('#resetDemo').addEventListener('click',()=>{if(!confirm('Réinitialiser toutes les missions et partenaires fictifs de cette plateforme ?'))return;state=fresh();selectedProvider='p1';save();render();say('Données de démonstration réinitialisées.')});
window.addEventListener('storage',e=>{if(e.key===KEY){state=load();render()}});
function activateHash(){const v=location.hash.slice(1).toLowerCase();if(v==='new-roadside'){go('client',false);openCreate('roadside','client');return}if(v==='new-transport'){go('client',false);openCreate('transport','client');return}if(v==='new-business'){go('garage',false);openCreate('business','garage');return}go(['home','client','garage','partner','control'].includes(v)?v:'home',false)}
window.addEventListener('hashchange',activateHash);
$('#jobDate').min=tomorrow(0);$('#jobDate').value=tomorrow(0);
setCategory('roadside');render();activateHash();
})();