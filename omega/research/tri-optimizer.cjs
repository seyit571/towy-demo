'use strict';
const {ethers}=require('ethers'),fs=require('fs');
const rpc=process.env.BSC_RPC||'https://bsc-dataseed.binance.org';
const p=new ethers.JsonRpcProvider(rpc,56,{staticNetwork:true});
const factories={PancakeV2:'0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',BiswapV2:'0x858E3312ed3A876947EA49d572A7C42DE08af7EE',ApeSwapV2:'0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6'};
const tokens={USDT:'0x55d398326f99059fF775485246999027B3197955',WBNB:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',USDC:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',BUSD:'0xe9e7cea3dedca5984780bafc599bd69add087d56',BTCB:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',CAKE:'0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',BSW:'0x965f527d9159dce6288a2219db51fc6eef120dd1',ETH:'0x2170Ed0880ac9A755fd29B2688956BD959F933F8',DOGE:'0xbA2aE424d960c26247Dd6c32edC70B295c744C43'};
const fact=new ethers.Interface(['function getPair(address,address) view returns(address)']);
const pair=new ethers.Interface(['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const fee={PancakeV2:25n,BiswapV2:20n,ApeSwapV2:20n};
const tokensNames=Object.keys(tokens),pools=[],graph=new Map();
function quote(amount,rin,rout,feeBps){if(amount<=0n)return 0n;let x=amount*(10000n-feeBps);return (x*rout)/(rin*10000n+x);}
function runRoute(path,amount){
 let out=amount;
 for(const edge of path){out=quote(out,edge.rIn,edge.rOut,edge.fee);if(out<=0n)return 0n;}
 return out;
}
async function main(){
 let block=Number(await p.getBlockNumber()),gasWei=(await p.getFeeData()).gasPrice||0n;
 // Robust live WBNB->USDT quoted from external Pancake V3 quoter (only used as gas valuation).
 let bnbPrice=null;
 try{
 const i=new ethers.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)']);
 const result=await p.call({to:'0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',data:i.encodeFunctionData('quoteExactInputSingle',[[tokens.WBNB,tokens.USDT,10n**18n,500,0]])},block);
 bnbPrice=Number(ethers.formatEther(i.decodeFunctionResult('quoteExactInputSingle',result)[0]));
 }catch(e){console.log('BNB_PRICE_ERROR',String(e.shortMessage||e.message).slice(0,100));}
 const keys=tokensNames;
 for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
  const a=keys[i],b=keys[j];
  for(const [venue,addr] of Object.entries(factories)){
   try{
    const pairAddr=fact.decodeFunctionResult('getPair',await p.call({to:addr,data:fact.encodeFunctionData('getPair',[tokens[a],tokens[b]])},block))[0];
    if(pairAddr===ethers.ZeroAddress)continue;
    const [first,res]=await Promise.all([
     p.call({to:pairAddr,data:pair.encodeFunctionData('token0',[])},block),
     p.call({to:pairAddr,data:pair.encodeFunctionData('getReserves',[])},block)
    ]);
    const firstAddr=pair.decodeFunctionResult('token0',first)[0];
    const rr=pair.decodeFunctionResult('getReserves',res);
    const rA=firstAddr.toLowerCase()===tokens[a].toLowerCase()?rr[0]:rr[1],rB=firstAddr.toLowerCase()===tokens[a].toLowerCase()?rr[1]:rr[0];
    if(rA<=0n||rB<=0n)continue;
    pools.push({venue,address:pairAddr,a,b,usdTvlUnavailable:true});
    for(const e of [{from:a,to:b,rIn:rA,rOut:rB},{from:b,to:a,rIn:rB,rOut:rA}]){
     const item={...e,venue,fee:fee[venue],address:pairAddr};
     if(!graph.has(e.from))graph.set(e.from,[]);
     graph.get(e.from).push(item);
    }
   }catch(e){}
  }
 }
 let samples=0,paths=0,positive=0,ranked=[],bestRouteIds=new Set();
 const flashBps=25,gasUnits={2:250000,3:340000};
 const feeUsd=Number(gasWei)/1e18*(bnbPrice||0);
 const sizes=[0.001,0.01,0.1,1,3,10,30,100,300,1000,3000,10000,30000,100000];
 const usdt='USDT';
 const startEdges=graph.get(usdt)||[];
 function score(edges,inputUsdt){
   const input=ethers.parseEther(String(inputUsdt)),output=runRoute(edges,input);
   const gross=Number(ethers.formatEther(output-input));
   const gas=feeUsd*gasUnits[edges.length];
   const flash=inputUsdt*flashBps/10000;
   return {inputUsdt,grossUsdt:gross,flashCostUsdt:flash,gasCostUsdt:gas,netUsdt:gross-flash-gas,
       outputUsdt:Number(ethers.formatEther(output))};
 }
 function evalPath(edges){
  paths++;
  let best=null,positiveSamples=0;
  for(const size of sizes){
   const q=score(edges,size);samples++;
   if(q.netUsdt>0)positiveSamples++;
   if(!best||q.netUsdt>best.netUsdt)best=q;
  }
  if(positiveSamples)positive++;
  // Return only best size for each route; never sum as independent opportunities.
  if(best){ranked.push({...best,legs:edges.length,route:edges.map(e=>e.from+'>'+e.to+'('+e.venue+')').join(' | '),
     poolAddresses:edges.map(e=>e.address),block,positiveSamples});}
 }
 for(const a of startEdges){
 for(const back of graph.get(a.to)||[]){
  if(back.to==='USDT'&&back.address.toLowerCase()!==a.address.toLowerCase())evalPath([a,back]);
  if(back.to==='USDT'||back.to==='USDT')continue;
  for(const third of graph.get(back.to)||[]){
   if(third.to!=='USDT')continue;
   if(new Set([a.address.toLowerCase(),back.address.toLowerCase(),third.address.toLowerCase()]).size!==3)continue;
   evalPath([a,back,third]);
  }
 }
 }
 ranked.sort((a,b)=>b.netUsdt-a.netUsdt);
 const distinct = ranked.filter(x=>{const k=[...x.poolAddresses].sort().join(',');if(bestRouteIds.has(k))return false;bestRouteIds.add(k);return true});
 const result={timestamp:new Date().toISOString(),source:'BNB_RPC_REAL_RESERVES',block,network:'BNB Chain',
  tokens:tokensNames,poolsObserved:pools.length,uniqueRoutes:paths,samples,positiveRoutesAtBest:positive,
  priceBNB_USDT:bnbPrice,gasWei:gasWei.toString(),assumptions:{flashFeeBps:flashBps,gasUnits,venueSwapFeeBps:{PancakeV2:25,BiswapV2:20,ApeSwapV2:20}},
  methodology:'Three swaps through three separate AMM pools or two swaps through two separate pools at pinned block; exact integer V2 reserve quotes. PnL in USDT minus 25bps hypothetical flash fee and gas valued using onchain WBNB-USDT. Excludes tokens with transfer taxes, gas from actual executor, inclusion costs and MEV competition. No on-chain execution simulation.',
  profitableAtomicConfirmed:0,realizedUSDT:0,
  top:distinct.slice(0,40),bestOverall:ranked.slice(0,20)};
 fs.writeFileSync('/tmp/omega-evm/tri-results.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({block,pools:pools.length,paths,samples,positiveRoutesAtBest:positive,best:ranked.slice(0,6),bestDistinct:distinct.slice(0,3)},null,2));
}
main().catch(e=>{console.error('FATAL',e.message);process.exitCode=1});
