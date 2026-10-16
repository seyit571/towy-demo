#!/usr/bin/env node
'use strict';
// OMEGA Beefy Base exact-call shadow monitor. No private keys, signatures, or broadcasts.
const {ethers}=require('ethers');
const fs=require('fs'),path=require('path');
const RPC='https://mainnet.base.org';
const WETH='0x4200000000000000000000000000000000000006';
const MULTICALL='0xca11bde05977b3631167028862be2a173976ca11';
const beneficiary='0x000000000000000000000000000000000000dEaD';
const calldata=new ethers.Interface(['function callReward() view returns(uint256)','function harvest(address)']);
const multi=new ethers.Interface(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns((bool success,bytes returnData)[])']);
const event=ethers.id('Transfer(address,address,uint256)');
const wait=n=>new Promise(r=>setTimeout(r,n));
async function req(method,params,limit=17000){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),limit);
 try{
  const res=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!res.ok)throw Error('HTTP '+res.status);
  const out=await res.json();
  if(out.error)throw Error(JSON.stringify(out.error).slice(0,180));
  return out.result;
 }finally{clearTimeout(timeout)}
}
async function main(){
 const vaults=await(await fetch('https://api.beefy.finance/vaults',{signal:AbortSignal.timeout(22000)})).json();
 const selected=vaults.filter(v=>v.network==='base'&&v.status==='active'&&ethers.isAddress(v.strategy));
 const gasPrice=BigInt(await req('eth_gasPrice',[])),rewards=[],errors=[];
 for(let i=0;i<selected.length;i+=20){
  const batch=selected.slice(i,i+20),calls=batch.map(v=>[v.strategy,true,calldata.encodeFunctionData('callReward',[])]);
  try{
   const encoded=multi.encodeFunctionData('aggregate3',[calls]);
   const raw=await req('eth_call',[{to:MULTICALL,data:encoded},'latest']);
   const decoded=multi.decodeFunctionResult('aggregate3',raw)[0];
   decoded.forEach((x,index)=>{
    if(!x.success)return;
    try{
     const value=calldata.decodeFunctionResult('callReward',x.returnData)[0];
     rewards.push({id:batch[index].id,address:batch[index].strategy,quotedETH:Number(ethers.formatEther(value))});
    }catch(e){}
   });
  }catch(e){errors.push('batch '+i+': '+e.message.slice(0,100))}
  await wait(100);
 }
 rewards.sort((a,b)=>b.quotedETH-a.quotedETH);
 const candidates=[];
 for(const v of rewards.filter(r=>r.quotedETH>0).slice(0,15)){
  let item={...v};
  try{
   const tx={from:beneficiary,to:v.address,gas:'0x989680',data:calldata.encodeFunctionData('harvest(address)',[beneficiary])};
   const result=await req('eth_simulateV1',[{blockStateCalls:[{calls:[tx]}],validation:false,traceTransfers:true}],20000);
   const simulated=result?.[0]?.calls?.[0];if(!simulated)throw Error('No receipt');
   let received=0n,sent=0n;
   for(const log of simulated.logs||[]){
    if(log.address?.toLowerCase()!==WETH.toLowerCase()||log.topics?.[0]!==event||log.topics.length<3)continue;
    const src=('0x'+log.topics[1].slice(-40)).toLowerCase(),dst=('0x'+log.topics[2].slice(-40)).toLowerCase(),amount=BigInt(log.data);
    if(dst===beneficiary.toLowerCase())received+=amount;
    if(src===beneficiary.toLowerCase())sent+=amount;
   }
   const fee=BigInt(simulated.gasUsed)*gasPrice;
   const net=received-sent-fee;
   item={...item,success:simulated.status==='0x1',creditETH:Number(ethers.formatEther(received-sent)),
     gasEstimateETH:Number(ethers.formatEther(fee)),netBeforeL1DataFeeETH:Number(ethers.formatEther(net)),
     blockNumber:Number(BigInt(result[0].number)),gasUsed:Number(BigInt(simulated.gasUsed)),
     positiveWithSafetyMargin:simulated.status==='0x1'&&net>ethers.parseEther('0.00005')};
  }catch(e){item={...item,success:false,error:String(e.message).slice(0,150)}}
  candidates.push(item);
  await wait(250);
 }
 const record={timestamp:new Date().toISOString(),source:'Beefy official vaults + Base public eth_simulateV1',network:'Base',
  chainId:8453,mode:'READ_ONLY',strategiesActive:selected.length,rewardsReadable:rewards.length,
  rewardsNonzero:rewards.filter(x=>x.quotedETH>0).length,simulated:candidates.length,
  successfulSimulations:candidates.filter(x=>x.success).length,
  positiveAfterSafetyMargin:candidates.filter(x=>x.positiveWithSafetyMargin).length,actualMainnetProfitETH:0,
  priceCaveat:'WETH denominated native ETH; does not include OP Stack L1 data fee or execution competition. Success cannot guarantee a mainnet inclusion.',
  gasPriceWei:gasPrice.toString(),candidates,errors};
 const dir=path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'beefy-base.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({active:record.strategiesActive,nonzero:record.rewardsNonzero,simulated:record.simulated,positive:record.positiveAfterSafetyMargin,errors:errors.length}));
}
main().catch(e=>{console.error('SCANNER_FAILED',e.message);process.exitCode=1});
