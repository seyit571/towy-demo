(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const KEY="towy-transport-v2";
const types={car:"Voiture",suv:"SUV / 4x4",van:"Utilitaire léger",moto:"Moto / scooter",classic:"Collection / prestige"};
const partners=[{id:"c1",name:"Transport Est Démo",city:"Metz",gear:"Plateau porte-voitures"},{id:"c2",name:"Auto Logistique Démo",city:"Nancy",gear:"Camion remorque"},{id:"c3",name:"Plateau Express Démo",city:"Thionville",gear:"Moto & véhicules légers"}];
const safe=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euros=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const dateAfter=n=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const humanDate=s=>s?s.split("-").reverse().join("/"):"À convenir";
const demo=()=>({trips:[
{id:"TR-1001",from:"Metz",to:"Lyon",date:dateAfter(6),flex:"flex",type:"car",model:"Peugeot 308",condition:"rolling",info:"Enlèvement chez un garage.",mine:false,status:"open",chosen:null,seed:true,created:Date.now()-130000},
{id:"TR-1002",from:"Thionville",to:"Paris",date:dateAfter(11),flex:"week",type:"suv",model:"Volkswagen Tiguan",condition:"rolling",info:"Livraison chez particulier.",mine:false,status:"open",chosen:null,seed:true,created:Date.now()-120000},
{id:"TR-1003",from:"Strasbourg",to:"Bordeaux",date:dateAfter(16),flex:"fixed",type:"moto",model:"Yamaha MT-07",condition:"nonrolling",info:"Prévoir une rampe.",mine:false,status:"open",chosen:null,seed:true,created:Date.now()-110000},
{id:"TR-1004",from:"Luxembourg",to:"Marseille",date:dateAfter(23),flex:"flex",type:"classic",model:"Mercedes-Benz SL",condition:"rolling",info:"Véhicule de collection.",mine:false,status:"open",chosen:null,seed:true,created:Date.now()-100000}],quotes:[
{id:"DQ-5001",tripId:"TR-1001",carrier:"c1",price:390,days:3,message:"Disponible avec un plateau.",status:"proposed"},
{id:"DQ-5002",tripId:"TR-1001",carrier:"c2",price:430,days:2,message:"Départ possible sous 48 h.",status:"proposed"}],nextTrip:1005,nextQuote:5003});
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&Array.isArray(s.trips)&&Array.isArray(s.quotes)&&Number.isFinite(s.nextTrip))return s}catch(e){}return demo()}
let state=load(),carrier="c1",condition="rolling",filter="all",activeTrip=null,toastTimer=null;
const trip=id=>state.trips.find(t=>t.id===id),offers=id=>state.quotes.filter(q=>q.tripId===id),quote=id=>state.quotes.find(q=>q.id===id),pro=id=>partners.find(p=>p.id===id);
const statuses={open:"En attente d'offres",assigned:"Attribuée",pickedup:"En transport",delivered:"Livrée",cancelled:"Annulée"};
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
function notify(s){$("#toast").textContent=s;$("#toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),3000)}
function close(){$("#detailModal").classList.remove("open");activeTrip=null}
function go(view){if(!["home","market","client","carrier","ops"].includes(view))return;$$(".page").forEach(x=>x.classList.toggle("active",x.id===view));close();render();window.scrollTo({top:0,behavior:"instant"});const hash={home:"accueil",market:"annonces",client:"mes-demandes",carrier:"transporteurs",ops:"gestion"}[view];if(location.hash!=="#"+hash)history.replaceState(null,"","#"+hash)}
function scrollToForm(){go("home");requestAnimationFrame(()=>$("#publier").scrollIntoView({behavior:"smooth"}))}
$$("[data-go]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();go(b.dataset.go)}));
$$("[data-publish]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();scrollToForm()}));
$$("[data-condition]").forEach(b=>b.addEventListener("click",()=>{condition=b.dataset.condition;$$("[data-condition]").forEach(a=>{a.classList.toggle("active",a===b);a.setAttribute("aria-pressed",String(a===b))})}));
$("#pickupDate").min=dateAfter(0);$("#pickupDate").value=dateAfter(5);
$("#publishForm").addEventListener("submit",e=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;const from=$("#origin").value.trim(),to=$("#destination").value.trim(),model=$("#model").value.trim(),pickup=$("#pickupDate").value;
if(from.length<2||to.length<2||model.length<2){notify("Vérifiez le départ, l'arrivée et le modèle.");return}
if(from.toLocaleLowerCase("fr")===to.toLocaleLowerCase("fr")){notify("Les villes de départ et d'arrivée doivent différer.");return}
if(pickup<dateAfter(0)){notify("La date doit être actuelle ou future.");return}
const t={id:"TR-"+state.nextTrip++,from,to,date:pickup,flex:$("#flex").value,type:$("#kind").value,model,condition,info:$("#details").value.trim().slice(0,400),mine:true,status:"open",chosen:null,seed:false,created:Date.now()};
state.trips.unshift(t);save();$("#publishForm").reset();$("#pickupDate").value=dateAfter(5);condition="rolling";$$("[data-condition]").forEach(x=>x.classList.toggle("active",x.dataset.condition==="rolling"));notify("Annonce "+t.id+" publiée dans la démo");go("client");openDetail(t.id)});
function card(t){const list=offers(t.id);return '<article class="card"><div><span class="chip">'+(t.seed?"ANNONCE FICTIVE":t.mine?"VOTRE ANNONCE TEST":"ANNONCE DÉMO")+'</span><h3>'+safe(t.model)+'</h3><div class="route">'+safe(t.from)+' <span>→</span> '+safe(t.to)+'</div><div class="desc">'+safe(types[t.type])+' · '+(t.condition==="rolling"?"Roulant":"Non roulant")+' · '+humanDate(t.date)+' · '+list.length+' devis<br><span class="status '+safe(t.status)+'">'+statuses[t.status]+'</span></div></div><div class="aside"><b>'+safe(t.id)+'</b><button class="btn sm" data-detail="'+safe(t.id)+'">Voir les détails ↗</button></div></article>'}
const empty=msg=>'<div class="empty">'+msg+'</div>';
function renderMarket(){const from=$("#searchFrom").value.trim().toLocaleLowerCase("fr"),to=$("#searchTo").value.trim().toLocaleLowerCase("fr"),type=$("#searchType").value,sort=$("#sort").value;
const items=state.trips.filter(t=>t.status==="open"&&t.from.toLocaleLowerCase("fr").includes(from)&&t.to.toLocaleLowerCase("fr").includes(to)&&(type==="all"||type===t.type));
items.sort((a,b)=>sort==="date"?a.date.localeCompare(b.date):sort==="offers"?offers(a.id).length-offers(b.id).length:b.created-a.created);
$("#marketCount").textContent=items.length+" mission(s) de démonstration";$("#marketCards").innerHTML=items.length?items.map(card).join(""):empty("Aucune mission correspondante. Essayez une autre ville ou un autre véhicule.")}
["searchFrom","searchTo","searchType","sort"].forEach(id=>$("#"+id).addEventListener("input",renderMarket));
$("#clearSearch").addEventListener("click",()=>{$("#searchFrom").value="";$("#searchTo").value="";$("#searchType").value="all";$("#sort").value="recent";renderMarket()});
function renderMine(){const trips=state.trips.filter(t=>t.mine),stats=[["Mes annonces",trips.length],["Devis reçus",trips.reduce((a,t)=>a+offers(t.id).length,0)],["En cours",trips.filter(t=>["assigned","pickedup"].includes(t.status)).length],["Livrés",trips.filter(t=>t.status==="delivered").length]];
$("#mineStats").innerHTML=stats.map(x=>'<div class="stat"><label>'+x[0]+'</label><strong>'+x[1]+'</strong><small>Simulation locale</small></div>').join("");
$("#mineCards").innerHTML=trips.length?trips.map(card).join(""):empty("Vous n'avez aucune annonce. Publiez un transport test pour commencer.")}
function renderCarrier(){const c=pro(carrier);$("#carrierPick").innerHTML=partners.map(p=>'<option value="'+p.id+'">'+safe(p.name)+'</option>').join("");$("#carrierPick").value=carrier;$("#carrierName").textContent=c.name;$("#carrierMeta").textContent=c.city+" · "+c.gear+" · Profil fictif";
const q=state.quotes.filter(x=>x.carrier===carrier).slice().reverse(),jobs=state.trips.filter(t=>quote(t.chosen)?.carrier===carrier);
$("#proQuotes").innerHTML=q.length?q.map(x=>{const t=trip(x.tripId);return '<article class="card"><div><span class="chip">'+(x.status==="chosen"?"DEVIS RETENU":x.status==="rejected"?"NON RETENU":"DEVIS PROPOSÉ")+'</span><h3>'+safe(t?.model||"Véhicule")+'</h3><div class="route">'+safe(t?.from||"")+' → '+safe(t?.to||"")+'</div><div class="desc">'+safe(x.id)+' · '+x.days+' jour(s) · '+safe(x.message)+'</div></div><div class="aside"><b>'+euros(x.price)+'</b><button class="btn sm" data-detail="'+x.tripId+'">Ouvrir ↗</button></div></article>'}).join(""):empty("Aucun devis proposé. Ouvrez les annonces pour répondre à une mission.");
$("#proAssigned").innerHTML=jobs.length?jobs.map(card).join(""):empty("Aucune mission attribuée à ce profil transporteur.")}
$("#carrierPick").addEventListener("change",e=>{carrier=e.target.value;render()});
function renderOps(){let road=0;try{const s=JSON.parse(localStorage.getItem("towy-hermes-v4"));road=Array.isArray(s?.jobs)?s.jobs.length:0}catch(e){}const s=[["Annonces transport",state.trips.length],["Devis",state.quotes.length],["Transports attribués",state.trips.filter(t=>["assigned","pickedup","delivered"].includes(t.status)).length],["Dépannages test",road]];
$("#opsStats").innerHTML=s.map(x=>'<div class="stat"><label>'+x[0]+'</label><strong>'+x[1]+'</strong><small>Ce navigateur uniquement</small></div>').join("");$("#opsCards").innerHTML=state.trips.length?state.trips.slice().reverse().map(card).join(""):empty("Aucune activité transport")}
function render(){renderMarket();renderMine();renderCarrier();renderOps()}
function offerCard(q,t){const p=pro(q.carrier),canChoose=t.mine&&t.status==="open"&&q.status==="proposed";return '<div class="quote"><div><b>'+safe(p?.name||"Transporteur fictif")+'</b><p>Délai : '+q.days+' jour(s) · '+safe(q.message||"Aucune précision")+'</p></div><div><div class="sum">'+euros(q.price)+'</div><div class="actions">'+(canChoose?'<button class="btn primary sm" data-choose="'+q.id+'">Choisir ce devis</button>':q.status==="chosen"?'<span class="status delivered">Retenu</span>':q.status==="rejected"?'<span class="status cancelled">Non retenu</span>':"")+'</div></div></div>'}
function openDetail(id){const t=trip(id);if(!t)return;activeTrip=id;$("#detailTitle").textContent=t.model;$("#detailSubtitle").textContent=t.from+" → "+t.to+" · "+t.id;
$("#detailInfo").innerHTML='<strong>'+safe(t.from)+' → '+safe(t.to)+'</strong><br>'+safe(types[t.type])+' · '+(t.condition==="rolling"?"Roulant":"Non roulant")+' · Enlèvement '+humanDate(t.date)+'<br>Flexibilité : '+(t.flex==="fixed"?"Date fixe":t.flex==="week"?"± 7 jours":"± 3 jours")+'<br>Précisions : '+safe(t.info||"Aucune")+'<br><span class="status '+safe(t.status)+'">'+statuses[t.status]+'</span>';
const q=offers(id).slice().sort((a,b)=>a.price-b.price);
$("#detailOffers").innerHTML='<h3>'+q.length+' devis reçu(s)</h3>'+(q.length?q.map(x=>offerCard(x,t)).join(""):empty("Aucune proposition pour le moment."));
const own=q.some(x=>x.carrier===carrier),picked=quote(t.chosen);let actions="";
if(t.status==="open"&&!own)actions+='<form id="quoteForm" class="quoteform"><h3>Proposer un devis comme '+safe(pro(carrier).name)+'</h3><div class="formgrid"><label class="field">Prix proposé (€) *<input type="number" name="amount" min="20" max="20000" step="1" required placeholder="Ex. 420"></label><label class="field">Délai (jours) *<input type="number" name="days" min="1" max="45" required value="3"></label><label class="field all">Message de prise en charge<textarea name="message" maxlength="240" placeholder="Équipement, disponibilité, précisions…"></textarea></label></div><button class="btn primary wide" type="submit">Envoyer mon devis test ↗</button></form>';
if(t.status==="open"&&own)actions+='<p class="note">Ce profil a déjà fait une offre. Changez de transporteur dans TOWY Pro pour proposer un autre devis.</p>';
if(t.mine&&t.status==="open")actions+='<div class="rowbuttons"><button class="btn light sm" data-cancel="'+t.id+'">Annuler cette annonce</button></div>';
if(picked&&picked.carrier===carrier&&t.status==="assigned")actions+='<div class="rowbuttons"><button class="btn primary" data-next="pickedup" data-trip="'+t.id+'">Simuler enlèvement ↗</button></div>';
if(picked&&picked.carrier===carrier&&t.status==="pickedup")actions+='<div class="rowbuttons"><button class="btn primary" data-next="delivered" data-trip="'+t.id+'">Simuler livraison ↗</button></div>';
$("#detailActions").innerHTML=actions;$("#detailModal").classList.add("open")}
document.addEventListener("click",e=>{const b=e.target.closest("[data-detail]");if(b)openDetail(b.dataset.detail)});
$("#closeDetail").addEventListener("click",close);$("#detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
$("#detailModal").addEventListener("submit",e=>{if(e.target.id!=="quoteForm")return;e.preventDefault();const t=trip(activeTrip);if(!t||t.status!=="open"||offers(t.id).some(x=>x.carrier===carrier))return;
const f=e.target,amount=Number(f.elements.amount.value),days=Number(f.elements.days.value),message=f.elements.message.value.trim().slice(0,240);
if(!Number.isInteger(amount)||amount<20||amount>20000||!Number.isInteger(days)||days<1||days>45){notify("Prix ou délai incorrect.");return}
state.quotes.push({id:"DQ-"+state.nextQuote++,tripId:t.id,carrier,price:amount,days,message,status:"proposed"});save();render();openDetail(t.id);notify("Devis de "+euros(amount)+" ajouté (démo)")});
$("#detailModal").addEventListener("click",e=>{const b=e.target.closest("[data-choose]");if(b){const q=quote(b.dataset.choose),t=q&&trip(q.tripId);if(!t||!t.mine||t.status!=="open"||q.status!=="proposed")return;
if(!confirm("Accepter le devis de "+pro(q.carrier).name+" à "+euros(q.price)+" ? (simulation, sans paiement)"))return;t.status="assigned";t.chosen=q.id;offers(t.id).forEach(o=>o.status=o.id===q.id?"chosen":"rejected");save();render();openDetail(t.id);notify("Devis retenu dans la démonstration.");return}
const c=e.target.closest("[data-cancel]");if(c){const t=trip(c.dataset.cancel);if(t&&t.mine&&t.status==="open"&&confirm("Annuler cette annonce de test ?")){t.status="cancelled";save();render();openDetail(t.id);notify("Annonce annulée.");}return}
const n=e.target.closest("[data-next]");if(n){const t=trip(n.dataset.trip),q=t&&quote(t.chosen);if(!q||q.carrier!==carrier)return;const next=n.dataset.next;if((t.status==="assigned"&&next==="pickedup")||(t.status==="pickedup"&&next==="delivered")){t.status=next;save();render();openDetail(t.id);notify(next==="pickedup"?"Enlèvement simulé.":"Livraison simulée.")}}});
$("#resetDemo").addEventListener("click",()=>{if(confirm("Effacer les transports et devis de test, et restaurer les exemples ?")){state=demo();carrier="c1";save();render();notify("Données de démonstration réinitialisées.")}});
window.addEventListener("storage",e=>{if(e.key===KEY){state=load();render()}});
render();const hash=location.hash.toLowerCase();if(hash==="#annonces")go("market");if(hash==="#mes-demandes")go("client");if(hash==="#transporteurs")go("carrier");if(hash==="#gestion")go("ops");
})();