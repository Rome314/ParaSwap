// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWA7A5} from "./interfaces/IA7A5.sol";

// ── Errors ────────────────────────────────────────────────────────────────────

error ParaSwap__ZeroAmountIn();
error ParaSwap__ZeroRecipient();
error ParaSwap__Expired();
error ParaSwap__InsufficientAllowance(address token, uint256 have, uint256 need);
error ParaSwap__InsufficientOutput(uint256 actual, uint256 minimum);
error ParaSwap__InvalidRoute(uint8 route);
error ParaSwap__ZeroAddress();

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
    function V3_QUOTER() external view returns (address);

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        address recipient
    ) external returns (uint256 amountOut);

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

    function quoteWA7A5PerUSDT(uint256 amountIn, SIDE side) external returns (uint256 amountOut);

    function getA7A5EffectiveOutput(uint256 amountIn) external view returns (uint256 effectiveOut);
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

/// @title  ParaSwap
/// @notice Multi-route DEX aggregator for A7A5/wA7A5 swaps.
///         Routes USDT↔A7A5 and USDT↔wA7A5 through PoolsFacade; all other
///         ERC-20 pairs through Uniswap V3 single-hop, with automatic two-hop
///         bridging via USDT when one leg involves A7A5 or wA7A5.
/// @dev    Routing uses a 2-bit dispatch on (tokenIn, tokenOut):
///           00 → plain V3 single-hop
///           01 → facade buy (optional V3 tokenIn→USDT first)
///           10 → facade sell (optional V3 USDT→tokenOut after)
///           11 → direct A7A5↔wA7A5 wrap/unwrap
///         A7A5 is fee-on-transfer (FOT); all execution paths use balance-delta
///         measurements to account for the tax on each hop.
contract ParaSwap is ReentrancyGuard, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    IPoolsFacade public immutable FACADE;
    IQuoterV2 public immutable QUOTER;
    address public immutable A7A5_TOKEN;
    address public immutable WA7A5_TOKEN;
    address public immutable USDT_TOKEN;
    ISwapRouter02 public immutable V3_ROUTER;

    /// @param _facade   Address of the deployed PoolsFacade contract.
    /// @param _v3Router Address of the Uniswap V3 SwapRouter02.
    /// @param owner_    Initial contract owner (receives pause/unpause rights).
    constructor(address _facade, address _v3Router, address owner_) Ownable(owner_) {
        if (_facade == address(0) || _v3Router == address(0)) revert ParaSwap__ZeroAddress();

        IPoolsFacade facade = IPoolsFacade(_facade);
        address quoter = facade.V3_QUOTER();
        address a7a5 = facade.A7A5();
        address wa7a5 = facade.WA7A5();
        address usdt = facade.USDT();
        if (
            quoter == address(0) || a7a5 == address(0) || wa7a5 == address(0) || usdt == address(0)
        ) {
            revert ParaSwap__ZeroAddress();
        }

        FACADE = facade;
        QUOTER = IQuoterV2(quoter);
        A7A5_TOKEN = a7a5;
        WA7A5_TOKEN = wa7a5;
        USDT_TOKEN = usdt;
        V3_ROUTER = ISwapRouter02(_v3Router);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Pause all swaps. Only callable by the owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause swaps. Only callable by the owner.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ── Public: swap ──────────────────────────────────────────────────────────

    /// @notice Swap `tokenIn` for `tokenOut`. Output is sent to the caller.
    ///         See the overload below for a custom recipient.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee,
        uint256 deadline
    ) external returns (uint256) {
        return swap(tokenIn, tokenOut, amountIn, amountOutMin, fee, deadline, msg.sender);
    }

    /// @notice Swap `tokenIn` for `tokenOut`.
    ///         Direct USDT↔A7A5 and USDT↔wA7A5 routes through PoolsFacade.
    ///         Other ERC20↔A7A5/wA7A5 routes use a two-hop: V3 ERC20→USDT then
    ///         facade USDT→(w)A7A5, or facade (w)A7A5→USDT then V3 USDT→ERC20.
    ///         All other pairs execute a single-hop Uniswap V3 swap.
    /// @param tokenIn      Address of the token being sold.
    /// @param tokenOut     Address of the token being bought.
    /// @param amountIn     Exact amount of `tokenIn` to spend (caller must pre-approve).
    /// @param amountOutMin Minimum amount of `tokenOut` to receive; reverts if not met.
    /// @param fee          Uniswap V3 pool fee tier used for any V3 leg (e.g. 3000 = 0.3 %).
    ///                     Ignored when the route is facade-only (routes 01/10 with USDT, or 11).
    /// @param deadline     Unix timestamp after which the call reverts.
    /// @param recipient    Address that receives the output tokens.
    /// @return amountOut   Actual tokens received by `recipient` (post-FOT for A7A5 routes).
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee,
        uint256 deadline,
        address recipient
    ) public nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert ParaSwap__ZeroAmountIn();
        if (recipient == address(0)) revert ParaSwap__ZeroRecipient();
        // slither-disable-next-line timestamp
        if (block.timestamp > deadline) revert ParaSwap__Expired();

        uint256 allowance = IERC20(tokenIn).allowance(msg.sender, address(this));
        if (allowance < amountIn) {
            revert ParaSwap__InsufficientAllowance(tokenIn, allowance, amountIn);
        }

        // 2-bit route: bit1 = tokenIn is facade, bit0 = tokenOut is facade.
        // Every route runs its inner/terminal hops with a zero minimum; the single
        // recipient balance-delta check below is the authoritative slippage bound.
        uint8 route = _isFacadeToken(tokenIn, tokenOut);
        if (route == 0) {
            // 00 — plain V3 single-hop
            amountOut = _routeViaV3(tokenIn, tokenOut, amountIn, fee, recipient);
        } else if (route == 3) {
            // 11 — A7A5 ↔ wA7A5: direct wrap/unwrap, no USDT leg
            amountOut = _routeFacadeToFacade(tokenIn, amountIn, recipient);
        } else if (route <= 3) {
            if (tokenIn == USDT_TOKEN || tokenOut == USDT_TOKEN) {
                amountOut = _facadeSwap(tokenIn, tokenOut, amountIn, deadline, recipient);
            } else {
                amountOut = _routeTwoHop(tokenIn, tokenOut, amountIn, fee, deadline, recipient);
            }
        }

        // Authoritative slippage check: bounds the actual post-FOT amount the
        // recipient received across every route, so inner legs can safely use 0.
        if (amountOut < amountOutMin) revert ParaSwap__InsufficientOutput(amountOut, amountOutMin);

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut, recipient);
    }

    // ── Public: quote ─────────────────────────────────────────────────────────

    /// @notice Simulate a swap and return the expected output amount.
    ///         Not view — the V3 quoter is state-mutating (simulates the pool).
    ///         Must be called via callStatic / eth_call. Same routing logic as swap().
    /// @param tokenIn   Address of the token being sold.
    /// @param tokenOut  Address of the token being bought.
    /// @param amountIn  Input amount to simulate.
    /// @param fee       Uniswap V3 fee tier for any V3 leg. Ignored for facade-only routes.
    /// @return amountOut Simulated output amount (post-FOT for A7A5 routes).
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

    /// @dev Direct facade route. The inner FACADE.swap runs with a zero minimum;
    ///      slippage is enforced solely by the top-level recipient balance-delta
    ///      check in `swap`, which is FOT-correct for every output token.
    function _facadeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 deadline,
        address recipient
    ) private returns (uint256 amountOut) {
        IERC20 ITokenIn = IERC20(tokenIn);
        IERC20 ITokenOut = IERC20(tokenOut);

        uint256 balanceBefore = ITokenIn.balanceOf(address(this));
        ITokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 effectiveIn = ITokenIn.balanceOf(address(this)) - balanceBefore;
        ITokenIn.forceApprove(address(FACADE), effectiveIn);

        uint256 recipientBalanceBefore = ITokenOut.balanceOf(recipient);
        FACADE.swap(tokenIn, tokenOut, effectiveIn, 0, deadline, recipient);
        amountOut = ITokenOut.balanceOf(recipient) - recipientBalanceBefore;

        ITokenIn.forceApprove(address(FACADE), 0);
    }

    /// @dev Executes a single-hop Uniswap V3 exactInputSingle. Output goes
    ///      directly to `recipient`. The swap runs with amountOutMinimum = 0;
    ///      the top-level recipient balance-delta check in `swap` is the sole
    ///      authoritative slippage bound.
    function _routeViaV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        address recipient
    ) private returns (uint256 amountOut) {
        IERC20 ITokenIn = IERC20(tokenIn);
        ITokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        ITokenIn.forceApprove(address(V3_ROUTER), amountIn);

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

        ITokenIn.forceApprove(address(V3_ROUTER), 0);
    }

    // ── Two-hop swap helpers ──────────────────────────────────────────────────

    /// @dev Both hops (intermediate and terminal) deliberately use a zero minimum;
    ///      the top-level recipient balance-delta check in `swap` is the sole
    ///      authoritative slippage bound. An adverse fill on any leg is accepted
    ///      here only if the full route still clears that final minimum.
    function _routeTwoHop(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee,
        uint256 deadline,
        address recipient
    ) private returns (uint256 amountOut) {
        uint8 route = _isFacadeToken(tokenIn, tokenOut);
        if (route == 1) {
            // ERC20 → USDT via V3, then USDT → facadeToken via FACADE.
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            uint256 usdOut = _v3Swap(tokenIn, USDT_TOKEN, amountIn, 0, fee, address(this));
            IERC20(USDT_TOKEN).forceApprove(address(FACADE), usdOut);

            uint256 balanceBefore = IERC20(tokenOut).balanceOf(recipient);

            FACADE.swap(USDT_TOKEN, tokenOut, usdOut, 0, deadline, recipient);
            amountOut = IERC20(tokenOut).balanceOf(recipient) - balanceBefore;

            IERC20(USDT_TOKEN).forceApprove(address(FACADE), 0);
        } else if (route == 2) {
            // facadeToken → USDT via FACADE, then USDT → ERC20 via V3.

            uint256 facadeBalanceBefore = IERC20(tokenIn).balanceOf(address(this));
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            uint256 effectiveIn = IERC20(tokenIn).balanceOf(address(this)) - facadeBalanceBefore;

            IERC20(tokenIn).forceApprove(address(FACADE), effectiveIn);
            uint256 usdOut = FACADE.swap(
                tokenIn,
                USDT_TOKEN,
                effectiveIn,
                0,
                deadline,
                address(this)
            );
            IERC20(tokenIn).forceApprove(address(FACADE), 0);

            amountOut = _v3Swap(USDT_TOKEN, tokenOut, usdOut, 0, fee, recipient);
        } else {
            revert ParaSwap__InvalidRoute(route);
        }
    }

    /// @dev V3 exactInputSingle primitive. Assumes `amountIn` of `tokenIn` is
    ///      already held by this contract. All callers pass amountOutMin = 0;
    ///      the top-level recipient balance-delta check in `swap` is the sole
    ///      authoritative slippage bound.
    function _v3Swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
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
                amountOutMinimum: amountOutMin,
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
    function _isFacadeToken(address tokenIn, address tokenOut) private view returns (uint8 route) {
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

    /// @dev Routes A7A5 ↔ wA7A5 via direct wrap/unwrap — no USDT, no V3.
    ///      The A7A5 legs are measured by balance delta; wA7A5 is non-FOT.
    function _routeFacadeToFacade(
        address tokenIn,
        uint256 amountIn,
        address recipient
    ) private returns (uint256 amountOut) {
        if (tokenIn == A7A5_TOKEN) {
            uint256 before = IERC20(A7A5_TOKEN).balanceOf(address(this));
            IERC20(A7A5_TOKEN).safeTransferFrom(msg.sender, address(this), amountIn);
            uint256 effectiveIn = IERC20(A7A5_TOKEN).balanceOf(address(this)) - before;

            IERC20(A7A5_TOKEN).forceApprove(WA7A5_TOKEN, effectiveIn);
            amountOut = IWA7A5(WA7A5_TOKEN).wrap(effectiveIn);
            IERC20(A7A5_TOKEN).forceApprove(WA7A5_TOKEN, 0);

            IERC20(WA7A5_TOKEN).safeTransfer(recipient, amountOut);
        } else {
            IERC20(WA7A5_TOKEN).safeTransferFrom(msg.sender, address(this), amountIn);

            uint256 a7a5Before = IERC20(A7A5_TOKEN).balanceOf(address(this));
            IWA7A5(WA7A5_TOKEN).unwrap(amountIn);
            uint256 received = IERC20(A7A5_TOKEN).balanceOf(address(this)) - a7a5Before;

            uint256 recipientBefore = IERC20(A7A5_TOKEN).balanceOf(recipient);
            IERC20(A7A5_TOKEN).safeTransfer(recipient, received);
            amountOut = IERC20(A7A5_TOKEN).balanceOf(recipient) - recipientBefore;
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

    /// @dev Applies A7A5's fee-on-transfer `hops` times to model sequential
    ///      transfers. Identity when `basisPointsRate == 0`, so non-FOT quotes
    ///      are unaffected.
    function _applyFot(uint256 amount, uint8 hops) private view returns (uint256) {
        for (uint8 i = 0; i < hops; i++) {
            // slither-disable-next-line calls-loop
            amount = FACADE.getA7A5EffectiveOutput(amount);
        }
        return amount;
    }

    /// @dev Quotes A7A5 ↔ wA7A5 using the wrapper conversion rate after applying
    ///      the A7A5 transfer taxes that execution actually incurs. Wrap and unwrap
    ///      are asymmetric because the wA7A5 wrapper credits/pays on the balance it
    ///      actually receives:
    ///      - WRAP  (A7A5 → wA7A5): 1 taxed hop. Only the trader → ParaSwap transfer
    ///        is taxed; the ParaSwap → wrapper deposit leg is FOT-exempt, so the
    ///        wrapper mints shares on the full effective input.
    ///      - UNWRAP (wA7A5 → A7A5): 2 taxed hops. Both the wrapper → ParaSwap
    ///        withdraw and the ParaSwap → recipient payout are taxed.
    function _quoteFacadeToFacade(
        address tokenIn,
        uint256 amountIn
    ) private view returns (uint256) {
        IWA7A5 wa7a5 = IWA7A5(WA7A5_TOKEN);
        if (tokenIn == A7A5_TOKEN) {
            uint256 effectiveIn = _applyFot(amountIn, 1);
            return wa7a5.getwA7A5ByA7A5(effectiveIn);
        } else {
            uint256 a7a5Out = wa7a5.getA7A5BywA7A5(amountIn);
            return _applyFot(a7a5Out, 2);
        }
    }

    /// @dev Quote A7A5 ↔ USDT. ParaSwap applies only the FOT hops that occur
    ///      *outside* the facade; the facade nets out its own internal hops
    ///      (DIRECT = 1, MIXED = 2) inside getBestQuoteA7A5PerUSDT.
    ///      SELL: 1 external hop (trader → ParaSwap), applied before the facade.
    ///      BUY:  no external A7A5 hop because the facade pays the recipient directly.
    function _quoteViaFacadeA7A5(uint256 amountIn, SIDE side) private returns (uint256) {
        if (side == SIDE.SELL) {
            // 1 external FOT hit: trader → ParaSwap.
            uint256 effectiveIn = _applyFot(amountIn, 1);
            // slither-disable-next-line unused-return
            (uint256 out, ) = FACADE.getBestQuoteA7A5PerUSDT(effectiveIn, SIDE.SELL);
            return out;
        } else {
            // slither-disable-next-line unused-return
            (uint256 out, ) = FACADE.getBestQuoteA7A5PerUSDT(amountIn, SIDE.BUY);
            return out;
        }
    }

    /// @dev Quote wA7A5 ↔ USDT. Neither token is FOT.
    function _quoteViaFacadeWA7A5(uint256 amountIn, SIDE side) private returns (uint256) {
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
            // 1 external FOT hit: trader → ParaSwap. The facade nets out its
            // own internal hops inside getBestQuoteA7A5PerUSDT.
            uint256 effectiveIn = _applyFot(amountIn, 1);
            // slither-disable-next-line unused-return
            (usdtOut, ) = FACADE.getBestQuoteA7A5PerUSDT(effectiveIn, SIDE.SELL);
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
            // slither-disable-next-line unused-return
            (uint256 a7a5Out, ) = FACADE.getBestQuoteA7A5PerUSDT(usdtOut, SIDE.BUY);
            return a7a5Out;
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
        // slither-disable-next-line unused-return
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
