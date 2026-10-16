const {ethers}=require('ethers'),fs=require('fs');
const p=new ethers.JsonRpcProvider('http://127.0.0.1:8556',56,{staticNetwork:true});
const WBNB='0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',USDT='0x55d398326f99059fF775485246999027B3197955';
const iface=new ethers.Interface(['function harvest(address)','function callReward() view returns(uint256)']);
const erc=new ethers.Interface(['function balanceOf(address) view returns(uint256)']);
const quoter=new ethers.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const q='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
async function ercBalance(addr){const raw=await p.send('eth_call',[{to:WBNB,data:erc.encodeFunctionData('balanceOf',[addr])},'latest']);return erc.decodeFunctionResult('balanceOf',raw)[0];}
async function nativeBalance(addr){return BigInt(await p.send('eth_getBalance',[addr,'latest']));}
async function getReward(address){const raw=await p.send('eth_call',[{to:address,data:iface.encodeFunctionData('callReward',[])},'latest']);return iface.decodeFunctionResult('callReward',raw)[0];}
(async()=>{
const signer=await p.getSigner(0),wallet=await signer.getAddress(),block=await p.getBlockNumber();
const price=725.8; // indicative valuation ONLY, profit proof remains BNB/WBNB delta
console.log('FORK_BLOCK',block,'WALLET',wallet);
const vaults=[{id:'pancake-cow-bsc-eth-usdt-vault',strategy:'0xdC4C4bD3dbdb8e49E41D0F427137040860e5feae'},{id:'pancake-cow-bsc-usdt-wbnb-vault',strategy:'0x975c681464B608538080D71838A4F44290d6746e'}];
const ids=['pancake-cow-bsc-eth-usdt-vault','pancake-cow-bsc-usdt-wbnb-vault'];
const rows=[];
for(const id of ids){
const v=vaults.find(x=>x.id===id);if(!v)continue;const strategy=v.strategy;
console.log('START',id);const snap=await p.send('evm_snapshot',[]);const oldBnb=await nativeBalance(wallet),oldWbnb=await ercBalance(wallet);
let row={id,strategy,chainId:56,forkBlock:block,gasPriceGwei:0.05};
try{
console.log('BEFORE_REWARD',id);const quotedReward=await getReward(strategy); console.log('REWARD',id,ethers.formatEther(quotedReward));
row.quotedRewardWBNB=ethers.formatEther(quotedReward);
const data=iface.encodeFunctionData('harvest(address)',[wallet]);
console.log('SENDING_FORK',id);const tx=await signer.sendTransaction({to:strategy,data,gasLimit:9000000,gasPrice:ethers.parseUnits('0.05','gwei')});
console.log('TX_PENDING_FORK',tx.hash);const receipt=await tx.wait();console.log('TX_MINED_FORK',receipt.status,receipt.gasUsed.toString());
const newBnb=await nativeBalance(wallet),newWbnb=await ercBalance(wallet);
const fee=receipt.gasUsed*receipt.gasPrice;
const nativeDelta=newBnb-oldBnb,tokenDelta=newWbnb-oldWbnb;
row={...row,atomicExecutionSucceeded:receipt.status===1,transactionHashFork:receipt.hash,
 gasUsed:receipt.gasUsed.toString(),feeBNB:ethers.formatEther(fee),
 nativeDeltaBNB:ethers.formatEther(nativeDelta),walletCreditWBNB:ethers.formatEther(tokenDelta),
 netAfterGasBNB:ethers.formatEther(nativeDelta+tokenDelta),bnbUsdQuote:price,
 netAfterGasUsd:price!==null?Number(ethers.formatEther(nativeDelta+tokenDelta))*price:null,
 notes:'FORK ONLY; net is actual WBNB plus native BNB wallet delta after gas. No real transaction.'};
}catch(e){row={...row,atomicExecutionSucceeded:false,error:String(e.shortMessage||e.message).slice(0,200)}}
rows.push(row);await p.send('evm_revert',[snap]);
}
const result={timestamp:new Date().toISOString(),type:'FORK_BEEFY_HARVEST',forkBlock:block,chainId:56,gasPaidInSimulationOnly:true,realizedUSD:0,
 wallet:'GANACHE_EPHEMERAL_EOA',rpc:'local fork backed by Blast BSC',quotedBNBUSDT:price,
 examples:rows};
fs.writeFileSync(require('path').join(__dirname,'beefy-fork-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({block,price,rows},null,2));
})().catch(e=>{console.log('FATAL',(e.shortMessage||e.message).slice(0,400));process.exitCode=1;});
