const {ethers}=require('ethers'),fs=require('fs');
const p=new ethers.JsonRpcProvider('http://127.0.0.1:8559',8453,{staticNetwork:true});
const weth='0x4200000000000000000000000000000000000006';
const abi=new ethers.Interface(['function harvest(address)','function callReward() view returns(uint256)']);
const erc=new ethers.Interface(['function balanceOf(address) view returns(uint256)']);
const targets=[
 {id:'aerodrome-cow-base-usdc-msftc-vault',address:'0x54F29185563cF8a590591Ea5F646f8f5f74997cC'},
 {id:'aerodrome-cow-base-usdc-metac-vault',address:'0x83Bf9A60787141F103ee965D2a05044f1651E9Cf'},
 {id:'aerodrome-cow-base-usdc-aaplc-vault',address:'0xf80E2fe60CCf4d6586A72444F4576e4e1F2978cd'},
];
async function balToken(addr){const r=await p.send('eth_call',[{to:weth,data:erc.encodeFunctionData('balanceOf',[addr])},'latest']);return erc.decodeFunctionResult('balanceOf',r)[0];}
async function balNative(addr){return BigInt(await p.send('eth_getBalance',[addr,'latest']));}
async function reward(addr){const r=await p.send('eth_call',[{to:addr,data:abi.encodeFunctionData('callReward',[])},'latest']);return abi.decodeFunctionResult('callReward',r)[0];}
(async()=>{
const s=await p.getSigner(0),wallet=await s.getAddress(),block=await p.getBlockNumber();
console.log('BASE_FORK_BLOCK',block,'WALLET',wallet);const results=[];
for(const x of targets){
 let row={vault:x.id,contract:x.address,block};
 console.log('START',x.id);
 const snapshot=await p.send('evm_snapshot',[]);
 try{
  const beforeNative=await balNative(wallet),beforeWeth=await balToken(wallet);
  const v=await reward(x.address);row.callRewardETH=ethers.formatEther(v);console.log('QUOTED',row.callRewardETH);
  let tx=await s.sendTransaction({to:x.address,data:abi.encodeFunctionData('harvest(address)',[wallet]),gasLimit:8000000,gasPrice:ethers.parseUnits('0.02','gwei')});
  console.log('FORK_HASH',tx.hash);
  let rc=await tx.wait();console.log('FORK_RECEIPT',rc.status,rc.gasUsed.toString());
  const afterNative=await balNative(wallet),afterWeth=await balToken(wallet);
  const deltaNative=afterNative-beforeNative,deltaWeth=afterWeth-beforeWeth;
  row={...row,atomicSucceeded:rc.status===1,forkHash:rc.hash,gasUsed:rc.gasUsed.toString(),gasPaidETH:ethers.formatEther(rc.gasUsed*rc.gasPrice),
   actualWETHCredit:ethers.formatEther(deltaWeth),nativeETHDelta:ethers.formatEther(deltaNative),actualNetETHAfterGas:ethers.formatEther(deltaNative+deltaWeth)};
 }catch(e){row={...row,atomicSucceeded:false,error:String(e.shortMessage||e.message).slice(0,200)};console.log('FAIL',row.error)}
 results.push(row);
 await p.send('evm_revert',[snapshot]);
}
const proof={timestamp:new Date().toISOString(),type:'BASE_BEEFY_FORK_PROOF',forkBlock:block,network:'Base',wallet:'LOCAL_EPHEMERAL_TEST_ACCOUNT',realizedOnMainnetETH:0,
 caveat:'FORK ONLY, native + WETH wallet deltas include local gas payment. OP Stack L1 data surcharge may differ from actual mainnet inclusion; independent fee quotation required.',results};
fs.writeFileSync('/tmp/omega-evm/beefy-base-anvil-blast-results.json',JSON.stringify(proof,null,2)+'\n');
console.log('PROOF',JSON.stringify(proof,null,2));
})().catch(e=>{console.log('FATAL',(e.shortMessage||e.message).slice(0,230));process.exitCode=1});
