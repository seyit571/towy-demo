const {ethers}=require('ethers'), solc=require('solc'),fs=require('fs');
const path=require('path');
const rpc='http://127.0.0.1:8555';
const provider=new ethers.JsonRpcProvider(rpc,56,{staticNetwork:true});
const flashPair='0x3c5c8b6C641a6D9973598432B7554A1899768A55';
const tradePair='0xB22Bc4DB1DCd0B45680b4D831F8C06CFf50Ee4D6';
const BSW='0x965f527d9159dce6288a2219db51fc6eef120dd1';
const BUSD='0xe9e7cea3dedca5984780bafc599bd69add087d56';
const tokenAbi=['function balanceOf(address) view returns(uint256)'];
const read=(contract,name,...params)=>contract[name](...params);
async function main(){
 const sourceBlock=128003893;
 const forkBlock=await provider.getBlockNumber();
 const wallet=await provider.getSigner(0),walletAddress=await wallet.getAddress();
 const quoterIface=new ethers.Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
 const qAddress='0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
 const wbnb='0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',usdt='0x55d398326f99059fF775485246999027B3197955';
 const quote=await provider.call({to:qAddress,data:quoterIface.encodeFunctionData('quoteExactInputSingle',[[wbnb,usdt,ethers.parseEther('1'),500,0]])});
 const bnbUSDT=Number(ethers.formatEther(quoterIface.decodeFunctionResult('quoteExactInputSingle',quote)[0]));
 
 const source=fs.readFileSync(path.join(__dirname,'OmegaForkFlash.sol'),'utf8');
 const input={language:'Solidity',sources:{'OmegaForkFlash.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:"shanghai",outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
 const compiled=JSON.parse(solc.compile(JSON.stringify(input)));
 if(compiled.errors?.some(x=>x.severity==='error'))throw Error(JSON.stringify(compiled.errors));
 const output=compiled.contracts['OmegaForkFlash.sol'].OmegaForkFlash;
 const f=new ethers.ContractFactory(output.abi,'0x'+output.evm.bytecode.object,wallet);
 const contract=await f.deploy({gasLimit:5000000});const deployed=await contract.waitForDeployment();
 const deployReceipt=await contract.deploymentTransaction().wait();
 console.log('FORK_FLASH_DEPLOYED',await contract.getAddress(),'GAS',deployReceipt.gasUsed.toString(),'BLOCK',await provider.getBlockNumber());
 const walletStart=await new ethers.Contract(BSW,tokenAbi,provider).balanceOf(walletAddress);
 const busdRead=new ethers.Contract(BUSD,tokenAbi,provider);
 const cases=[0.001,0.005,0.01,0.02,0.03,0.05,0.1,0.2,0.5].map(x=>({borrow:x}));
 const attempts=[];
 for(const x of cases) {
  const borrow=ethers.parseEther(String(x.borrow));
  // isolate every test via evm_snapshot/revert; no duplication of same market state.
  const snapshot=await provider.send('evm_snapshot',[]);
  
  let report={borrowBusd:x.borrow,flashFunding:true,forkOnly:true,mode:'FORK_SIM',blockNumber:Number(await provider.getBlockNumber())};
  try{
   const tx=await contract.run(flashPair,tradePair,BUSD,BSW,borrow,1n,{gasLimit:1500000,gasPrice:ethers.parseUnits('0.05','gwei')});
   const rc=await tx.wait();

   const out=await new ethers.Contract(BSW,tokenAbi,provider).balanceOf(walletAddress);
   const gain=out-walletStart,actualGas=rc.gasUsed*rc.gasPrice;
   report={...report,success:rc.status===1,profitBSW:Number(ethers.formatEther(gain)),gasBNB:Number(ethers.formatEther(actualGas)),gasUnits:rc.gasUsed.toString(),txHash:rc.hash,atomic:true,
    gasCostUSDIllustrative:Number(ethers.formatEther(actualGas))*bnbUSDT,
    profitUSDFromBisPool:Number(ethers.formatEther(gain))*12.796700639919/32995.513636489,
   };
   report.netUSDIllustrative=report.profitUSDFromBisPool-report.gasCostUSDIllustrative;
  } catch(e) {
   report.success=false;report.atomic=false;report.error=(e.shortMessage||e.message).slice(0,170);report.profitBSW=0;
   const failedReceipt=e.receipt||null;
   const feePaid=failedReceipt?(failedReceipt.gasUsed*(failedReceipt.gasPrice||0n)):0n;
   report.gasUnits=failedReceipt?failedReceipt.gasUsed.toString():null;
   report.gasBNB=Number(ethers.formatEther(feePaid));
   report.gasCostUSDIllustrative=report.gasBNB*bnbUSDT;
   report.profitUSDFromBisPool=0;
   report.netUSDIllustrative=-report.gasCostUSDIllustrative;
  }
  attempts.push(report);await provider.send('evm_revert',[snapshot]);
 }
 console.log('SIM_REPORT',JSON.stringify({network:'BNB',forkBlock,contract:await contract.getAddress(),walletType:'EPHEMERAL_TEST_WALLET',bnbUSDPriceFromOnchainQuote:bnbUSDT,attempts},null,2));
 fs.writeFileSync(path.join(__dirname,'forkflash-results.json'),JSON.stringify({network:'BNB',sourceBlock,forkBlock,source:'Ganache local fork',contract:await contract.getAddress(),walletType:'EPHEMERAL_TEST_WALLET',bnbUSDPriceFromOnchainQuote:bnbUSDT,allProfitEstimatesIndicative:true,notes:'Wallet is a generated FORK TEST ACCOUNT; receipt hashes are NOT mainnet transaction hashes. BSW USD proxy is Biswap spot reserve ratio; additional conversion gas/slippage would reduce net.',attempts},null,2));
}
main().catch(e=>{console.error('FATAL',e.shortMessage||e.message,'RPC',JSON.stringify(e.info||e.error||null).slice(0,1700));process.exitCode=1});
