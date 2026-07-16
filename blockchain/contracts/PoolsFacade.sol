// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

// Solidity 0.8.x reverts on overflow/underflow natively — SafeMath is unnecessary.

import {IQuoterV2} from "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import {IUniswapV2Pair} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IA7A5, IWA7A5, IERC20} from "./interfaces/IA7A5.sol";

/// @dev Subset of Uniswap SwapRouter02 used by this contract (no deadline in params).
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
    ) external payable returns (uint256 amountOut);
}

enum SIDE {
    BUY,
    SELL
}

enum STRATEGY {
    DIRECT, // A7A5 <->  USDT
    MIXED // (A7A5 <-> WA7A5) <-> USDT
}

event A7A5Swapped(
    address indexed user,
    address indexed recipient,
    SIDE side,
    STRATEGY strategy,
    uint256 amountIn,
    uint256 amountOut
);

event WA7A5Swapped(
    address indexed user,
    address indexed recipient,
    SIDE side,
    uint256 amountIn,
    uint256 amountOut
);

error PoolsFacade__InvalidV2Pair();
error PoolsFacade__ZeroAmountIn();
error PoolsFacade__Expired();
error PoolsFacade__InsufficientOutput();
error PoolsFacade__ZeroOutput();
error PoolsFacade__EmptyReserves();
error PoolsFacade__InsufficientAllowance();
error PoolsFacade__TransferFailed();
error PoolsFacade__TransferFromFailed();
error PoolsFacade__ApproveFailed();
error PoolsFacade__ZeroRecipient();
error PoolsFacade__InvalidToken();
error PoolsFacade__ZeroAddress();

