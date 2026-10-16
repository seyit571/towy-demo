#!/usr/bin/env node
'use strict';
/* OMEGA read-only Sky Clipper redo reward monitor. No signing or sending. */
const {ethers}=require('ethers'),fs=require('fs'),path=require('path');
const rpc=new ethers.JsonRpcProvider(process.env.ETH_RPC_URL||'https://ethereum-rpc.publicnode.com',1,{staticNetwork:true});
const chainlog='0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F';
const beneficiary='0x000000000000000000000000000000000000dEaD';
const c=new ethers.Interface(['function list() view returns(bytes32[])','function getAddress(bytes32) view returns(address)']);
const clip=new ethers.Interface([
 'function list() view returns(uint256[])',
 'function getStatus(uint256) view returns(bool,uint256,uint256,uint256)',
 'function tip() view returns(uint192)',
 'function chip() view returns(uint64)',
 'function stopped() view returns(uint256)',
 'function redo(uint256,address)',
]);
async function call(to,iface,method,args,block){
 const data=iface.encodeFunctionData(method,args||[]);
 return iface.decodeFunctionResult(method,await rpc.call({to,data},block))[0];
}
async function run(){
 const block=await rpc.getBlock('latest');
 const keydata=await rpc.call({to:chainlog,data:c.encodeFunctionData('list',[])},block.number);
 const keys=c.decodeFunctionResult('list',keydata)[0].map(x=>({raw:x,name:Buffer.from(x.slice(2),'hex').toString('utf8').replace(/\0.*$/s,'')}));
 const targets=keys.filter(x=>/^MCD_CLIP_|^LOCKSTAKE_CLIP_/.test(x.name)&&!x.name.includes('CALC'));
 const entries=[],errors=[],eligible=[];
 for(const key of targets){
  try{
   const address=await call(chainlog,c,'getAddress',[key.raw],block.number);
   const [ids,tip,chip,stopped]=await Promise.all([
    call(address,clip,'list',[],block.number),
    call(address,clip,'tip',[],block.number),
    call(address,clip,'chip',[],block.number),
    call(address,clip,'stopped',[],block.number)
   ]);
   const entry={name:key.name,address,openAuctions:ids.length,
    flatTipDAI:Number(ethers.formatUnits(tip,45)),
    chipPercent:Number(chip)/1e16,
    stopped:Number(stopped),redoEligible:0};
   for(const id of ids.slice(0,30)){
    try{
     const a=clip.decodeFunctionResult('getStatus',await rpc.call({to:address,data:clip.encodeFunctionData('getStatus',[id])},block.number));
     if(!a[0]||stopped!==0n)continue;
     const tab=Number(ethers.formatUnits(a[3],45));
     const candidateDAI=entry.flatTipDAI+tab*Number(chip)/1e18;
     const record={name:key.name,address,auctionId:String(id),tabDAI:tab,rewardDAITheoretical:candidateDAI,simulation:'UNTESTED'};
     try{
      const data=clip.encodeFunctionData('redo',[id,beneficiary]);
      await rpc.call({to:address,from:beneficiary,data},block.number);
      record.simulation='ETH_CALL_OK';
      record.gasEstimate=Number(await rpc.estimateGas({to:address,from:beneficiary,data}));
     }catch(e){record.simulation='REVERT:'+String(e.shortMessage||e.message).slice(0,70)}
     eligible.push(record);entry.redoEligible++;
    }catch(e){errors.push(key.name+' id '+String(id)+': '+String(e.shortMessage||e.message).slice(0,100))}
   }
   entries.push(entry);
  }catch(e){errors.push(key.name+': '+String(e.shortMessage||e.message).slice(0,100))}
 }
 const info={timestamp:new Date().toISOString(),block:block.number,chain:'Ethereum',source:'Sky Chainlog and Clipper',
  scope:'Only existing auction redo opportunities on listed Clipper contracts. Newly liquidatable Vaults (Dog.bark) are NOT screened.',
  monitoredClippers:entries.length,listedClipperKeys:targets.length,openAuctions:entries.reduce((a,x)=>a+x.openAuctions,0),
  redoCandidates:eligible.length,redoCallsSuccessful:eligible.filter(x=>x.simulation==='ETH_CALL_OK').length,
  realizedDAI:0,confirmedNetDAI:0,
  counts:{rewardConfigured:entries.filter(x=>x.flatTipDAI>0).length,stopped:entries.filter(x=>x.stopped!==0).length},
  clippers:entries,eligible,errors};
 const dir=path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'sky.json'),JSON.stringify(info,null,2)+'\n');
 console.log(JSON.stringify({block:info.block,scanned:info.monitoredClippers,open:info.openAuctions,redo:info.redoCandidates,rewardConfigured:info.counts.rewardConfigured,errors:errors.length}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
