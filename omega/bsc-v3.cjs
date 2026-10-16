const { ethers } = require('ethers');
const fs = require('fs'), path=require('path');
const p=new ethers.JsonRpcProvider('https://bsc-rpc.publicnode.com',56,{staticNetwork:true});
const facs={PancakeV2:'0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',BiswapV2:'0x858E3312ed3A876947EA49d572A7C42DE08af7EE'};
const t={USDT:'0x55d398326f99059fF775485246999027B3197955',WBNB:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',USDC:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',BUSD:'0xe9e7cea3dedca5984780bafc599bd69add087d56',BTCB:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'};
const q='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const fact=new ethers.Interface(['function getPair(address,address) view returns(address)']);
const pairI=new ethers.Interface(['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const quoter=new ethers.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const getOut=(x,rIn,rOut,fee)=>x*(10000n-fee)*rOut/(rIn*10000n+x*(10000n-fee));
let errors=[],cycles=[],block=0,sourcePools=[];
async function main(){
block=await p.getBlockNumber();
const gas=await p.getFeeData();const gasWei=gas.maxFeePerGas||gas.gasPrice||0n;
for(const token of ['WBNB','USDC','BUSD','BTCB']){
 let pools=[];
 for(const [venue,factory] of Object.entries(facs)){
  try{
   const adr=fact.decodeFunctionResult('getPair',await p.call({to:factory,data:fact.encodeFunctionData('getPair',[t.USDT,t[token]]),blockTag:block}))[0];
   if(adr===ethers.ZeroAddress)continue;
   const [token0b,rb]=await Promise.all([
    p.call({to:adr,data:pairI.encodeFunctionData('token0',[]),blockTag:block}),
    p.call({to:adr,data:pairI.encodeFunctionData('getReserves',[]),blockTag:block})
   ]);
   const token0=pairI.decodeFunctionResult('token0',token0b)[0].toLowerCase();
   const rr=pairI.decodeFunctionResult('getReserves',rb);
   const a=token0===t.USDT.toLowerCase()?rr[0]:rr[1],b=token0===t.USDT.toLowerCase()?rr[1]:rr[0];
   if(a>0n&&b>0n){pools.push({venue,addr:adr,a,b});sourcePools.push(venue+':'+token);}
  }catch(e){errors.push('PAIR '+venue+' '+token+':'+e.message.slice(0,90));}
 }
 if(!pools.length)continue;
 for(const amount of [100,1000,10000]){
  const x=ethers.parseUnits(String(amount),18);
  for(const fee of [100,500,2500]){
   let leg1=null;
   try{
    const r=await p.call({to:q,data:quoter.encodeFunctionData('quoteExactInputSingle',[[t.USDT,t[token],x,fee,0]]),blockTag:block});
    leg1=quoter.decodeFunctionResult('quoteExactInputSingle',r)[0];
   }catch(e){errors.push('V3 OUT '+token+' '+fee+':'+e.message.slice(0,65))}
   for(const pool of pools)if(leg1!==null){
    const feeV2=pool.venue==='PancakeV2'?25n:(['USDC','BUSD'].includes(token)?10n:20n);
    const second=getOut(leg1,pool.b,pool.a,feeV2);
    const gross=Number(ethers.formatEther(second-x));
    cycles.push({token,amountUsdApprox:amount,feeTierBps:fee/100,route:'PancakeV3 → '+pool.venue,grossAfterDexFeesUsdApprox:gross});
   }
   for(const pool of pools){
    const feeV2=pool.venue==='PancakeV2'?25n:(['USDC','BUSD'].includes(token)?10n:20n);
    const intermediate=getOut(x,pool.a,pool.b,feeV2);
    try{
     const r=await p.call({to:q,data:quoter.encodeFunctionData('quoteExactInputSingle',[[t[token],t.USDT,intermediate,fee,0]]),blockTag:block});
     const last=quoter.decodeFunctionResult('quoteExactInputSingle',r)[0];
     const gross=Number(ethers.formatEther(last-x));
     cycles.push({token,amountUsdApprox:amount,feeTierBps:fee/100,route:pool.venue+' → PancakeV3',grossAfterDexFeesUsdApprox:gross});
    }catch(e){errors.push('V3 IN '+token+' '+fee+':'+e.message.slice(0,65))}
   }
  }
 }
}
const flashBps=9;const assumedGas=800000;
let bnbUSDT=null;try{ const bnbPriceQuote=await p.call({to:q,data:quoter.encodeFunctionData('quoteExactInputSingle',[[t.WBNB,t.USDT,ethers.parseEther('1'),500,0]]),blockTag:block}); bnbUSDT=Number(ethers.formatEther(quoter.decodeFunctionResult('quoteExactInputSingle',bnbPriceQuote)[0])); }catch(e){errors.push('BNB price quote: '+e.message.slice(0,90))}
const gasUsd=Number.isFinite(bnbUSDT)?Number(gasWei)/1e9*assumedGas/1e9*bnbUSDT:0;
for(const row of cycles){
 row.flashPremiumAssumptionUsd=row.amountUsdApprox*flashBps/10000;
 row.gasCostIllustrativeUsd=gasUsd;
 row.netAfterFlashGasUsdApprox=row.grossAfterDexFeesUsdApprox-row.flashPremiumAssumptionUsd-gasUsd;
}
cycles.sort((a,b)=>b.netAfterFlashGasUsdApprox-a.netAfterFlashGasUsdApprox);
const positive=cycles.filter(x=>x.netAfterFlashGasUsdApprox>0).length;
const report={timestamp:new Date().toISOString(),block,chainId:56,venues:['PancakeSwap V3','PancakeSwap V2','Biswap V2'],sourcePools,scenarioCount:cycles.length,positiveAfterAssumptions:positive,best:cycles.slice(0,40),errors:errors.slice(0,20),flashPremiumAssumedBps:flashBps,gasAssumption:assumedGas,gasPriceWei:gasWei.toString(),bnbUsdAssumed:bnbUSDT,executionSimulationsPassed:0,confirmedProfitUsd:0,realizedUsd:0,method:'SAME_BLOCK_V3_ETH_CALL_V2_RESERVES_QUOTED_NOT_ATOMIC_EXEC',limits:'Sequential eth_call quotes at a pinned block; no verified flash funding, on-chain execution, gas estimation from actual executor, token taxes, or MEV priority.'};
fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});fs.writeFileSync(path.join(__dirname,'data','bsc-v3.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({block,sourcePools:sourcePools.length,cycles:cycles.length,positive,best:cycles.slice(0,7),errors:errors.length,gasUsd},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1});
