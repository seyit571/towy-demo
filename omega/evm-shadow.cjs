#!/usr/bin/env node
'use strict';
/* Read-only Morpho liquidation preflight: on-chain health and economic ceiling, NOT a complete execution simulation. */
const fs=require('fs'),path=require('path');
const {ethers}=require('ethers');
const MORPHO='0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
const NETWORKS=[
 {id:8453,name:'Base',rpc:'https://base-rpc.publicnode.com'},
 {id:1,name:'Ethereum',rpc:'https://ethereum-rpc.publicnode.com'},
 {id:42161,name:'Arbitrum',rpc:'https://arbitrum-one-rpc.publicnode.com'},
];
const query='query($ids:[Int!]){marketPositions(first:100,orderBy:HealthFactor,orderDirection:Asc,where:{chainId_in:$ids,healthFactor_lte:0.999,marketListed:true}){pageInfo{countTotal}items{healthFactor user{address}market{marketId loanAsset{symbol}collateralAsset{symbol}}state{borrowAssetsUsd collateralUsd borrowShares collateral}}}}';
const abi=new ethers.Interface([
 'function idToMarketParams(bytes32) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)',
 'function position(bytes32,address) view returns(uint256 supplyShares,uint128 borrowShares,uint128 collateral)',
 'function market(bytes32) view returns(uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)',
]);
const ora=new ethers.Interface(['function price() view returns(uint256)']);
const sample=[],errors=[],summaries=[];
let ethUsd=null;
async function scanNetwork(net){
 const provider=new ethers.JsonRpcProvider(net.rpc,net.id,{staticNetwork:true});
 const response=await fetch('https://api.morpho.org/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables:{ids:[net.id]}}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Morpho API '+response.status);
 const payload=await response.json();if(payload.errors)throw Error(payload.errors[0].message);
 const marketPositions=payload.data.marketPositions;
 const eligible=marketPositions.items.filter(x=>Number(x.state?.borrowAssetsUsd)>0).sort((a,b)=>Number(b.state.borrowAssetsUsd)-Number(a.state.borrowAssetsUsd));
 let block=0,feePerGas=null;try{
  const b=await provider.getBlock('latest');block=Number(b.number);
  const fee=await provider.getFeeData();feePerGas=fee.maxFeePerGas||fee.gasPrice||null;
 }catch(e){errors.push(net.name+' block: '+e.message.slice(0,90))}
 const result={network:net.name,chainId:net.id,block,atRisk:marketPositions.pageInfo.countTotal,
  sampled:Math.min(eligible.length,12),chainRpcOk:!!block,onchainUnderwater:0,
  grossPositiveKnown:0,netBoundPositive:0};
 const chosen=eligible.slice(0,12);
 for(const x of chosen){
  try{
   const borrower=x.user.address,id=x.market.marketId;
   const p=abi.decodeFunctionResult('idToMarketParams',await provider.call({to:MORPHO,data:abi.encodeFunctionData('idToMarketParams',[id])}));
   const loan=abi.decodeFunctionResult('position',await provider.call({to:MORPHO,data:abi.encodeFunctionData('position',[id,borrower])}));
   const m=abi.decodeFunctionResult('market',await provider.call({to:MORPHO,data:abi.encodeFunctionData('market',[id])}));
   const oracle=ora.decodeFunctionResult('price',await provider.call({to:p.oracle,data:ora.encodeFunctionData('price',[])}))[0];
   if(m.totalBorrowShares===0n||oracle===0n)continue;
   // conservative: excludes interest accrued since market.lastUpdate; true health needs protocol accrual.
   const debtUnits=(loan.borrowShares*(m.totalBorrowAssets+1n)+m.totalBorrowShares+1000000n-1n)/(m.totalBorrowShares+1000000n);
   const maxDebtUnits=(loan.collateral*oracle/10n**36n)*p.lltv/10n**18n;
   const definitelyUnderwater=debtUnits>maxDebtUnits;
   const lif=Math.min(1.15,1/(0.7+0.3*Number(p.lltv)/1e18));
   const apiDebt=Number(x.state.borrowAssetsUsd||0);
   const collatRaw=x.state.collateralUsd;
   const collat=collatRaw===null||collatRaw===undefined?null:Number(collatRaw);
   const grossBound=collat===null?null:Math.max(0,Math.min(apiDebt,collat/lif)*(lif-1));
   const gasUsd=feePerGas&&ethUsd ? Number(feePerGas)*650000/1e18*ethUsd : null;
   const preSwapNetBound=grossBound!==null&&gasUsd!==null?grossBound-gasUsd:null;
   if(definitelyUnderwater)result.onchainUnderwater++;
   if(definitelyUnderwater&&grossBound>0)result.grossPositiveKnown++;
   if(definitelyUnderwater&&preSwapNetBound>0)result.netBoundPositive++;
   sample.push({
    chain:net.name,chainId:net.id,block,borrower,marketId:id,
    collateral:x.market.collateralAsset.symbol,loan:x.market.loanAsset.symbol,
    hfApi:Number(x.healthFactor),borrowUsd:Number(apiDebt.toFixed(4)),
    collateralUsd:collat,grossBonusCeilingUsd:grossBound===null?null:Number(grossBound.toFixed(5)),
    gasAssumptionUnits:650000,gasEstimateUsd:gasUsd===null?null:Number(gasUsd.toFixed(5)),
    preSwapUpperBoundUsd:preSwapNetBound===null?null:Number(preSwapNetBound.toFixed(5)),
    onchainUnderwaterBeforeAccrual:definitelyUnderwater,
    executedSimulation:false,
    executableVerified:false,
    qualification:!definitelyUnderwater?'NOT_CONFIRMED_ONCHAIN':collat===null?'NO_COLLATERAL_USD_VALUATION':(preSwapNetBound===null?'NO_GAS_PRICE':preSwapNetBound<=0?'BELOW_GAS_CEILING':'SWAP_AND_EXECUTION_UNCHECKED'),
   });
  }catch(e){errors.push(net.name+' '+x.market.marketId.slice(0,10)+': '+String(e.message).slice(0,110));}
 }
 summaries.push(result);
}
async function main(){
 try{const res=await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot',{signal:AbortSignal.timeout(9000)});
 const p=await res.json();const n=Number(p?.data?.amount);if(n>0)ethUsd=n;}catch(e){errors.push('ETH USD oracle: '+e.message)}
 for(const n of NETWORKS){try{await scanNetwork(n)}catch(e){errors.push(n.name+': '+e.message)}}
 const report={timestamp:new Date().toISOString(),type:'ONCHAIN_ELIGIBILITY_AND_UPPER_BOUNDS',
  realizedUsd:0,atomicSimulationsPassed:0,confirmedProfitableActions:0,
  scope:'Limited to 12 candidate positions per chain with nonzero debt; status is not full coverage.',
  estimates:'Upper bounds computed using USD valuations from Morpho API and 650000 gas units at live RPC maxFeePerGas. Excludes swap, transaction failure, MEV bribes, and liquidation share rounding.',
  etherPriceUsd:ethUsd,netPerMinuteUsd:0,netPerHourUsd:0,netTotalUsd:0,
  networks:summaries,positions:sample,errors};
 const directory=path.join(__dirname,'data');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'evm.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({chains:summaries,candidates:sample.length,strictlyPositiveBounds:sample.filter(x=>x.onchainUnderwaterBeforeAccrual&&x.preSwapUpperBoundUsd>0).length,errors:errors.length,ethUsd},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
