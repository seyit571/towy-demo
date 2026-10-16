const { ethers }=require('ethers'),fs=require('fs');
const p=new ethers.JsonRpcProvider('https://bsc-rpc.publicnode.com',56,{staticNetwork:true});
const venues={PancakeV2:'0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',BiswapV2:'0x858E3312ed3A876947EA49d572A7C42DE08af7EE',ApeSwap:'0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6'};
const toks={USDT:'0x55d398326f99059fF775485246999027B3197955',WBNB:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',USDC:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',BUSD:'0xe9e7cea3dedca5984780bafc599bd69add087d56',BTCB:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',CAKE:'0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',BSW:'0x965f527d9159dce6288a2219db51fc6eef120dd1',ETH:'0x2170Ed0880ac9A755fd29B2688956BD959F933F8',DOGE:'0xbA2aE424d960c26247Dd6c32edC70B295c744C43'};
const f=new ethers.Interface(['function getPair(address,address) view returns(address)']);
const pair=new ethers.Interface(['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const erc=new ethers.Interface(['function decimals() view returns(uint8)']);
const quote=(amt,a,b,fee)=>amt*(10000n-fee)*b/(a*10000n+amt*(10000n-fee));
async function main(){
 const block=await p.getBlockNumber(),symbols=Object.keys(toks),poolMap=new Map(),dec={};
 for(const [name,addr]of Object.entries(toks)){try{const r=await p.call({to:addr,data:erc.encodeFunctionData('decimals',[])},block);dec[name]=Number(erc.decodeFunctionResult('decimals',r)[0]);}catch{dec[name]=18}}
 let count=0;
 for(let i=0;i<symbols.length;i++)for(let j=i+1;j<symbols.length;j++){
  const a=symbols[i],b=symbols[j];
  for(const [venue,factory] of Object.entries(venues)){
   try{
    const addr=f.decodeFunctionResult('getPair',await p.call({to:factory,data:f.encodeFunctionData('getPair',[toks[a],toks[b]])},block))[0];if(addr===ethers.ZeroAddress)continue;
    const [token0x,rs]=await Promise.all([p.call({to:addr,data:pair.encodeFunctionData('token0',[])},block),p.call({to:addr,data:pair.encodeFunctionData('getReserves',[])},block)]);
    const token0=pair.decodeFunctionResult('token0',token0x)[0].toLowerCase(),rx=pair.decodeFunctionResult('getReserves',rs);
    const rin=token0===toks[a].toLowerCase()?rx[0]:rx[1],rout=token0===toks[a].toLowerCase()?rx[1]:rx[0];
    if(rin>0n&&rout>0n){poolMap.set([a,b,venue].join('|'),{address:addr,venue,a,b,rin,rout});count++;}
   }catch(e){}
  }
 }
 let edges=[], tests=0,positive=0,all=[],byRoute=new Map();
 const allPools=[...poolMap.values()];
 const feeBps={PancakeV2:25n,BiswapV2:20n,ApeSwap:30n};
 for(const pool of allPools){
   edges.push({from:pool.a,to:pool.b,rin:pool.rin,rout:pool.rout,fee:feeBps[pool.venue],venue:pool.venue,pool:pool.address});
   edges.push({from:pool.b,to:pool.a,rin:pool.rout,rout:pool.rin,fee:feeBps[pool.venue],venue:pool.venue,pool:pool.address});
 }
 const adj={};for(const e of edges)(adj[e.from]??=[]).push(e);
 const samples=[1,3,10,30,100,300,1000,3000,10000,30000,100000];
 let uniquePaths=new Set();
 for(const base of ['USDT','USDC']){
  for(const hopA of adj[base]||[]){
   for(const hopB of adj[hopA.to]||[]){
    if(hopA.pool.toLowerCase()===hopB.pool.toLowerCase())continue;
    const possible=hopB.to===base?[[]]:(adj[hopB.to]||[]).filter(e=>e.to===base&&e.pool.toLowerCase()!==hopB.pool.toLowerCase()&&e.pool.toLowerCase()!==hopA.pool.toLowerCase()).map(e=>[e]);
    for(const last of possible){
     const steps=[hopA,hopB,...last];
     const pools=steps.map(e=>e.pool.toLowerCase());
     if((new Set(pools)).size!==steps.length)continue;
     const id=steps.map(e=>e.from+':'+e.to+':'+e.venue).join('|');
     if(uniquePaths.has(id))continue;uniquePaths.add(id);
     let best=null;
     for(const amount of samples){
      let n=ethers.parseUnits(String(amount),dec[base]);
      const initial=n;let pass=true;const values=[];
      for(const step of steps){
       if(step.rin<=0n||step.rout<=0n){pass=false;break;}
       n=quote(n,step.rin,step.rout,step.fee);
       if(n<=0n){pass=false;break;}values.push(n);
      }
      if(!pass)continue;
      tests++;
      const gross=Number(ethers.formatUnits(n-initial,dec[base]));
      if(gross>0)positive++;
      const flashAssumed=amount*0.0009;
      const gasAssumed=steps.length===2?0.035:0.065; // USD (not real gas estimation)
      const competitionStress=Number(ethers.formatUnits(n,dec[base]))*0.001;
      const net=gross-flashAssumed-gasAssumed-competitionStress;
      const row={route:[base,...steps.map(e=>e.to)].join('→'),amount,steps:steps.map(e=>({venue:e.venue,from:e.from,to:e.to,pool:e.pool,feeBps:Number(e.fee)})),hopCount:steps.length,
       grossUsdAssumingPeg:gross,flashPremiumAssumedUsd:flashAssumed,gasAssumedUsd:gasAssumed,competitionStressUsd:competitionStress,
       netIndicativeUsd:net,block};
      if(best===null||row.netIndicativeUsd>best.netIndicativeUsd)best=row;
     }
     if(best){all.push(best);byRoute.set(id,best);}
    }
   }
  }
 }
 all.sort((a,b)=>b.netIndicativeUsd-a.netIndicativeUsd);
 const viable=all.filter(x=>x.netIndicativeUsd>0);
 const result={timestamp:new Date().toISOString(),block,chainId:56,scope:'9 tokens, 3 venue factories, all V2 2/3 hop cycles starting and ending USDC or USDT, discrete sizing',
   method:'V2_RESERVE_MODEL_ONLY_NOT_TRANSACTION',venues:Object.keys(venues),poolsRead:count,distinctPaths:uniquePaths.size,amountsSampled:tests,
   grossPositiveTests:positive,indicativePositivePaths:viable.length,positiveAfterFullAtomicSimulation:0,
   positiveAfterFullAtomicSimulationNetUsd:0,realizedUsd:0,
   caveat:'Assumed token USD parity, flash premium 9 bps, gas $0.035/$0.065, 10 bps competition stress, ApeSwap fee 30 bps conservative. Results NOT executable until exact fork transaction and token tax checks.',
   top:all.slice(0,80),topIndicativePositive:viable.slice(0,40)};
 fs.writeFileSync('/tmp/omega-evm/data/triangles.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({block,pools:count,paths:uniquePaths.size,tests,grossPositiveTests:positive,netPositivePaths:viable.length,top:all.slice(0,12).map(x=>({route:x.route,amount:x.amount,gross:x.grossUsdAssumingPeg,net:x.netIndicativeUsd,steps:x.steps.map(z=>z.venue)}))},null,2));
}
main().catch(e=>{console.log('ERR',e.message);process.exitCode=1});