/// @title  PoolsFacade
/// @notice A7A5/USDT liquidity aggregator. Routes swaps through the Uniswap V2
///         direct pair (A7A5↔USDT) or the V3 mixed path (A7A5↔wA7A5 wrap/unwrap,
///         then wA7A5↔USDT via V3), choosing whichever gives the better price.
/// @dev    Bypasses UniswapV2Router02 for ~10 k gas savings; pulls tokens directly
///         into the pair and calls pair.swap(). FOT accounting uses balance-delta
///         measurements throughout; the analytic `getA7A5EffectiveOutput` is used
///         only for off-chain quoting.
contract PoolsFacade is ReentrancyGuard, Ownable2Step, Pausable {
    // ── Immutables: tokens ─────────────────────────────────────────────────────
    IWA7A5 public immutable WA7A5;
    IA7A5 public immutable A7A5;
    IERC20 public immutable USDT;

    // ── Immutables: V2 ────────────────────────────────────────────────────────
    IUniswapV2Pair public immutable V2_PAIR; // A7A5/USDT V2 pair
    bool public immutable V2_A7A5_IS_TOKEN0; // true when A7A5 == token0 in the V2 pair

    // ── Immutables: V3 ────────────────────────────────────────────────────────
    ISwapRouter02 public immutable V3_ROUTER; // SwapRouter02 (no deadline in params)
    IQuoterV2 public immutable V3_QUOTER;
    uint24 public immutable WA7A5_USDT_V3_FEE; // fee tier of the wA7A5/USDT V3 pool

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _wA7A5Token      wA7A5 wrapped token contract (non-FOT).
    /// @param _a7A5Token       A7A5 token contract (fee-on-transfer).
    /// @param _usdt            USDT token contract.
    /// @param _v2Pair          Uniswap V2 A7A5/USDT pair; reverts if tokens don't match.
    /// @param _v3Router        Uniswap V3 SwapRouter02.
    /// @param _v3Quoter        Uniswap V3 QuoterV2 (state-mutating off-chain quoter).
    /// @param _wa7a5UsdtV3Fee  Fee tier of the wA7A5/USDT V3 pool (e.g. 3000 = 0.3 %).
    /// @param owner_           Initial contract owner (receives pause/unpause rights).
    constructor(
        IWA7A5 _wA7A5Token,
        IA7A5 _a7A5Token,
        IERC20 _usdt,
        IUniswapV2Pair _v2Pair,
        ISwapRouter02 _v3Router,
        IQuoterV2 _v3Quoter,
        uint24 _wa7a5UsdtV3Fee,
        address owner_
    ) Ownable(owner_) {
        if (
            address(_wA7A5Token) == address(0) ||
            address(_a7A5Token) == address(0) ||
            address(_usdt) == address(0) ||
            address(_v2Pair) == address(0) ||
            address(_v3Router) == address(0) ||
            address(_v3Quoter) == address(0)
        ) {
            revert PoolsFacade__ZeroAddress();
        }
        if (!_validV2Pair(_v2Pair, address(_a7A5Token), address(_usdt)))
            revert PoolsFacade__InvalidV2Pair();

        WA7A5 = _wA7A5Token;
        A7A5 = _a7A5Token;
        USDT = _usdt;
        V2_PAIR = _v2Pair;
        V3_ROUTER = _v3Router;
        V3_QUOTER = _v3Quoter;
        WA7A5_USDT_V3_FEE = _wa7a5UsdtV3Fee;

        // Determine A7A5's slot after the immutables are written
        V2_A7A5_IS_TOKEN0 = (_v2Pair.token0() == address(_a7A5Token));
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

    // ── Swap: external entry points ───────────────────────────────────────────

    /// @notice Execute a swap between two tokens through the best available price across the V2 direct
    ///         and V3 mixed (via wA7A5) paths, decided at call time.
    ///         Output is sent to the caller. See the overload below for a custom recipient.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) public returns (uint256 amountOut) {
        return swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline, msg.sender);
    }

    /// @notice Execute a swap between two tokens through the best available price across the V2 direct
    ///         and V3 mixed (via wA7A5) paths, decided at call time.
    ///         Output is sent to the custom recipient.
    /// @param tokenIn      Token to swap from.
    /// @param tokenOut     Token to swap to.
    /// @param amountIn     Amount of tokens to swap.
    /// @param amountOutMin Minimum tokens the recipient must receive; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts.
    /// @param recipient    Address that receives the output tokens.
    /// @return amountOut   Actual tokens received by `recipient`.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        address recipient
    ) public returns (uint256 amountOut) {
        if (!_supportedToken(tokenIn) || !_supportedToken(tokenOut))
            revert PoolsFacade__InvalidToken();
        if (tokenIn == tokenOut) revert PoolsFacade__InvalidToken();

        SIDE side = tokenIn == address(USDT) ? SIDE.BUY : SIDE.SELL;
        if (tokenIn == address(A7A5) || tokenOut == address(A7A5)) {
            return swapA7A5AtBestQuote(amountIn, side, amountOutMin, deadline, recipient);
        }
        if (tokenIn == address(WA7A5) || tokenOut == address(WA7A5)) {
            return swapWA7A5(amountIn, side, amountOutMin, deadline, recipient);
        }
        revert PoolsFacade__InvalidToken();
    }

    /// @notice Execute a direct A7A5 ↔ USDT swap through the Uniswap V2 pair (A7A5 path).
    ///         Output is sent to the caller. See the overload below for a custom recipient.
    function swapA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256) {
        return swapA7A5(amountIn, side, amountOutMin, deadline, msg.sender);
    }

    /// @notice Execute a direct A7A5 ↔ USDT swap through the Uniswap V2 pair (A7A5 path).
    /// @dev    Bypasses UniswapV2Router02 entirely — tokens are pulled from the
    ///         caller into the pair and pair.swap() is called directly, saving
    ///         ~10 k gas vs UniswapV2Router02.  Output is paid directly to `recipient`.
    ///
    ///         **A7A5 fee-on-transfer (FOT) — two distinct effects**
    ///
    ///         SELL (A7A5 → USDT) — FOT on the *input* side:
    ///           The pair receives `amountIn − fee` instead of `amountIn`.
    ///           We measure the pair's actual balance delta after the transfer so the
    ///           constant-product formula is evaluated against the real effective input,
    ///           matching the pair's own K-invariant check.  USDT is not FOT, so
    ///           effectiveOut == actual USDT received by the recipient.
    ///
    ///         BUY (USDT → A7A5) — FOT on the *output* side:
    ///           The pair sends `effectiveOut` A7A5, but the recipient receives
    ///           `effectiveOut − fee` because the transfer from the pair triggers
    ///           A7A5's fee hook.  The actual receipt is measured via balance-delta;
    ///           the pre-computed quote is only used to size the pair.swap() call.
    ///
    /// @param amountIn     USDT amount (BUY) or gross A7A5 amount before FOT (SELL).
    /// @param side         BUY: USDT → A7A5.  SELL: A7A5 → USDT.
    /// @param amountOutMin Minimum tokens the recipient must receive; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts (MEV protection).
    /// @param recipient    Address that receives the output tokens.
    /// @return amountOut   Tokens actually received by `recipient` after the swap
    ///                     (net of FOT on the relevant leg).
    function swapA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline,
        address recipient
    ) public nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert PoolsFacade__ZeroAmountIn();
        if (recipient == address(0)) revert PoolsFacade__ZeroRecipient();
        // slither-disable-next-line timestamp
        if (block.timestamp > deadline) revert PoolsFacade__Expired();

        // BUY path pulls USDT; SELL path pulls A7A5.
        address tokenIn = side == SIDE.SELL ? address(A7A5) : address(USDT);
        _requireAllowance(tokenIn, msg.sender, amountIn);

        amountOut = _swapA7A5To(amountIn, side, recipient);

        if (amountOut < amountOutMin) revert PoolsFacade__InsufficientOutput();
        emit A7A5Swapped(msg.sender, recipient, side, STRATEGY.DIRECT, amountIn, amountOut);
    }

    /// @notice Execute a wA7A5 ↔ USDT swap through the Uniswap V3 pool (wA7A5 path, SwapRouter02).
    ///         Output is sent to the caller. See the overload below for a custom recipient.
    function swapWA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256) {
        return swapWA7A5(amountIn, side, amountOutMin, deadline, msg.sender);
    }

    /// @notice Execute a wA7A5 ↔ USDT swap through the Uniswap V3 pool (wA7A5 path, SwapRouter02).
    /// @dev    wA7A5 and USDT are both non-FOT at this boundary, so the V3 router's
    ///         return value is the exact output — no balance-delta bookkeeping needed.
    ///         The slippage guard (`amountOutMin`) is passed directly into the router,
    ///         which enforces it in the same call and reverts if not satisfied.
    ///         Approval pattern mirrors the sibling routers: approve the exact amount,
    ///         swap, reset to 0 (sidesteps USDT's "must zero before re-approve" quirk).
    ///
    /// @param amountIn     USDT amount (BUY) or wA7A5 amount (SELL).
    /// @param side         BUY: USDT → wA7A5.  SELL: wA7A5 → USDT.
    /// @param amountOutMin Minimum tokens the recipient must receive; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts (MEV protection).
    /// @param recipient    Address that receives the output tokens.
    /// @return amountOut   Tokens actually received by `recipient`.
    function swapWA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline,
        address recipient
    ) public nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert PoolsFacade__ZeroAmountIn();
        if (recipient == address(0)) revert PoolsFacade__ZeroRecipient();
        // slither-disable-next-line timestamp
        if (block.timestamp > deadline) revert PoolsFacade__Expired();

        address tokenIn = side == SIDE.BUY ? address(USDT) : address(WA7A5);

        _requireAllowance(tokenIn, msg.sender, amountIn);
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        amountOut = _swapWA7A5(amountIn, side, amountOutMin, recipient);
        emit WA7A5Swapped(msg.sender, recipient, side, amountIn, amountOut);
    }

    /// @notice Execute A7A5 ↔ USDT at the best available price across the V2 direct
    ///         and V3 mixed (via wA7A5) paths, decided at call time.
    ///         Output is sent to the caller. See the overload below for a custom recipient.
    function swapA7A5AtBestQuote(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256) {
        return swapA7A5AtBestQuote(amountIn, side, amountOutMin, deadline, msg.sender);
    }

    /// @notice Execute A7A5 ↔ USDT at the best available price across the V2 direct
    ///         and V3 mixed (via wA7A5) paths, decided at call time.
    /// @dev    Calls getBestQuoteA7A5PerUSDT to select the winning strategy, then
    ///         executes it in the same transaction.
    ///
    ///         BUY always delivers A7A5 to `recipient` regardless of strategy:
    ///           DIRECT → _v2Buy; MIXED → V3 USDT→wA7A5 (facade), unwrap, send A7A5.
    ///         SELL always delivers USDT to `recipient` regardless of strategy:
    ///           DIRECT → _v2Sell; MIXED → wrap A7A5→wA7A5 (facade), V3 wA7A5→USDT.
    ///
    ///         amountOut is the actual post-FOT amount received by `recipient`
    ///         (measured via balance delta for all paths).
    ///         The inner V3 sub-swap runs with amountOutMinimum = 0; the single
    ///         top-level check enforces the caller's slippage tolerance.
    ///
    /// @param amountIn     USDT (BUY) or A7A5 (SELL) gross input amount.
    /// @param side         BUY: USDT → A7A5.  SELL: A7A5 → USDT.
    /// @param amountOutMin Minimum actual tokens received; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts.
    /// @param recipient    Address that receives the output tokens.
    /// @return amountOut   Actual tokens received by `recipient` (post-FOT).
    function swapA7A5AtBestQuote(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline,
        address recipient
    ) public nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert PoolsFacade__ZeroAmountIn();
        if (recipient == address(0)) revert PoolsFacade__ZeroRecipient();
        // slither-disable-next-line timestamp
        if (block.timestamp > deadline) revert PoolsFacade__Expired();
        address tokenIn = side == SIDE.SELL ? address(A7A5) : address(USDT);
        _requireAllowance(tokenIn, msg.sender, amountIn);

        (, STRATEGY strategy) = getBestQuoteA7A5PerUSDT(amountIn, side);

        // slither-disable-next-line incorrect-equality
        if (strategy == STRATEGY.DIRECT) {
            amountOut = _swapA7A5To(amountIn, side, recipient);
        } else if (side == SIDE.BUY) {
            // USDT → wA7A5 via V3 (recipient = facade), then unwrap → A7A5 to recipient.
            // Two FOT hits: (1) WA7A5 → facade on unwrap, (2) facade → recipient on transfer.
            _safeTransferFrom(address(USDT), msg.sender, address(this), amountIn);
            uint256 wa7a5Out = _swapWA7A5(amountIn, SIDE.BUY, 0, address(this));
            amountOut = _unwrapWA7A5To(wa7a5Out, recipient);
        } else {
            // SELL MIXED: A7A5 from caller → wrap at facade → wA7A5 → V3 → USDT to recipient.
            // Two FOT hits: (1) caller → facade, (2) facade → WA7A5 inside wrap().
            uint256 facadeA7A5Before = A7A5.balanceOf(address(this));
            _safeTransferFrom(address(A7A5), msg.sender, address(this), amountIn);
            uint256 effectiveA7A5 = A7A5.balanceOf(address(this)) - facadeA7A5Before;

            uint256 wa7a5Amount = _wrapWA7A5(effectiveA7A5);
            amountOut = _swapWA7A5(wa7a5Amount, SIDE.SELL, 0, recipient);
        }

        if (amountOut < amountOutMin) revert PoolsFacade__InsufficientOutput();
        emit A7A5Swapped(msg.sender, recipient, side, strategy, amountIn, amountOut);
    }

    // ── Quotes ────────────────────────────────────────────────────────────────

    /// @notice Compare the direct V2 path (A7A5 ↔ USDT) against the mixed path
    ///         (A7A5 ↔ wA7A5 via wrap/unwrap, then wA7A5 ↔ USDT via V3) and return
    ///         the better quote together with the winning strategy.
    /// @dev    BUY  → amountIn is USDT  → output is A7A5
    ///         SELL → amountIn is A7A5  → output is USDT
    ///         Calls the V3 quoter internally; must be called via `eth_call` / `callStatic`.
    ///
    ///         FOT accounting (facade-internal hops only): the returned amount
    ///         nets out the A7A5 fee-on-transfer hops that occur *inside* the
    ///         facade for each strategy — DIRECT = 1 hop, MIXED = 2 hops — so
    ///         DIRECT and MIXED are compared on the same FOT basis. Callers
    ///         (e.g. ParaSwap) must additionally apply any hops that occur
    ///         *outside* the facade (caller ↔ facade transfers).
    /// @param amountIn  Token amount in (USDT for BUY, A7A5 for SELL).
    /// @param side      Direction of the trade.
    /// @return amountOut  Best output amount across both paths.
    /// @return strategy   Which path won: DIRECT or MIXED.
    function getBestQuoteA7A5PerUSDT(
        uint256 amountIn,
        SIDE side
    ) public returns (uint256 amountOut, STRATEGY strategy) {
        if (side == SIDE.BUY) {
            uint256 outA7A5Direct = quoteA7A5PerUSDT(amountIn, side);
            uint256 outWA7A5 = quoteWA7A5PerUSDT(amountIn, side);
            // MIXED BUY incurs 2 facade-internal A7A5 FOT hits: unwrap
            // (wrapper → facade) and facade → caller. Model both so the
            // DIRECT (1 hop) vs MIXED comparison uses the same FOT basis.
            uint256 outA7A5Mixed = getA7A5EffectiveOutput(
                getA7A5EffectiveOutput(WA7A5.getA7A5BywA7A5(outWA7A5))
            );

            if (outA7A5Direct >= outA7A5Mixed) {
                strategy = STRATEGY.DIRECT;
                amountOut = outA7A5Direct;
            } else {
                strategy = STRATEGY.MIXED;
                amountOut = outA7A5Mixed;
            }
        } else {
            uint256 outUsdtDirect = quoteA7A5PerUSDT(amountIn, side);

            // MIXED SELL incurs 2 facade-internal A7A5 FOT hits before the
            // wrap converts to wA7A5: caller → facade and facade → wrapper.
            // Apply both so the DIRECT (1 hop) vs MIXED comparison uses the
            // same FOT basis.
            uint256 inWA7A5 = WA7A5.getwA7A5ByA7A5(
                getA7A5EffectiveOutput(getA7A5EffectiveOutput(amountIn))
            );
            uint256 outUsdtMixed = quoteWA7A5PerUSDT(inWA7A5, side);

            if (outUsdtDirect >= outUsdtMixed) {
                strategy = STRATEGY.DIRECT;
                amountOut = outUsdtDirect;
            } else {
                strategy = STRATEGY.MIXED;
                amountOut = outUsdtMixed;
            }
        }
    }

    /// @notice Quote the output of an A7A5 ↔ USDT swap via the V2 direct pair.
    /// @dev    BUY  → amountIn is USDT  → output is A7A5
    ///         SELL → amountIn is A7A5  → output is USDT
    ///         Applies the standard 0.3 % V2 swap fee.
    /// @param amountIn Raw token amount (USDT for BUY, A7A5 for SELL).
    /// @param side     Direction of the hypothetical trade.
    /// @return amountOut  Simulated output amount for the given direction.
    function quoteA7A5PerUSDT(uint256 amountIn, SIDE side) public view returns (uint256 amountOut) {
        (uint112 rIn, uint112 rOut) = _getV2ReserveInReserveOut(side);

        if (side == SIDE.SELL) {
            amountIn = getA7A5EffectiveOutput(amountIn);
        }

        amountOut = _v2AmountOut(amountIn, rIn, rOut);

        if (side == SIDE.BUY) {
            amountOut = getA7A5EffectiveOutput(amountOut);
        }
    }

    /// @notice Quote WA7A5/USDT output via the V3 off-chain quoter.
    /// @dev    Must be called via `eth_call` / `callStatic` — the V3 quoter
    ///         is state-mutating by design (it simulates the swap).
    ///         BUY  → spend USDT,  receive WA7A5.
    ///         SELL → spend WA7A5, receive USDT.
    /// @param amountIn    Token amount in.
    /// @param side        BUY or SELL direction.
    /// @return amountOut  Simulated output amount.
    function quoteWA7A5PerUSDT(uint256 amountIn, SIDE side) public returns (uint256 amountOut) {
        address tokenIn = side == SIDE.BUY ? address(USDT) : address(WA7A5);
        address tokenOut = side == SIDE.BUY ? address(WA7A5) : address(USDT);

        (amountOut, , , ) = V3_QUOTER.quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: WA7A5_USDT_V3_FEE,
                sqrtPriceLimitX96: 0
            })
        );
    }

    // ── Allowance helpers ─────────────────────────────────────────────────────
    // Convenience view functions for callers (frontends, scripts) to check whether
    // they have approved enough of each input token to this facade before calling
    // a swap function.  The values returned by these functions are the exact thresholds
    // that the internal _requireAllowance guard enforces.

    /// @notice USDT allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapA7A5(BUY), swapWA7A5(BUY), or swapA7A5AtBestQuote(BUY).
    /// @param owner  Address to check.
    /// @return       Current USDT allowance for this facade.
    function allowanceUSDT(address owner) external view returns (uint256) {
        return USDT.allowance(owner, address(this));
    }

    /// @notice A7A5 allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapA7A5(SELL) or swapA7A5AtBestQuote(SELL).
    /// @param owner  Address to check.
    /// @return       Current A7A5 allowance for this facade.
    function allowanceA7A5(address owner) external view returns (uint256) {
        return A7A5.allowance(owner, address(this));
    }

    /// @notice wA7A5 allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapWA7A5(SELL).
    /// @param owner  Address to check.
    /// @return       Current wA7A5 allowance for this facade.
    function allowanceWA7A5(address owner) external view returns (uint256) {
        return WA7A5.allowance(owner, address(this));
    }

    /// @notice Net A7A5 amount received after the on-chain transfer tax is deducted.
    /// @dev    Used for off-chain quoting only — the execution paths use balance-delta
    ///         measurements instead of this analytic estimate.
    /// @param amountIn Gross A7A5 amount before the fee.
    /// @return effectiveOut Net A7A5 the recipient actually receives.
    function getA7A5EffectiveOutput(uint256 amountIn) public view returns (uint256 effectiveOut) {
        uint256 bps = A7A5.basisPointsRate();
        uint256 precision = A7A5.FEE_PRECISION();
        effectiveOut = (amountIn * (precision - bps)) / precision;
    }

    // ── Internals: wrap / unwrap ───────────────────────────────────────────────

    /// @dev Wraps `amountIn` A7A5 (already held by this contract) into wA7A5.
    ///      Approves the wrapper, calls wrap(), then resets the approval to 0.
    ///      Returns the wA7A5 amount minted to this contract.
    function _wrapWA7A5(uint256 amountIn) internal returns (uint256 amountOut) {
        _safeApprove(address(A7A5), address(WA7A5), amountIn);
        amountOut = WA7A5.wrap(amountIn);
        _safeApprove(address(A7A5), address(WA7A5), 0);
    }

    /// @dev Unwraps `amountIn` wA7A5 into A7A5 and transfers the net A7A5 to `to`.
    ///      A7A5's FOT is deducted on each transfer; returns the recipient's
    ///      balance-delta after forwarding (or this contract's unwrap delta for self).
    function _unwrapWA7A5To(uint256 amountIn, address to) internal returns (uint256 amountOut) {
        amountOut = _unwrapWA7A5(amountIn);
        if (to != address(this)) {
            uint256 recipientBalanceBefore = A7A5.balanceOf(to);
            _safeTransfer(address(A7A5), to, amountOut);
            amountOut = A7A5.balanceOf(to) - recipientBalanceBefore;
        }
    }

    /// @dev Unwraps `amountIn` wA7A5 into A7A5 held by this contract.
    ///      Uses balance-delta to account for A7A5's FOT deducted by the wrapper.
    ///      Returns the net A7A5 received.
    function _unwrapWA7A5(uint256 amountIn) internal returns (uint256 amountOut) {
        uint256 a7a5Before = A7A5.balanceOf(address(this));
        WA7A5.unwrap(amountIn);
        amountOut = A7A5.balanceOf(address(this)) - a7a5Before;
    }

    // ── Internals: V2 execution ───────────────────────────────────────────────

    /// @dev Executes an A7A5 ↔ USDT swap directly against the V2 pair.
    ///      Tokens are pulled from `msg.sender` (or already held) into the pair,
    ///      reserves are snapshotted before the transfer, and pair.swap() is called
    ///      with the output routed to `recipient`.
    ///
    ///      SELL: balance-delta is used to measure effective A7A5 input after FOT.
    ///      BUY:  balance-delta is used to measure the recipient's actual A7A5
    ///            receipt after the pair's FOT-charged output transfer.
    function _swapA7A5To(
        uint256 amountIn,
        SIDE side,
        address recipient
    ) internal returns (uint256 amountOut) {
        // BUY:  rIn == USDT reserve,  rOut == A7A5 reserve
        // SELL: rIn == A7A5 reserve,  rOut == USDT reserve
        (uint112 rIn, uint112 rOut) = _getV2ReserveInReserveOut(side);

        if (side == SIDE.SELL) {
            uint256 a7a5Before = A7A5.balanceOf(address(V2_PAIR));
            _safeTransferFrom(address(A7A5), msg.sender, address(V2_PAIR), amountIn);
            amountIn = A7A5.balanceOf(address(V2_PAIR)) - a7a5Before;
        } else {
            _safeTransferFrom(address(USDT), msg.sender, address(V2_PAIR), amountIn);
        }

        amountOut = _v2AmountOut(amountIn, rIn, rOut);
        if (amountOut == 0) revert PoolsFacade__ZeroOutput();
        (uint256 out0, uint256 out1) = _getV2Out0Out1(side, amountOut);

        if (side == SIDE.BUY) {
            uint256 recipientBalanceBefore = A7A5.balanceOf(recipient);
            V2_PAIR.swap(out0, out1, recipient, bytes(""));
            amountOut = A7A5.balanceOf(recipient) - recipientBalanceBefore;
        } else {
            V2_PAIR.swap(out0, out1, recipient, bytes(""));
        }
    }

    // ── Internals: V3 execution ───────────────────────────────────────────────

    /// @dev Executes a V3 exactInputSingle for the wA7A5/USDT pool.
    ///      Assumes `amountIn` of tokenIn is already held by this contract.
    ///      Approves the router, swaps, resets approval to 0.
    ///      Pass amountOutMin = 0 when the caller enforces slippage on the
    ///      final output instead (e.g. the MIXED paths in swapA7A5AtBestQuote).
    function _swapWA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        address recipient
    ) internal returns (uint256 amountOut) {
        address tokenIn = side == SIDE.BUY ? address(USDT) : address(WA7A5);
        address tokenOut = side == SIDE.BUY ? address(WA7A5) : address(USDT);

        _safeApprove(tokenIn, address(V3_ROUTER), amountIn);
        amountOut = V3_ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: WA7A5_USDT_V3_FEE,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );
        _safeApprove(tokenIn, address(V3_ROUTER), 0);
    }

    // ── Internals: V2 math & pair helpers ────────────────────────────────────

    /// @dev Unpacks `amountOut` into the (out0, out1) pair expected by IUniswapV2Pair.swap,
    ///      placing the output in the correct token slot based on `V2_A7A5_IS_TOKEN0` and side.
    function _getV2Out0Out1(
        SIDE side,
        uint256 amountOut
    ) internal view returns (uint256 out0, uint256 out1) {
        if (side == SIDE.BUY) {
            out0 = V2_A7A5_IS_TOKEN0 ? amountOut : 0;
            out1 = V2_A7A5_IS_TOKEN0 ? 0 : amountOut;
        } else {
            out0 = V2_A7A5_IS_TOKEN0 ? 0 : amountOut;
            out1 = V2_A7A5_IS_TOKEN0 ? amountOut : 0;
        }
    }

    /// @dev Standard Uniswap V2 getAmountOut formula with 0.3 % swap fee.
    function _v2AmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256) {
        if (reserveIn == 0 || reserveOut == 0) revert PoolsFacade__EmptyReserves();
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    /// @dev Returns (reserveIn, reserveOut) oriented for the given trade side.
    ///      BUY  → rIn = USDT reserve,  rOut = A7A5 reserve.
    ///      SELL → rIn = A7A5 reserve,  rOut = USDT reserve.
    function _getV2ReserveInReserveOut(
        SIDE side
    ) internal view returns (uint112 rIn, uint112 rOut) {
        // slither-disable-next-line unused-return
        (uint112 r0, uint112 r1, ) = V2_PAIR.getReserves();

        uint112 rA7A5 = V2_A7A5_IS_TOKEN0 ? r0 : r1;
        uint112 rUSDT = V2_A7A5_IS_TOKEN0 ? r1 : r0;

        if (side == SIDE.BUY) {
            rIn = rUSDT;
            rOut = rA7A5;
        } else {
            rIn = rA7A5;
            rOut = rUSDT;
        }
    }

    function _supportedToken(address token) internal view returns (bool) {
        return _isInternalToken(token) || token == address(USDT);
    }

    function _isInternalToken(address token) internal view returns (bool) {
        return token == address(A7A5) || token == address(WA7A5);
    }

    /// @dev Returns true when `_pair` holds exactly `_a7a5` and `_usdt` (in either slot order).
    function _validV2Pair(
        IUniswapV2Pair _pair,
        address _a7a5,
        address _usdt
    ) internal view returns (bool) {
        address t0 = _pair.token0();
        address t1 = _pair.token1();
        return (t0 == _a7a5 && t1 == _usdt) || (t1 == _a7a5 && t0 == _usdt);
    }

    // ── Internals: ERC-20 primitives ─────────────────────────────────────────

    /// @dev Reverts with a clear message when `owner` has not approved at least
    ///      `amount` of `token` to this contract.  Called before every
    ///      _safeTransferFrom so failures surface before any state is touched.
    function _requireAllowance(address token, address owner, uint256 amount) private view {
        if (IERC20(token).allowance(owner, address(this)) < amount)
            revert PoolsFacade__InsufficientAllowance();
    }

    /// @dev Calls token.transfer and reverts on failure or missing return value.
    ///      Handles non-standard ERC-20s that return nothing (e.g. early USDT).
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        // slither-disable-next-line incorrect-equality
        if (!ok || (data.length != 0 && !abi.decode(data, (bool))))
            revert PoolsFacade__TransferFailed();
    }

    /// @dev Calls token.transferFrom and reverts on failure or missing return value.
    ///      Handles non-standard ERC-20s that return nothing (e.g. early USDT).
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        // slither-disable-next-line incorrect-equality
        if (!ok || (data.length != 0 && !abi.decode(data, (bool))))
            revert PoolsFacade__TransferFromFailed();
    }

    /// @dev Calls token.approve and reverts on failure or missing return value.
    ///      Always reset to 0 after use to satisfy USDT's re-approve restriction.
    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        // slither-disable-next-line incorrect-equality
        if (!ok || (data.length != 0 && !abi.decode(data, (bool))))
            revert PoolsFacade__ApproveFailed();
    }
}
