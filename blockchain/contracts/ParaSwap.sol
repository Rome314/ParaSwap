// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWA7A5} from "./interfaces/IA7A5.sol";

// ── Errors ────────────────────────────────────────────────────────────────────

error ParaSwap__ZeroAmountIn();
error ParaSwap__Expired();
error ParaSwap__InsufficientAllowance(
    address token,
    uint256 have,
    uint256 need
);
error ParaSwap__InsufficientOutput(uint256 actual, uint256 minimum);

// ── Events ────────────────────────────────────────────────────────────────────

event Swapped(
    address indexed tokenIn,
    address indexed tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    address indexed recipient
);

// ── Types ─────────────────────────────────────────────────────────────────────

// Must match PoolsFacade.sol's enum order exactly.
enum SIDE {
    BUY,
    SELL
}
enum STRATEGY {
    DIRECT,
    MIXED
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface IPoolsFacade {
    function A7A5() external view returns (address);
    function WA7A5() external view returns (address);
    function USDT() external view returns (address);
    function v3Quoter() external view returns (address);

    function swapA7A5AtBestQuote(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256);

    function swapWA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256);

    function getBestQuoteA7A5PerUSDT(
        uint256 amountIn,
        SIDE side
    ) external returns (uint256 amountOut, STRATEGY strategy);

    function quoteWA7A5PerUSDT(
        uint256 amountIn,
        SIDE side
    ) external returns (uint256 amountOut);

    function getA7A5EffectiveOutput(
        uint256 amountIn
    ) external view returns (uint256 effectiveOut);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }
    function quoteExactInputSingle(
        QuoteExactInputSingleParams memory params
    )
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

// ── Contract ──────────────────────────────────────────────────────────────────

