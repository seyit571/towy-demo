'use strict';
const {ethers}=require('ethers'),fs=require('fs');
const networks={
 bsc:{rpc:'https://bsc-dataseed.binance.org',native:'WBNB',decimals:18,chain:56},
 base:{rpc:'https://base-rpc.publicnode.com',native:'WETH',decimals:18,chain:8453},
 arbitrum:{rpc:'https://arbitrum-one-rpc.publicnode.com',native:'WETH',decimals:18,chain:42161},
 ethereum:{rpc:'https://ethereum-rpc.publicnode.com',native:'WETH',decimals:18,chain:1},
};
const iface=new ethers.Interface(['function callReward() view returns(uint256)','function harvest()','function harvest(address beneficiary)','function paused() view returns(bool)']);
const limiter=(fn,timeout=12000)=>Promise.race([fn(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),timeout))]);
async function getJSON(u){const r=await fetch(u,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function scan(chain,prices){
 const c=networks[chain];
 const provider=new ethers.JsonRpcProvider(c.rpc,c.chain,{staticNetwork:true});
 const [all,tvls,fee]=await Promise.all([
 getJSON('https://api.beefy.finance/vaults/'+chain),
 getJSON('https://api.beefy.finance/tvl'),
 provider.getFeeData().catch(()=>null)
 ]);
 const price=Number(prices[c.native]||prices[chain==='bsc'?'BNB':'ETH']||0);
 const tvl=(tvls[String(c.chain)]||{});
 const entries=all.filter(x=>x.status==='active'&&ethers.isAddress(x.strategy)).sort((a,b)=>(Number(tvl[b.id]||0)-Number(tvl[a.id]||0))).slice(0,chain==='bsc'?30:35);
 const results=[],completed=[];
 for(let i=0;i<entries.length;i+=6) {
  const chunk=entries.slice(i,i+6);
  const rows=await Promise.all(chunk.map(async vault=>{
   const result={chain,id:vault.id,vault:vault.earnContractAddress,strategy:vault.strategy,tvlUsd:Number(tvl[vault.id]||0),callRewardNative:null,rewardUsd:null,estimateGasUnits:null,gasCostUsd:null,netPreExecutionUsd:null,positiveNet:false,status:'UNSCANNED'};
   try{
    const hex=await limiter(()=>provider.call({to:vault.strategy,data:iface.encodeFunctionData('callReward',[])}),12000);
    const amount=iface.decodeFunctionResult('callReward',hex)[0];
    result.callRewardNative=ethers.formatUnits(amount,c.decimals);
    result.rewardUsd=Number(result.callRewardNative)*price;
    result.status=amount>0n?'CALL_REWARD_POSITIVE':'NO_REWARD';
    if(amount>0n&&result.rewardUsd>=0.01){
     const from='0x000000000000000000000000000000000000dEaD';
     // Need beneficiary-specific harvest(address) if exposed: ERC20 fee paid to beneficiary,
     // but do not mistake callReward (native estimate) for token transfer proof.
     for(const args of [['harvest',[from]],['harvest',[]]]){
      try{
       const data=iface.encodeFunctionData(args[1].length?'harvest(address)':'harvest()',args[1]);
       const units=await limiter(()=>provider.estimateGas({to:vault.strategy,from,data}),12000);
       const gasWei=fee?.maxFeePerGas||fee?.gasPrice||0n;
       const gasCost=Number(ethers.formatEther(gasWei*units))*price;
       result.estimateGasUnits=Number(units);
       result.gasCostUsd=gasCost;
       result.netPreExecutionUsd=result.rewardUsd-gasCost;
       result.positiveNet=result.netPreExecutionUsd>0;
       result.status='GAS_ESTIMATED_NO_FULL_SIM';
       result.callMethod=args[1].length?'harvest(address)':'harvest()';
       break;
      }catch(e){result.estimateError=String(e.shortMessage||e.message).slice(0,120)}
     }
    }
   }catch(e){result.status='CALL_FAILED';result.error=String(e.shortMessage||e.message).slice(0,100)}
   return result;
  }));
  results.push(...rows);
  console.log('PROGRESS',chain,results.length,'/',entries.length,'reward_positive',results.filter(x=>x.rewardUsd>0).length);
 }
 return {chain,chainId:c.chain,price,selected:entries.length,positiveReward:results.filter(x=>x.rewardUsd>0).length,gasEstimates:results.filter(x=>x.estimateGasUnits!=null).length,positiveAfterGas:results.filter(x=>x.positiveNet).length,results:results.sort((a,b)=>Number(b.netPreExecutionUsd??b.rewardUsd??-Infinity)-Number(a.netPreExecutionUsd??a.rewardUsd??-Infinity))};
}
(async()=>{
const prices=await getJSON('https://api.beefy.finance/prices');
const reports=[];
for(const network of Object.keys(networks)){
 try{reports.push(await scan(network,prices))}
 catch(e){reports.push({chain:network,error:String(e.message||e)})}
}
const snapshot={timestamp:new Date().toISOString(),mode:'READ_ONLY',source:'Beefy onchain callReward + eth_estimateGas',reports,
 candidateProfitable:reports.flatMap(x=>x.results||[]).filter(x=>x.positiveNet),realizedUsd:0,
 caveat:'callReward is an estimate, not a payable balance proof; gas estimates can fail; no send or fork simulation; 0 token balance initially.'};
fs.writeFileSync('/tmp/omega-evm/beefy-report.json',JSON.stringify(snapshot,null,2));
console.log('RESULT',JSON.stringify(reports.map(x=>({chain:x.chain,selected:x.selected,reward:x.positiveReward,gas:x.gasEstimates,positive:x.positiveAfterGas,best:(x.results||[]).slice(0,6)})),null,2));
})().catch(e=>{console.error('ERROR',e.stack);process.exit(1)});
