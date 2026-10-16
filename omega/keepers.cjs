#!/usr/bin/env node
'use strict';
/*
 OMEGA Curve PegKeeper V2 reward scout.
 Pure eth_call / view functions. No keys, signatures or transactions.
 Profit only considered preliminary until update(address) static simulation and gas
 estimation both pass. LP value uses pool virtual price, not an executable quote.
*/
const fs=require('fs'),path=require('path');
const {ethers}=require('ethers');
const RPC=process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const p=new ethers.JsonRpcProvider(RPC,1,{staticNetwork:true});
const beneficiary='0x000000000000000000000000000000000000dEaD';
const keepers=[
 {name:'crvUSD/USDC',addr:'0x9201da0D97CaAAff53f01B2fB56767C7072dE340'},
 {name:'crvUSD/USDT',addr:'0xFb726F57d251aB5C731E5C64eD4F5F94351eF9F3'},
 {name:'crvUSD/PYUSD',addr:'0x3fA20eAa107DE08B38a8734063D605d5842fe09C'},
 {name:'crvUSD/frxUSD',addr:'0x338Cb2D827112d989A861cDe87CD9FfD913A1f9D'},
];
const ki=new ethers.Interface([
 'function estimate_caller_profit() view returns(uint256)',
 'function pool() view returns(address)',
 'function caller_share() view returns(uint256)',
 'function update(address beneficiary) returns(uint256)',
]);
const pi=new ethers.Interface(['function get_virtual_price() view returns(uint256)']);
const ETH_SPOT='https://api.coinbase.com/v2/prices/ETH-USD/spot';
let ethUSD=null;
async function getSpot(){
 try{const r=await fetch(ETH_SPOT,{signal:AbortSignal.timeout(6500)});
 const j=await r.json(); const v=Number(j?.data?.amount);
 return Number.isFinite(v)&&v>0?v:null;
 }catch{return null}
}
async function callContract(to,iface,method,args,block){
 const data=iface.encodeFunctionData(method,args||[]);
 const raw=await p.call({to,data},block);
 return iface.decodeFunctionResult(method,raw)[0];
}
async function run(){
 const block=await p.getBlockNumber();ethUSD=await getSpot();
 const fee=await p.getFeeData(),wei=fee.maxFeePerGas||fee.gasPrice;
 const rows=[];
 for(const {name,addr}of keepers){
  const row={name,address:addr,block,rewardLP:null,rewardUSDApprox:null,gasUSDApprox:null,
   netUSDApprox:null,callSimulation:'NOT_RUN',gasEstimated:false,profitConfirmed:false};
  try{
   const reward=await callContract(addr,ki,'estimate_caller_profit',[],block);
   const pool=await callContract(addr,ki,'pool',[],block);
   const vp=await callContract(pool,pi,'get_virtual_price',[],block);
   const share=await callContract(addr,ki,'caller_share',[],block);
   row.pool=pool;row.callerShareBasisPoints=Number(share)/10;
   row.lpVirtualPrice=ethers.formatEther(vp);
   row.rewardLP=ethers.formatEther(reward);
   row.rewardUSDApprox=Number(row.rewardLP)*Number(row.lpVirtualPrice);
   if(reward===0n){row.callSimulation='SKIPPED_ZERO_REWARD';}
   else{
    const data=ki.encodeFunctionData('update',[beneficiary]);
    const call=await p.call({to:addr,from:beneficiary,data},block);
    const expectedReturn=ki.decodeFunctionResult('update',call)[0];
    row.callSimulation='ETH_CALL_OK';
    row.simulatedReturnLP=ethers.formatEther(expectedReturn);
    const gas=await p.estimateGas({to:addr,from:beneficiary,data});
    row.gasEstimated=true;row.gasUnits=Number(gas);
    row.gasUSDApprox=ethUSD&&wei?Number(gas)*Number(wei)/1e18*ethUSD:null;
    row.netUSDApprox=row.gasUSDApprox===null?null:row.rewardUSDApprox-row.gasUSDApprox;
    // Still no proof of inclusion or competition-adjusted execution.
   }
  }catch(err){row.error=String(err.shortMessage||err.message).slice(0,170);row.callSimulation='ERROR';}
  rows.push(row);
 }
 const result={timestamp:new Date().toISOString(),block,chain:'Ethereum',source:'Curve V2 caller rewards',
  method:'estimate_caller_profit plus optionally eth_call update(address)',
  ethUSD,gasPriceWei:wei?wei.toString():null,marketsChecked:rows.length,
  marketWithReward:rows.filter(x=>x.rewardUSDApprox>0).length,
  marketsPositiveAfterEstimatedGas:rows.filter(x=>x.netUSDApprox>0).length,
  atomicSimulationsPassed:rows.filter(x=>x.callSimulation==='ETH_CALL_OK'&&x.gasEstimated).length,
  realizedUsd:0,confirmedTotalUsd:0,
  disclaimer:'Reward estimates are virtual-price valued LP tokens, not wallet realized USDC. eth_call does not secure a transaction or beat competitors.',
  keepers:rows
 };
 const dir=path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'keepers.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({block,marketWithReward:result.marketWithReward,positive:result.marketsPositiveAfterEstimatedGas,rows:rows.map(x=>({name:x.name,rewardUSD:x.rewardUSDApprox,simulation:x.callSimulation}))}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