contract ParaSwap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolsFacade public immutable FACADE;
    IQuoterV2 public immutable QUOTER;
    address public immutable A7A5_TOKEN;
    address public immutable WA7A5_TOKEN;
    address public immutable USDT_TOKEN;
    ISwapRouter02 public immutable V3_ROUTER;

    constructor(address _facade, address _v3Router) {
        IPoolsFacade facade = IPoolsFacade(_facade);
        FACADE = facade;
        QUOTER = IQuoterV2(facade.v3Quoter());
        A7A5_TOKEN = facade.A7A5();
        WA7A5_TOKEN = facade.WA7A5();
        USDT_TOKEN = facade.USDT();
        V3_ROUTER = ISwapRouter02(_v3Router);
    }

    // ── Public: swap ──────────────────────────────────────────────────────────

    /// @notice Swap `tokenIn` for `tokenOut`.
    ///         Direct USDT↔A7A5 and USDT↔wA7A5 routes through PoolsFacade.
    ///         Other ERC20↔A7A5/wA7A5 routes use a two-hop: V3 ERC20→USDT then
    ///         facade USDT→(w)A7A5, or facade (w)A7A5→USDT then V3 USDT→ERC20.
    ///         All other pairs execute a single-hop Uniswap V3 swap.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ParaSwap__ZeroAmountIn();
        if (block.timestamp > deadline) revert ParaSwap__Expired();

        uint256 allowance = IERC20(tokenIn).allowance(
            msg.sender,
            address(this)
        );
        if (allowance < amountIn) {
            revert ParaSwap__InsufficientAllowance(
                tokenIn,
                allowance,
                amountIn
            );
        }

        // 2-bit route: bit1 = tokenIn is facade, bit0 = tokenOut is facade.
        uint8 route = _isFacadeToken(tokenIn, tokenOut);
        if (route == 0) {
            // 00 — plain V3 single-hop
            amountOut = _routeViaV3(
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                fee
            );
        } else if (route == 3) {
            // 11 — A7A5 ↔ wA7A5: direct wrap/unwrap, no USDT leg
            amountOut = _routeFacadeToFacade(tokenIn, amountIn);
        } else if (route == 2) {
            // 10 — tokenIn is A7A5/wA7A5: direct facade sell (out == USDT) or two-hop sell
            amountOut =
                tokenOut == USDT_TOKEN
                    ? _routeViaFacade(tokenIn, tokenOut, amountIn, deadline)
                    : _routeTwoHopSell(
                        tokenIn,
                        tokenOut,
                        amountIn,
                        fee,
                        deadline
                    );
        } else {
            // 01 — tokenOut is A7A5/wA7A5: direct facade buy (in == USDT) or two-hop buy
            amountOut =
                tokenIn == USDT_TOKEN
                    ? _routeViaFacade(tokenIn, tokenOut, amountIn, deadline)
                    : _routeTwoHopBuy(
                        tokenIn,
                        tokenOut,
                        amountIn,
                        fee,
                        deadline
                    );
        }

        if (amountOut < amountOutMin)
            revert ParaSwap__InsufficientOutput(amountOut, amountOutMin);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, msg.sender);
    }

    // ── Public: quote ─────────────────────────────────────────────────────────

    /// @notice Simulate a swap and return the expected output amount.
    ///         Not view — the V3 quoter is state-mutating (simulates the pool).
    ///         Must be called via callStatic / eth_call. Same routing logic as swap().
    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) external returns (uint256 amountOut) {
        // Same 2-bit route dispatch as swap().
        uint8 route = _isFacadeToken(tokenIn, tokenOut);
        if (route == 0) {
            amountOut = _quoteV3(tokenIn, tokenOut, amountIn, fee);
        } else if (route == 3) {
            amountOut = _quoteFacadeToFacade(tokenIn, amountIn);
        } else if (route == 2) {
            amountOut =
                tokenOut == USDT_TOKEN
                    ? _quoteViaFacade(tokenIn, tokenOut, amountIn)
                    : _quoteTwoHopSell(tokenIn, tokenOut, amountIn, fee);
        } else {
            amountOut =
                tokenIn == USDT_TOKEN
                    ? _quoteViaFacade(tokenIn, tokenOut, amountIn)
                    : _quoteTwoHopBuy(tokenIn, tokenOut, amountIn, fee);
        }
    }

    // ── Internal routing ──────────────────────────────────────────────────────

    /// @dev Routes A7A5 ↔ USDT through PoolsFacade.swapA7A5AtBestQuote.
    ///      Handles A7A5 fee-on-transfer via balance-deltas on both legs.
    function _routeViaFacadeA7A5(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 amountOut) {
        SIDE side = tokenIn == A7A5_TOKEN ? SIDE.SELL : SIDE.BUY;

        uint256 paraInBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 effectiveIn =
            IERC20(tokenIn).balanceOf(address(this)) - paraInBefore;

        IERC20(tokenIn).forceApprove(address(FACADE), effectiveIn);
        uint256 paraOutBefore = IERC20(tokenOut).balanceOf(address(this));
        FACADE.swapA7A5AtBestQuote(effectiveIn, side, 0, deadline);
        IERC20(tokenIn).forceApprove(address(FACADE), 0);

        uint256 receivedOut =
            IERC20(tokenOut).balanceOf(address(this)) - paraOutBefore;

        if (tokenOut == A7A5_TOKEN) {
            uint256 callerBefore = IERC20(A7A5_TOKEN).balanceOf(msg.sender);
            IERC20(A7A5_TOKEN).safeTransfer(msg.sender, receivedOut);
            amountOut = IERC20(A7A5_TOKEN).balanceOf(msg.sender) - callerBefore;
        } else {
            IERC20(tokenOut).safeTransfer(msg.sender, receivedOut);
            amountOut = receivedOut;
        }
    }

    /// @dev Routes wA7A5 ↔ USDT through PoolsFacade.swapWA7A5.
    ///      Neither wA7A5 nor USDT are FOT, so no balance-delta on input.
    function _routeViaFacadeWA7A5(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 amountOut) {
        SIDE side = tokenIn == WA7A5_TOKEN ? SIDE.SELL : SIDE.BUY;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(FACADE), amountIn);

        uint256 paraOutBefore = IERC20(tokenOut).balanceOf(address(this));
        FACADE.swapWA7A5(amountIn, side, 0, deadline);
        IERC20(tokenIn).forceApprove(address(FACADE), 0);

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - paraOutBefore;
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    /// @dev Executes a single-hop Uniswap V3 exactInputSingle.
    ///      Output goes directly to the caller via recipient=msg.sender.
    function _routeViaV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee
    ) private returns (uint256 amountOut) {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(V3_ROUTER), amountIn);

        amountOut = V3_ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(V3_ROUTER), 0);
    }

    // ── Two-hop swap helpers ──────────────────────────────────────────────────

    /// @dev Two-hop sell: facadeToken → USDT via facade, then USDT → tokenOut via V3.
    function _routeTwoHopSell(
        address facadeToken,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint256 deadline
    ) private returns (uint256) {
        uint256 usdtOut = _facadeSellToUsdt(facadeToken, amountIn, deadline);
        return _v3Swap(USDT_TOKEN, tokenOut, usdtOut, fee, msg.sender);
    }

    /// @dev Two-hop buy: tokenIn → USDT via V3, then USDT → facadeToken via facade.
    function _routeTwoHopBuy(
        address tokenIn,
        address facadeToken,
        uint256 amountIn,
        uint24 fee,
        uint256 deadline
    ) private returns (uint256) {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 usdtOut = _v3Swap(
            tokenIn,
            USDT_TOKEN,
            amountIn,
            fee,
            address(this)
        );
        return _facadeBuyFromUsdt(facadeToken, usdtOut, deadline);
    }

    /// @dev Pulls facadeToken from caller (balance-delta for FOT safety), swaps to USDT
    ///      via the appropriate facade method, and returns the USDT received.
    function _facadeSellToUsdt(
        address facadeToken,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256 usdtOut) {
        uint256 before = IERC20(facadeToken).balanceOf(address(this));
        IERC20(facadeToken).safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );
        uint256 effectiveIn =
            IERC20(facadeToken).balanceOf(address(this)) - before;

        IERC20(facadeToken).forceApprove(address(FACADE), effectiveIn);
        uint256 usdtBefore = IERC20(USDT_TOKEN).balanceOf(address(this));

        if (facadeToken == A7A5_TOKEN) {
            FACADE.swapA7A5AtBestQuote(effectiveIn, SIDE.SELL, 0, deadline);
        } else {
            FACADE.swapWA7A5(effectiveIn, SIDE.SELL, 0, deadline);
        }

        IERC20(facadeToken).forceApprove(address(FACADE), 0);
        usdtOut = IERC20(USDT_TOKEN).balanceOf(address(this)) - usdtBefore;
    }

    /// @dev Buys facadeToken with USDT via the appropriate facade method,
    ///      forwards the output to the caller, and returns the amount received.
    ///      Applies balance-delta for A7A5's second FOT hit on the outbound transfer.
    function _facadeBuyFromUsdt(
        address facadeToken,
        uint256 usdtAmount,
        uint256 deadline
    ) private returns (uint256 amountOut) {
        IERC20(USDT_TOKEN).forceApprove(address(FACADE), usdtAmount);
        uint256 facadeTokenBefore = IERC20(facadeToken).balanceOf(
            address(this)
        );

        if (facadeToken == A7A5_TOKEN) {
            FACADE.swapA7A5AtBestQuote(usdtAmount, SIDE.BUY, 0, deadline);
        } else {
            FACADE.swapWA7A5(usdtAmount, SIDE.BUY, 0, deadline);
        }

        IERC20(USDT_TOKEN).forceApprove(address(FACADE), 0);
        uint256 received =
            IERC20(facadeToken).balanceOf(address(this)) - facadeTokenBefore;

        if (facadeToken == A7A5_TOKEN) {
            uint256 callerBefore = IERC20(A7A5_TOKEN).balanceOf(msg.sender);
            IERC20(A7A5_TOKEN).safeTransfer(msg.sender, received);
            amountOut = IERC20(A7A5_TOKEN).balanceOf(msg.sender) - callerBefore;
        } else {
            IERC20(facadeToken).safeTransfer(msg.sender, received);
            amountOut = received;
        }
    }

    /// @dev V3 exactInputSingle primitive. Assumes `amountIn` of `tokenIn` is
    ///      already held by this contract. Uses amountOutMinimum=0; callers
    ///      enforce slippage on the final output.
    function _v3Swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        address recipient
    ) private returns (uint256 amountOut) {
        IERC20(tokenIn).forceApprove(address(V3_ROUTER), amountIn);
        amountOut = V3_ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(tokenIn).forceApprove(address(V3_ROUTER), 0);
    }

    // ── Quote helpers ─────────────────────────────────────────────────────────

    /// @dev Returns a 2-bit route index for the pair (tokenIn, tokenOut):
    ///        bit1 = tokenIn  is A7A5 or wA7A5
    ///        bit0 = tokenOut is A7A5 or wA7A5
    ///      0 (00) → neither  — plain V3 single-hop
    ///      1 (01) → out only — optional V3 to USDT, then facade buy
    ///      2 (10) → in only  — facade sell, then optional V3 to tokenOut
    ///      3 (11) → both     — direct wrap/unwrap (A7A5 ↔ wA7A5), no V3 or USDT leg
    function _isFacadeToken(
        address tokenIn,
        address tokenOut
    ) private view returns (uint8 route) {
        address a = A7A5_TOKEN;
        address w = WA7A5_TOKEN;
        assembly {
            // Each eq() returns 0 or 1; or() combines into a single bit per side.
            // inBit occupies bit1, outBit occupies bit0 of the 2-bit result.
            let inBit := or(eq(tokenIn, a), eq(tokenIn, w))
            let outBit := or(eq(tokenOut, a), eq(tokenOut, w))
            route := or(shl(1, inBit), outBit)
        }
    }

    /// @dev Dispatches direct facade swaps: USDT ↔ A7A5 or USDT ↔ wA7A5.
    ///      The facade token is whichever of tokenIn/tokenOut is not USDT.
    function _routeViaFacade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 deadline
    ) private returns (uint256) {
        address facadeToken = tokenIn == USDT_TOKEN ? tokenOut : tokenIn;
        return
            facadeToken == A7A5_TOKEN
                ? _routeViaFacadeA7A5(tokenIn, tokenOut, amountIn, deadline)
                : _routeViaFacadeWA7A5(tokenIn, tokenOut, amountIn, deadline);
    }

    /// @dev Routes A7A5 ↔ wA7A5 via direct wrap/unwrap — no USDT, no V3.
    ///      wrap  path: pull A7A5 (balance-delta, FOT hit 1), wrap (FOT hit 2), send wA7A5.
    ///      unwrap path: pull wA7A5, unwrap (FOT hit 1 inside transfer), send A7A5 (FOT hit 2).
    function _routeFacadeToFacade(
        address tokenIn,
        uint256 amountIn
    ) private returns (uint256 amountOut) {
        if (tokenIn == A7A5_TOKEN) {
            uint256 before = IERC20(A7A5_TOKEN).balanceOf(address(this));
            IERC20(A7A5_TOKEN).safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );
            uint256 effectiveIn =
                IERC20(A7A5_TOKEN).balanceOf(address(this)) - before;

            IERC20(A7A5_TOKEN).forceApprove(WA7A5_TOKEN, effectiveIn);
            amountOut = IWA7A5(WA7A5_TOKEN).wrap(effectiveIn);
            IERC20(A7A5_TOKEN).forceApprove(WA7A5_TOKEN, 0);

            IERC20(WA7A5_TOKEN).safeTransfer(msg.sender, amountOut);
        } else {
            IERC20(WA7A5_TOKEN).safeTransferFrom(
                msg.sender,
                address(this),
                amountIn
            );

            uint256 a7a5Before = IERC20(A7A5_TOKEN).balanceOf(address(this));
            IWA7A5(WA7A5_TOKEN).unwrap(amountIn);
            uint256 received =
                IERC20(A7A5_TOKEN).balanceOf(address(this)) - a7a5Before;

            uint256 callerBefore = IERC20(A7A5_TOKEN).balanceOf(msg.sender);
            IERC20(A7A5_TOKEN).safeTransfer(msg.sender, received);
            amountOut = IERC20(A7A5_TOKEN).balanceOf(msg.sender) - callerBefore;
        }
    }

    /// @dev Dispatches direct facade quotes: USDT ↔ A7A5 or USDT ↔ wA7A5.
    function _quoteViaFacade(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256) {
        address facadeToken = tokenIn == USDT_TOKEN ? tokenOut : tokenIn;
        SIDE side = tokenIn == USDT_TOKEN ? SIDE.BUY : SIDE.SELL;
        return
            facadeToken == A7A5_TOKEN
                ? _quoteViaFacadeA7A5(amountIn, side)
                : _quoteViaFacadeWA7A5(amountIn, side);
    }

    /// @dev Quotes A7A5 ↔ wA7A5 via wrap/unwrap conversion rates plus FOT deductions.
    ///      wrap  path (A7A5→wA7A5): two FOT hits before wrap, then getwA7A5ByA7A5.
    ///      unwrap path (wA7A5→A7A5): getA7A5BywA7A5, then two FOT hits after unwrap.
    function _quoteFacadeToFacade(
        address tokenIn,
        uint256 amountIn
    ) private view returns (uint256) {
        IWA7A5 wa7a5 = IWA7A5(WA7A5_TOKEN);
        if (tokenIn == A7A5_TOKEN) {
            uint256 effectiveIn = FACADE.getA7A5EffectiveOutput(amountIn);
            return wa7a5.getwA7A5ByA7A5(effectiveIn);
        } else {
            uint256 a7a5Out = wa7a5.getA7A5BywA7A5(amountIn);
            // wA7A5→A7A5: two FOT hits — unwrap transfer to ParaSwap (1), ParaSwap→user (2)
            return FACADE.getA7A5EffectiveOutput(FACADE.getA7A5EffectiveOutput(a7a5Out));
        }
    }

    /// @dev Quote A7A5 ↔ USDT. Accounts for two FOT hits on A7A5 legs:
    ///      SELL: user→ParaSwap (hit 1), ParaSwap→pair (hit 2, inside facade quote).
    ///      BUY:  pair→ParaSwap (hit 1, inside facade quote), ParaSwap→user (hit 2).
    function _quoteViaFacadeA7A5(
        uint256 amountIn,
        SIDE side
    ) private returns (uint256) {
        if (side == SIDE.SELL) {
            // Two FOT hits: trader→ParaSwap, then ParaSwap→pair.
            uint256 effectiveIn = FACADE.getA7A5EffectiveOutput(
                FACADE.getA7A5EffectiveOutput(amountIn)
            );
            (uint256 out, ) = FACADE.getBestQuoteA7A5PerUSDT(
                effectiveIn,
                SIDE.SELL
            );
            return out;
        } else {
            (uint256 out, STRATEGY strategy) = FACADE.getBestQuoteA7A5PerUSDT(
                amountIn,
                SIDE.BUY
            );
            if (strategy == STRATEGY.MIXED) {
                // MIXED: 0-FOT basis from getA7A5BywA7A5; apply all 3 hits
                // (wrapper→facade, facade→ParaSwap, ParaSwap→user)
                return FACADE.getA7A5EffectiveOutput(
                    FACADE.getA7A5EffectiveOutput(
                        FACADE.getA7A5EffectiveOutput(out)
                    )
                );
            } else {
                // DIRECT: quoteA7A5PerUSDT already applied 1 FOT (pair→ParaSwap);
                // apply 1 more for ParaSwap→user
                return FACADE.getA7A5EffectiveOutput(out);
            }
        }
    }

    /// @dev Quote wA7A5 ↔ USDT. Neither token is FOT.
    function _quoteViaFacadeWA7A5(
        uint256 amountIn,
        SIDE side
    ) private returns (uint256) {
        return FACADE.quoteWA7A5PerUSDT(amountIn, side);
    }

    /// @dev Quote two-hop sell: facadeToken → USDT (facade) → tokenOut (V3).
    function _quoteTwoHopSell(
        address facadeToken,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) private returns (uint256) {
        uint256 usdtOut;
        if (facadeToken == A7A5_TOKEN) {
            // Two FOT hits: trader→ParaSwap, then ParaSwap→pair.
            uint256 effectiveIn = FACADE.getA7A5EffectiveOutput(
                FACADE.getA7A5EffectiveOutput(amountIn)
            );
            (usdtOut, ) = FACADE.getBestQuoteA7A5PerUSDT(
                effectiveIn,
                SIDE.SELL
            );
        } else {
            usdtOut = FACADE.quoteWA7A5PerUSDT(amountIn, SIDE.SELL);
        }
        return _quoteV3(USDT_TOKEN, tokenOut, usdtOut, fee);
    }

    /// @dev Quote two-hop buy: tokenIn (V3) → USDT → facadeToken (facade).
    function _quoteTwoHopBuy(
        address tokenIn,
        address facadeToken,
        uint256 amountIn,
        uint24 fee
    ) private returns (uint256) {
        uint256 usdtOut = _quoteV3(tokenIn, USDT_TOKEN, amountIn, fee);
        if (facadeToken == A7A5_TOKEN) {
            (uint256 a7a5Out, STRATEGY strategy) = FACADE.getBestQuoteA7A5PerUSDT(
                usdtOut,
                SIDE.BUY
            );
            if (strategy == STRATEGY.MIXED) {
                // MIXED: 0-FOT basis; apply all 3 hits
                // (wrapper→facade, facade→ParaSwap, ParaSwap→user)
                return FACADE.getA7A5EffectiveOutput(
                    FACADE.getA7A5EffectiveOutput(
                        FACADE.getA7A5EffectiveOutput(a7a5Out)
                    )
                );
            } else {
                // DIRECT: 1 FOT already in quoteA7A5PerUSDT; apply 1 more for ParaSwap→user
                return FACADE.getA7A5EffectiveOutput(a7a5Out);
            }
        } else {
            return FACADE.quoteWA7A5PerUSDT(usdtOut, SIDE.BUY);
        }
    }

    /// @dev V3 quote primitive via QuoterV2.quoteExactInputSingle.
    function _quoteV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) private returns (uint256 amountOut) {
        (amountOut, , , ) = QUOTER.quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
