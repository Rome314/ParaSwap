// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintableToken {
    function mint(address to, uint256 amount) external;
}

contract MockSwapToken is ERC20 {
    uint256 public constant FEE_PRECISION = 10_000;

    uint8 private immutable _tokenDecimals;
    uint256 public basisPointsRate;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackOnTransferFrom;
    bool public callbackAttempted;
    bool public callbackSucceeded;
    bool private _inCallback;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFee(uint256 feeBps) external {
        require(feeBps < FEE_PRECISION, "fee too high");
        basisPointsRate = feeBps;
    }

    function setCallback(address target, bytes calldata data, bool enabled) external {
        callbackTarget = target;
        callbackData = data;
        callbackOnTransferFrom = enabled;
        callbackAttempted = false;
        callbackSucceeded = false;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (callbackOnTransferFrom && !_inCallback) {
            _inCallback = true;
            callbackAttempted = true;
            (callbackSucceeded, ) = callbackTarget.call(callbackData);
            _inCallback = false;
        }
        return super.transferFrom(from, to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        uint256 feeBps = basisPointsRate;
        if (from != address(0) && to != address(0) && feeBps != 0) {
            uint256 fee = (value * feeBps) / FEE_PRECISION;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

contract MockWrappedSwapToken is ERC20 {
    IERC20 public immutable A7A5;
    uint8 private immutable _tokenDecimals;

    constructor(address a7a5_, uint8 decimals_) ERC20("Wrapped A7A5", "wA7A5") {
        require(a7a5_ != address(0), "zero underlying");
        A7A5 = IERC20(a7a5_);
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Matches production wA7A5: mint/return the gross input amount, then
    ///      pull A7A5. Any FOT on the deposit hits wrapper reserves, not shares.
    function wrap(uint256 amount) external returns (uint256 shares) {
        shares = getwA7A5ByA7A5(amount);
        _mint(msg.sender, shares);
        A7A5.transferFrom(msg.sender, address(this), amount);
    }

    /// @dev Matches production wA7A5: burn shares, transfer gross A7A5, return
    ///      the pre-tax amount (recipient balance delta may be lower under FOT).
    function unwrap(uint256 shares) external returns (uint256 amountOut) {
        amountOut = getA7A5BywA7A5(shares);
        _burn(msg.sender, shares);
        A7A5.transfer(msg.sender, amountOut);
    }

    function getwA7A5ByA7A5(uint256 amount) public pure returns (uint256) {
        return amount;
    }

    function getA7A5BywA7A5(uint256 amount) public pure returns (uint256) {
        return amount;
    }
}

contract MockSecurityV2Pair {
    address public immutable token0;
    address public immutable token1;
    uint112 private _reserve0;
    uint112 private _reserve1;
    uint256 public lastAmount0Out;
    uint256 public lastAmount1Out;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setReserves(uint112 reserve0_, uint112 reserve1_) external {
        _reserve0 = reserve0_;
        _reserve1 = reserve1_;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        lastAmount0Out = amount0Out;
        lastAmount1Out = amount1Out;
        if (amount0Out != 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out != 0) IERC20(token1).transfer(to, amount1Out);
    }
}

contract MockSecurityV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    uint24 public expectedFee;
    uint256 public rate = 1e18;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackAttempted;
    bool public callbackSucceeded;

    function setExpectedFee(uint24 fee) external {
        expectedFee = fee;
    }

    function setRate(uint256 rate_) external {
        rate = rate_;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackAttempted = false;
        callbackSucceeded = false;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        require(params.fee == expectedFee, "wrong fee");
        if (callbackTarget != address(0)) {
            callbackAttempted = true;
            (callbackSucceeded, ) = callbackTarget.call(callbackData);
        }
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = (params.amountIn * rate) / 1e18;
        require(amountOut >= params.amountOutMinimum, "too little output");
        IMintableToken(params.tokenOut).mint(params.recipient, amountOut);
    }
}

contract MockSecurityQuoter {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    uint24 public expectedFee;
    uint256 public rate = 1e18;

    function setExpectedFee(uint24 fee) external {
        expectedFee = fee;
    }

    function setRate(uint256 rate_) external {
        rate = rate_;
    }

    function quoteExactInputSingle(
        QuoteExactInputSingleParams calldata params
    ) external view returns (uint256, uint160, uint32, uint256) {
        require(params.fee == expectedFee, "wrong fee");
        return ((params.amountIn * rate) / 1e18, 0, 0, 0);
    }
}

contract MockFacadeConfig {
    address public A7A5;
    address public WA7A5;
    address public USDT;
    address public V3_QUOTER;

    constructor(address a7a5_, address wa7a5_, address usdt_, address quoter_) {
        A7A5 = a7a5_;
        WA7A5 = wa7a5_;
        USDT = usdt_;
        V3_QUOTER = quoter_;
    }
}
