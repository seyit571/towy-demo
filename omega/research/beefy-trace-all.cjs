'use strict';
const fs=require('fs'),{ethers}=require('ethers');
const provider=new ethers.JsonRpcProvider('https://base-rpc.publicnode.com',8453,{staticNetwork:true});
const RPC='https://base.drpc.org',WETH='0x4200000000000000000000000000000000000006';
const beneficiary='0x000000000000000000000000000000000000dEaD';
const iface=new ethers.Interface(['function harvest(address beneficiary)']);
const EVENT='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
async function trace(strategy,block){
 const txn={to:strategy,from:beneficiary,data:iface.encodeFunctionData('harvest(address)',[beneficiary]),gas:'0x989680'};
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),30000);
 try{
 const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
 body:JSON.stringify({jsonrpc:'2.0',id:1,method:'debug_traceCall',params:[txn,ethers.toQuantity(block),{tracer:'callTracer',tracerConfig:{withLog:true}}]})});
 const data=await r.json();
 if(data.error)throw Error(data.error.message||JSON.stringify(data.error));
 return data.result;
 }finally{clearTimeout(timeout)}
}
function parse(trace){
 const beneficiaryLower=beneficiary.toLowerCase(),token=WETH.toLowerCase();
 let beneficiaryWei=0n,nativeWei=0n,transferEvents=0,callCount=0,errors=[];
 const transfers=[];
 function walk(node,depth){
 if(!node||depth>75)return;
 callCount++;if(node.error)errors.push(node.error);
 if(node.to?.toLowerCase()===beneficiaryLower && node.value){nativeWei+=BigInt(node.value)}
 for(const log of node.logs||[]){
  if(log.address?.toLowerCase()===token&&log.topics?.[0]?.toLowerCase()===EVENT&&String(log.topics?.[2]||'').toLowerCase().endsWith(beneficiaryLower.slice(2))){
   const amt=BigInt(log.data);beneficiaryWei+=amt;transferEvents++;transfers.push({from:'0x'+log.topics[1].slice(-40),to:beneficiary,amountWETH:ethers.formatEther(amt)});
  }
 }
 for(const child of node.calls||[])walk(child,depth+1);
 }walk(trace,0);
 return {callCount,errors:errors.slice(0,3),wethPaid:ethers.formatEther(beneficiaryWei),nativeEthPaid:ethers.formatEther(nativeWei),transferEvents,transfers,gasUsed:Number(BigInt(trace.gasUsed||trace.gas||0))};
}
async function main(){
 const j=JSON.parse(fs.readFileSync('/tmp/omega-evm/beefy-report.json','utf8')),base=j.reports.find(x=>x.chain==='base');
 const b=await provider.getBlockNumber(),price=base.price,fee=await provider.getFeeData(),gasPriceWei=fee.maxFeePerGas||fee.gasPrice||0n;
 const top=base.results.filter(x=>x.rewardUsd>1&&x.estimateGasUnits).slice(0,15);
 const results=[];
 for(const entry of top){
  try{
   const tx=await trace(entry.strategy,b);
   const calc=parse(tx),rewardUSD=(Number(calc.wethPaid)+Number(calc.nativeEthPaid))*price;
   const gasUSD=calc.gasUsed*Number(gasPriceWei)/1e18*price;
   const row={name:entry.id,strategy:entry.strategy,block:b,quotedRewardUSD:entry.rewardUsd,
   actualTraceRewardUSD:rewardUSD,actualTraceRewardWETH:calc.wethPaid,traceGasUsed:calc.gasUsed,gasUSDEst:gasUSD,
   netAfterGasUSD:rewardUSD-gasUSD,eligible:!calc.errors.length,transfers:calc.transfers,
   error:calc.errors[0]||null,callCount:calc.callCount};
   results.push(row);
   console.log('TRACED',JSON.stringify({name:row.name,quoted:row.quotedRewardUSD,paid:row.actualTraceRewardUSD,gas:row.gasUSDEst,net:row.netAfterGasUSD,eligible:row.eligible}));
  }catch(e){const err={name:entry.id,strategy:entry.strategy,error:String(e.message).slice(0,160)};results.push(err);console.log('ERR',JSON.stringify(err));}
 }
 const report={timestamp:new Date().toISOString(),method:'debug_traceCall(callTracer.withLog=true) on Base',block:b,pricedAtUsd:price,
 latestGasPriceWei:gasPriceWei.toString(),tested:results.length,
 tracedSuccess:results.filter(x=>x.eligible).length,
 netPositive:results.filter(x=>x.eligible&&x.netAfterGasUSD>0).length,
 realizedUsd:0,notes:'Receipt logs from public RPC debug_traceCall are simulated logs, not mined mainnet receipts. Count ERC20 WETH Transfer events to specified address plus native CALL value. Gas valued by maxFeePerGas current. No winner inclusion claims or 24h extrapolations.',
 rows:results};
 fs.writeFileSync('/tmp/omega-evm/beefy-trace-report.json',JSON.stringify(report,null,2)+'\n');
 console.log('SUMMARY',JSON.stringify({block:b,tested:report.tested,success:report.tracedSuccess,netPositive:report.netPositive,best:results.filter(x=>x.eligible).sort((a,b)=>b.netAfterGasUSD-a.netAfterGasUSD).slice(0,6).map(x=>({name:x.name,net:x.netAfterGasUSD,paid:x.actualTraceRewardUSD}))}));
}
main().catch(e=>{console.log('FATAL',e.stack);process.exitCode=1});
