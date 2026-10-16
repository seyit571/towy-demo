const {ethers}=require('ethers');
const rpcs=['https://bsc-rpc.publicnode.com','https://bsc-dataseed.binance.org'];
const venues={
  PancakeV2:'0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  Biswap:'0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
};
const tokens={
  WBNB:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT:'0x55d398326f99059fF775485246999027B3197955',
  USDC:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  BUSD:'0xe9e7cea3dedca5984780bafc599bd69add087d56',
  BTCB:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'
};
const IFactory=new ethers.Interface(['function getPair(address,address) view returns(address)']);
const IPair=new ethers.Interface(['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)']);
const provider=new ethers.JsonRpcProvider(rpcs[0],56,{staticNetwork:true});
const tkeys=Object.keys(tokens);
async function main(){
let block=await provider.getBlockNumber(),pairs={},scans=0;
function quote(x,rin,rout,fee=30n){return x*(10000n-fee)*rout/(rin*10000n+x*(10000n-fee))}
for(let a=0;a<tkeys.length;a++)for(let b=a+1;b<tkeys.length;b++){
 const [x,y]=[tkeys[a],tkeys[b]];
 for(const [venue,factory] of Object.entries(venues)){
  try{
  const adr=IFactory.decodeFunctionResult('getPair',await provider.call({to:factory,data:IFactory.encodeFunctionData('getPair',[tokens[x],tokens[y]]),blockTag:block}))[0];
  if(adr===ethers.ZeroAddress)continue;
  const [t0,rr]=await Promise.all([
   provider.call({to:adr,data:IPair.encodeFunctionData('token0',[]),blockTag:block}),
   provider.call({to:adr,data:IPair.encodeFunctionData('getReserves',[]),blockTag:block})
  ]);
  const token0=IPair.decodeFunctionResult('token0',t0)[0];
  const re=IPair.decodeFunctionResult('getReserves',rr);
  const reserveX=token0.toLowerCase()===tokens[x].toLowerCase()?re[0]:re[1];
  const reserveY=token0.toLowerCase()===tokens[x].toLowerCase()?re[1]:re[0];
  if(reserveX>0n&&reserveY>0n)pairs[[x,y,venue].join('|')]={venue,x,y,adr,reserveX,reserveY};
  }catch(e){console.log('pair read failed',venue,x,y,e.message.slice(0,90))}
 }
}
let best=[];
for(let a=0;a<tkeys.length;a++)for(let b=a+1;b<tkeys.length;b++){
 let x=tkeys[a],y=tkeys[b],p=pairs[[x,y,'PancakeV2'].join('|')],q=pairs[[x,y,'Biswap'].join('|')];if(!p||!q)continue;
 for(const initial of [0.1,1,10,100,1000,10000,100000]){
  for(const direction of [0,1]){
   for(const which of [0,1]){
    let swap1=which===0?p:q,swap2=which===0?q:p;
    const startToken=direction===0?x:y;
    const start=BigInt(Math.round(initial*1e6))*10n**12n;
    const r1in=direction===0?swap1.reserveX:swap1.reserveY,r1out=direction===0?swap1.reserveY:swap1.reserveX;
    const r2in=direction===0?swap2.reserveY:swap2.reserveX,r2out=direction===0?swap2.reserveX:swap2.reserveY;
    const stable=['USDC','USDT','BUSD'];const fee1=swap1.venue==='PancakeV2'?25n:(stable.includes(x)&&stable.includes(y)?10n:20n);const fee2=swap2.venue==='PancakeV2'?25n:(stable.includes(x)&&stable.includes(y)?10n:20n);const first=quote(start,r1in,r1out,fee1),last=quote(first,r2in,r2out,fee2);
    const net=(Number(last-start)/1e18);
    best.push({token:startToken,against:startToken===x?y:x,amount:initial,via1:swap1.venue,via2:swap2.venue,grossAfterDexFees:net,grossPercent:net/initial*100,block});
    scans++;
   }
  }
 }
}
best.sort((a,b)=>b.grossAfterDexFees-a.grossAfterDexFees);
console.log('BLOCK',block,'PAIRS',Object.values(pairs).map(x=>x.x+'/'+x.y+'/'+x.venue),'TESTS',scans);
console.log('TOP10',JSON.stringify(best.slice(0,10)));
const positive=best.filter(x=>x.grossAfterDexFees>0);console.log('POSITIVE',positive.length);const fs=require('fs');fs.mkdirSync(require('path').join(__dirname,'data'),{recursive:true});fs.writeFileSync(require('path').join(__dirname,'data','bsc.json'),JSON.stringify({timestamp:new Date().toISOString(),block,chainId:56,network:'BNB Chain',venues:Object.keys(venues),tokens:tkeys,readPools:Object.keys(pairs).length,scenarios:scans,positiveScenarios:positive.length,top:best.slice(0,30),classification:'AMM_RESERVE_TWO_LEG_QUOTE_NOT_EXECUTED',atomicEthCallSuccesses:0,confirmedProfitsUsd:0,realizedUsd:0,fees:{pancakeV2:0.0025,biswapV2Regular:0.002,biswapV2Stable:0.001}},null,2));

}
main().catch(e=>{console.error(e);process.exitCode=1});
