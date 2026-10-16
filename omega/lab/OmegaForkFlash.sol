// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IERC20 {
    function balanceOf(address a) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
interface IV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112,uint112,uint32);
    function swap(uint256 a0Out, uint256 a1Out, address to, bytes calldata data) external;
}
contract OmegaForkFlash {
    address public immutable owner;
    bool private running;
    event ForkCapture(address indexed token,uint256 flashBorrowed,uint256 profitToWallet);
    constructor() { owner=msg.sender; }
    function amountIn(uint256 out,uint256 rIn,uint256 rOut,uint256 feeBps) internal pure returns(uint256) {
        require(out>0 && out<rOut, "insufficient flash reserve");
        return (rIn*out*10000)/((rOut-out)*(10000-feeBps))+1;
    }
    function amountOut(uint256 input,uint256 rIn,uint256 rOut,uint256 feeBps) internal pure returns(uint256) {
        uint256 withFee = input*(10000-feeBps);
        return withFee*rOut/(rIn*10000+withFee);
    }
    function run(address flashPair,address tradePair,address borrowToken,address repayToken,uint256 borrowAmount,uint256 minProfit) external {
        require(msg.sender==owner && !running,"not authorized");
        running=true;
        address t0=IV2Pair(flashPair).token0();
        require(borrowToken==t0||borrowToken==IV2Pair(flashPair).token1(),"bad borrow token");
        IV2Pair(flashPair).swap(borrowToken==t0?borrowAmount:0,borrowToken==t0?0:borrowAmount,address(this),abi.encode(flashPair,tradePair,borrowToken,repayToken,borrowAmount));
        uint256 profits=IERC20(repayToken).balanceOf(address(this));
        require(profits>=minProfit && profits>0,"NOT_PROFITABLE");
        require(IERC20(repayToken).transfer(msg.sender,profits),"transfer profit failed");
        emit ForkCapture(repayToken,borrowAmount,profits);
        running=false;
    }
    function pancakeCall(address sender,uint256 amount0,uint256 amount1,bytes calldata data) external {
        (address flashPair,address tradePair,address borrowToken,address repayToken,uint256 requested)=abi.decode(data,(address,address,address,address,uint256));
        require(running && msg.sender==flashPair && sender==address(this),"invalid callback");
        require((amount0==requested||amount1==requested),"borrow mismatch");
        IV2Pair source=IV2Pair(flashPair);
        IV2Pair target=IV2Pair(tradePair);
        require(source.token0()==target.token0() && source.token1()==target.token1(),"pair tokens differ");
        require(repayToken!=borrowToken,"same token");
        (uint112 src0,uint112 src1,)=source.getReserves();
        uint256 reserveBorrow=source.token0()==borrowToken?src0:src1;
        uint256 reserveRepay=source.token0()==repayToken?src0:src1;
        uint256 amountToRepay=amountIn(requested,reserveRepay,reserveBorrow,25);
        (uint112 dst0,uint112 dst1,)=target.getReserves();
        uint256 rin=target.token0()==borrowToken?dst0:dst1;
        uint256 rout=target.token0()==repayToken?dst0:dst1;
        uint256 expectedRepayToken=amountOut(requested,rin,rout,20);
        require(expectedRepayToken>amountToRepay,"route not profitable before gas");
        require(IERC20(borrowToken).transfer(tradePair,requested),"borrow transfer failed");
        target.swap(target.token0()==repayToken?expectedRepayToken:0,target.token1()==repayToken?expectedRepayToken:0,address(this),new bytes(0));
        require(IERC20(repayToken).balanceOf(address(this))>=amountToRepay,"no repay liquidity");
        require(IERC20(repayToken).transfer(flashPair,amountToRepay),"repay transfer failed");
    }
}
