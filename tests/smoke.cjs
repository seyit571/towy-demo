'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('app.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Each HTML id must be unique');
for(const ref of [...source.matchAll(/\$\('#([^']+)'\)/g)].map(m=>m[1]))assert(ids.includes(ref),'Missing HTML id '+ref);
for(const route of ['home','client','garage','partner','control'])assert(html.includes('id="'+route+'"'), 'Missing role view '+route);
assert(html.includes('./app.js')&&html.includes('./app.css'));
assert(css.includes('#f37021')&&css.includes('Outfit'));
new Function(source);
console.log('PASS static structure / selectors / JavaScript syntax');
class FakeEl {
 constructor(id=''){this.id=id;this.dataset={};this.value='';this.checked=false;this.handlers={};this.style={};this.inner='';
 this.classList={add(){},remove(){},toggle(){},contains(){return false}};}
 set innerHTML(value){this.inner=String(value);if(this.id==='jobService'){const m=this.inner.match(/<option value="([^"]+)"/);if(m)this.value=m[1]}}
 get innerHTML(){return this.inner}
 addEventListener(type,fn){this.handlers[type]=fn}
 querySelectorAll(){return []}
 reportValidity(){return true}
 reset(){this.value='';return true}
 scrollIntoView(){}
}
const nodes=Object.fromEntries(ids.map(id=>[id,new FakeEl(id)]));
const mk=attrs=>Object.assign(new FakeEl(),{dataset:attrs});
const views=['home','client','garage','partner','control'].map(id=>nodes[id]);
const nav=views.map(v=>mk({view:v.id}));
const newBtns=[mk({new:'roadside'}),mk({new:'business'}),mk({new:'transport'}),mk({new:'transport',owner:'garage'})];
const filters=['clientFilters','garageFilters','controlFilters'].map(id=>nodes[id]);
const modals=['createModal','detailModal','offerModal'].map(id=>nodes[id]);
const handlers={},winHandlers={};
const document={
 querySelector(s){if(s.startsWith('#')){if(!(s.slice(1) in nodes))throw Error('Unknown selector '+s);return nodes[s.slice(1)]}throw Error('Unexpected selector '+s)},
 querySelectorAll(s){return {'.view':views,'.mainnav button':nav,'[data-view]':nav,'[data-new]':newBtns,'[id$="Filters"]':filters,'.modalback':modals,'.modalback.open':[]}[s]||[]},
 addEventListener(type,fn){handlers[type]=fn}
};
const window={scrollTo(){},addEventListener(type,fn){winHandlers[type]=fn}};
const location={hash:'#home'};
const history={replaceState(a,b,h){location.hash=h}};
const localStorage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v}};
const confirm=()=>true;
new Function('document','window','location','history','localStorage','confirm',source)(document,window,location,history,localStorage,confirm);
const fire=(node,type)=>{assert(node.handlers[type],'Missing handler '+node.id+':'+type);node.handlers[type]({preventDefault(){},currentTarget:node,target:node})};
const state=()=>JSON.parse(localStorage.getItem('towy-unified-v1'));
function action(attr,value,additional={}){
 const target={closest(sel){return sel.includes('['+attr+']')?{dataset:{[attr.slice(5)]:value,...additional}}:null}};
 handlers.click({target});
}
function submit(kind,from,to,company=''){
 fire(newBtns.find(b=>b.dataset.new===kind),'click');
 nodes.jobFrom.value=from;nodes.jobTo.value=to;nodes.jobCompany.value=company;nodes.jobKm.value='12';
 nodes.jobDate.value='2099-10-12';nodes.jobModel.value='Renault Clio';
 nodes.jobNotes.value='Mission test';nodes.jobCondition.value='rolling';nodes.jobVehicle.value='car';
 fire(nodes.createForm,'submit');return state().jobs[0];
}
const road=submit('roadside','Thionville','Yutz');
assert.equal(road.status,'pending');
assert.equal(road.owner,'client');
fire(nav[3],'click');action('data-take',road.id);
assert.equal(state().jobs.find(j=>j.id===road.id).status,'assigned');
action('data-progress',road.id,{next:'pickedup'});
assert.equal(state().jobs.find(j=>j.id===road.id).status,'pickedup');
action('data-progress',road.id,{next:'done'});
assert.equal(state().jobs.find(j=>j.id===road.id).status,'done');
console.log('PASS roadside customer > provider acceptance > pickup > completion');
const cargo=submit('transport','Metz','Lyon');
assert.equal(cargo.owner,'client');assert.equal(cargo.estimate,null);
fire(nav[3],'click');nodes.partnerSelect.value='p2';fire(nodes.partnerSelect,'change');
action('data-bid',cargo.id);nodes.offerAmount.value='420';nodes.offerDays.value='3';nodes.offerMessage.value='Plateau disponible';fire(nodes.offerForm,'submit');
assert.equal(state().jobs.find(j=>j.id===cargo.id).offers.length,1);
fire(nav[1],'click');
const offer=state().jobs.find(j=>j.id===cargo.id).offers[0];
action('data-choose',cargo.id,{offer:offer.id});
assert.equal(state().jobs.find(j=>j.id===cargo.id).providerId,'p2');
fire(nav[3],'click');action('data-progress',cargo.id,{next:'pickedup'});action('data-progress',cargo.id,{next:'done'});
assert.equal(state().jobs.find(j=>j.id===cargo.id).status,'done');
console.log('PASS transport customer > carrier quote > customer selection > delivery');
const business=submit('business','Thionville','Metz','Garage Pilote Démo');
assert.equal(business.owner,'garage');
fire(nav[4],'click');action('data-match',business.id);
assert.equal(state().jobs.find(j=>j.id===business.id).status,'assigned');
assert(state().jobs.find(j=>j.id===business.id).providerId);
console.log('PASS garage > shared dispatch > simulated auto-assignment');
console.log('ALL TESTS PASSED');
