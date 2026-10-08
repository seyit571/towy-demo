(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const STORE="towy-business-garage-v1";
const labels={recovery:"Récupération chez un client",tow:"Remorquage vers garage",transfer:"Transfert entre établissements",delivery:"Livraison de véhicule"};
const vehicles={car:"Voiture",suv:"SUV / 4x4",van:"Utilitaire léger",moto:"Moto / scooter"};
const statuses={pending:"À attribuer",assigned:"En cours",done:"Terminée",cancelled:"Annulée"};
const providerNames={p1:"Dépannage Moselle Démo",p2:"Transport Metz Démo",p3:"TOWY Nord Démo"};
const clean=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euro=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const displayDate=d=>d?d.split("-").reverse().join("/"):"—";
const blank=()=>({jobs:[],next:1001});
function load(){try{const j=JSON.parse(localStorage.getItem(STORE));if(j&&Array.isArray(j.jobs)&&Number.isInteger(j.next))return j}catch(e){}return blank()}
let state=load(),view="create",missionFilter="all",selectedProvider="p1",toastTimer=0,selectedJob=null;
function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch(e){}}
function toast(message){$("#toast").textContent=message;$("#toast").classList.add("on");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("on"),3200)}
function closeModal(){$("#modal").classList.remove("open");selectedJob=null}
function navigate(target){
 if(!["create","missions","dispatch"].includes(target))return;
 view=target;$$(".appview").forEach(el=>el.classList.toggle("active",el.id===({create:"createView",missions:"missionsView",dispatch:"dispatchView"}[target])));
 $$('[data-tab]').forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===target));
 closeModal();render();
 const hash={create:"demande",missions:"suivi",dispatch:"dispatch"}[target];
 if(location.hash!=="#"+hash)history.replaceState(null,"","#"+hash);
 if(target==="create")$("#missionForm").scrollIntoView({behavior:"smooth",block:"center"});
 else $("#appNav").scrollIntoView({behavior:"smooth",block:"start"});
}
$$('[data-tab]').forEach(btn=>btn.addEventListener("click",e=>{e.preventDefault();navigate(btn.dataset.tab)}));
function getEstimate(){
 const distance=Number($("#distance").value);
 const km=Number.isFinite(distance)?Math.min(300,Math.max(1,distance)):1;
 const service=$("#service").value, vehicle=$("#vehicle").value;
 const base={recovery:65,tow:69,transfer:59,delivery:57}[service]||65;
 const rate={car:2.7,suv:3.1,van:3.6,moto:2.3}[vehicle]||2.7;
 const extra=$("#condition").value==="nonrolling"?34:0;
 const multiplier={planned:1,today:1.2,urgent:1.45}[$("#priority").value]||1;
 return Math.round((base+km*rate+extra)*multiplier);
}
function recalc(){$("#estimate").textContent=euro(getEstimate())}
["service","vehicle","condition","priority","distance"].forEach(id=>$("#"+id).addEventListener("input",recalc));
$("#date").min=today();$("#date").value=today();
$("#missionForm").addEventListener("submit",e=>{
 e.preventDefault();
 if(!e.currentTarget.reportValidity())return;
 const garage=$("#garage").value.trim(),origin=$("#origin").value.trim(),destination=$("#destination").value.trim();
 const model=$("#model").value.trim(),service=$("#service").value,vehicle=$("#vehicle").value,condition=$("#condition").value,priority=$("#priority").value,day=$("#date").value,distance=Number($("#distance").value);
 if(garage.length<2||origin.length<2||destination.length<2||!Number.isInteger(distance)||distance<1||distance>300){toast("Complète les informations requises.");return}
 if(origin.toLocaleLowerCase("fr")===destination.toLocaleLowerCase("fr")){toast("Les villes de départ et d’arrivée doivent être différentes.");return}
 if(day<today()){toast("Choisis une date actuelle ou future.");return}
 const job={id:"TB-"+state.next++,garage,origin,destination,service,vehicle,model,condition,priority,day,distance,instructions:$("#instructions").value.trim().slice(0,350),estimate:getEstimate(),status:"pending",provider:null,created:Date.now()};
 state.jobs.unshift(job);save();render();
 $("#modalTitle").textContent="Mission "+job.id+" créée";
 $("#modalLead").textContent="Ta demande est enregistrée dans ce navigateur. Tu peux la suivre puis l'attribuer à un partenaire fictif.";
 $("#modalInfo").innerHTML="<strong>"+clean(job.garage)+"</strong><br>"+clean(job.origin)+" → "+clean(job.destination)+"<br>"+clean(labels[job.service])+" · "+clean(job.model||vehicles[job.vehicle])+"<br>Estimation fictive : <b>"+euro(job.estimate)+"</b>";
 $("#modalActions").innerHTML='<button class="btn orange" data-modal-tab="missions">Voir mes missions ↗</button><button class="btn outline" data-modal-tab="dispatch">Simuler l’attribution</button>';
 selectedJob=job.id;$("#modal").classList.add("open");
 $("#missionForm").reset();$("#date").value=today();$("#outside").checked=false;recalc();toast("Mission "+job.id+" créée en démonstration");
});
const byId=id=>state.jobs.find(x=>x.id===id);
function jobCard(job,scope){
 const action=scope==="dispatch"?
  job.status==="pending"?'<button class="tinybtn" data-assign="'+clean(job.id)+'">Attribuer ↗</button>':
  job.status==="assigned"?'<button class="tinybtn green" data-complete="'+clean(job.id)+'">Terminer ✓</button>':"":
 '<button class="tinybtn light" data-detail="'+clean(job.id)+'">Voir les détails</button>';
 const cancel=scope==="missions"&&job.status==="pending"?'<button class="tinybtn red" data-cancel="'+clean(job.id)+'">Annuler</button>':"";
 return '<article class="mission"><div><span class="status '+clean(job.status)+'">'+statuses[job.status]+'</span><h3>'+clean(labels[job.service])+' · '+clean(job.id)+'</h3><div class="meta"><b>'+clean(job.origin)+' → '+clean(job.destination)+'</b> · '+clean(job.model||vehicles[job.vehicle])+'<br>'+clean(job.garage)+' · '+job.distance+' km · '+displayDate(job.day)+(job.provider?'<br>Attribuée à : '+clean(providerNames[job.provider]):"")+'</div></div><div class="right"><strong>'+euro(job.estimate)+'</strong><div style="display:flex;gap:6px;flex-wrap:wrap">'+action+cancel+'</div></div></article>';
}
const empty=text=>'<div class="empty">'+text+'</div>';
function render(){
 const jobs=state.jobs,pending=jobs.filter(x=>x.status==="pending"),assigned=jobs.filter(x=>x.status==="assigned"),done=jobs.filter(x=>x.status==="done");
 const metrics=[["Missions créées",jobs.length,"Dans ce navigateur"],["À attribuer",pending.length,"Demandes de test"],["En cours",assigned.length,"Interventions simulées"],["Terminées",done.length,"Missions fictives"]];
 $("#metrics").innerHTML=metrics.map(v=>'<div class="metric"><label>'+v[0]+'</label><strong>'+v[1]+'</strong><small>'+v[2]+'</small></div>').join("");
 const subset=jobs.filter(j=>missionFilter==="all"||j.status===missionFilter);
 $("#missionList").innerHTML=subset.length?subset.map(j=>jobCard(j,"missions")).join(""):empty("Aucune mission dans cette catégorie. Crée une demande pour tester le parcours.");
 $("#pendingList").innerHTML=pending.length?pending.map(j=>jobCard(j,"dispatch")).join(""):empty("Aucune mission à attribuer actuellement.");
 $("#activeList").innerHTML=assigned.length?assigned.map(j=>jobCard(j,"dispatch")).join(""):empty("Aucune mission en cours.");
 $("#provider").value=selectedProvider;
}
$("#missionFilters").addEventListener("click",e=>{const b=e.target.closest("[data-status]");if(!b)return;missionFilter=b.dataset.status;$$("#missionFilters button").forEach(x=>x.classList.toggle("active",x===b));render()});
$("#provider").addEventListener("change",e=>{selectedProvider=e.target.value});
document.addEventListener("click",e=>{
 const btn=e.target.closest("[data-assign],[data-complete],[data-cancel],[data-detail]");
 if(!btn)return;
 if(btn.hasAttribute("data-assign")){const j=byId(btn.dataset.assign);if(!j||j.status!=="pending")return;j.status="assigned";j.provider=selectedProvider;save();render();toast(j.id+" attribuée à "+providerNames[selectedProvider]+" (démo)");return}
 if(btn.hasAttribute("data-complete")){const j=byId(btn.dataset.complete);if(!j||j.status!=="assigned")return;j.status="done";save();render();toast(j.id+" terminée (démo)");return}
 if(btn.hasAttribute("data-cancel")){const j=byId(btn.dataset.cancel);if(!j||j.status!=="pending")return;if(!confirm("Annuler la demande "+j.id+" ?"))return;j.status="cancelled";save();render();toast(j.id+" annulée");return}
 if(btn.hasAttribute("data-detail")){
 const j=byId(btn.dataset.detail);if(!j)return;
 selectedJob=j.id;
 $("#modalTitle").textContent="Dossier "+j.id;
 $("#modalLead").textContent="Récapitulatif de la mission de démonstration.";
 $("#modalInfo").innerHTML="<strong>"+clean(j.garage)+"</strong><br>"+clean(labels[j.service])+" · "+clean(j.model||vehicles[j.vehicle])+"<br>"+clean(j.origin)+" → "+clean(j.destination)+" · "+j.distance+" km<br>Date souhaitée : "+displayDate(j.day)+"<br>État : "+(j.condition==="rolling"?"Roulant":"Non roulant")+"<br>Instructions : "+clean(j.instructions||"Aucune")+"<br>Estimation fictive : <b>"+euro(j.estimate)+"</b><br>Statut : <b>"+statuses[j.status]+"</b>"+(j.provider?"<br>Partenaire fictif : "+clean(providerNames[j.provider]):"");
 $("#modalActions").innerHTML='<button class="btn orange" data-modal-tab="dispatch">Ouvrir le dispatch ↗</button><button class="btn outline" data-modal-close>Fermer</button>';
 $("#modal").classList.add("open");
 }
});
$("#modalActions").addEventListener("click",e=>{const b=e.target.closest("[data-modal-tab],[data-modal-close]");if(!b)return;if(b.dataset.modalTab)navigate(b.dataset.modalTab);else closeModal()});
$("#modalClose").addEventListener("click",closeModal);
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
$("#clearAll").addEventListener("click",()=>{if(!confirm("Supprimer toutes les missions de démonstration ?"))return;state=blank();save();render();toast("Démonstration réinitialisée.")});
window.addEventListener("storage",e=>{if(e.key===STORE){state=load();render()}});
recalc();render();
const hash=location.hash.toLowerCase();
if(hash==="#suivi")navigate("missions");else if(hash==="#dispatch")navigate("dispatch");else if(hash==="#demande")navigate("create");
})();