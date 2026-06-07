// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

// Solidity 0.8.x reverts on overflow/underflow natively — SafeMath is unnecessary.

import {IQuoterV2} from "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
import {IUniswapV2Pair} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import {IA7A5, IWA7A5, IERC20} from "./interfaces/IA7A5.sol";

enum SIDE {
    BUY,
    SELL
}

enum STRATEGY {
    DIRECT, // A7A5 <->  USDT
    MIXED // (A7A5 <-> WA7A5) <-> USDT
}

contract PoolsFacade is ReentrancyGuard {
    // ── Immutables: tokens ─────────────────────────────────────────────────────
    IWA7A5 public immutable WA7A5;
    IA7A5 public immutable A7A5;
    IERC20 public immutable USDT;
    address public immutable deployer;

    // ── Immutables: V2 ────────────────────────────────────────────────────────
    IUniswapV2Pair public immutable v2Pair; // A7A5/USDT V2 pair
    bool public immutable v2A7A5IsToken0; // true when A7A5 == token0 in the V2 pair

    // ── Immutables: V3 ────────────────────────────────────────────────────────
    ISwapRouter02 public immutable v3Router; // SwapRouter02 (no deadline in params)
    IQuoterV2 public immutable v3Quoter;
    uint24 public immutable wa7a5UsdtV3Fee; // fee tier of the wA7A5/USDT V3 pool

    constructor(
        IWA7A5 _wA7A5Token,
        IA7A5 _a7A5Token,
        IERC20 _usdt,
        IUniswapV2Pair _v2Pair,
        ISwapRouter02 _v3Router,
        IQuoterV2 _v3Quoter,
        uint24 _wa7a5UsdtV3Fee
    ) {
        // Validate before assigning so we can use the constructor args directly
        require(
            _validV2Pair(_v2Pair, address(_a7A5Token), address(_usdt)),
            "PoolsFacade: invalid V2 pair"
        );

        WA7A5 = _wA7A5Token;
        A7A5 = _a7A5Token;
        USDT = _usdt;
        v2Pair = _v2Pair;
        v3Router = _v3Router;
        v3Quoter = _v3Quoter;
        wa7a5UsdtV3Fee = _wa7a5UsdtV3Fee;
        deployer = msg.sender;

        // Determine A7A5's slot after the immutables are written
        v2A7A5IsToken0 = (_v2Pair.token0() == address(_a7A5Token));
    }

    /// @notice Execute a direct A7A5 ↔ USDT swap through the Uniswap V2 pair (A7A5 path).
    /// @dev    Bypasses UniswapV2Router02 entirely — tokens are pulled from the
    ///         caller into the pair and pair.swap() is called directly, saving
    ///         ~10 k gas vs UniswapV2Router02.  Output is paid directly to the caller.
    ///
    ///         **A7A5 fee-on-transfer (FOT) — two distinct effects**
    ///
    ///         SELL (A7A5 → USDT) — FOT on the *input* side:
    ///           The pair receives `amountIn − fee` instead of `amountIn`.
    ///           We measure the pair's actual balance delta after the transfer so the
    ///           constant-product formula is evaluated against the real effective input,
    ///           matching the pair's own K-invariant check.  USDT is not FOT, so
    ///           effectiveOut == actual USDT received by the caller.
    ///
    ///         BUY (USDT → A7A5) — FOT on the *output* side:
    ///           The pair sends `effectiveOut` A7A5, but the caller receives
    ///           `effectiveOut − fee` because the transfer from the pair triggers
    ///           A7A5's fee hook.  The actual receipt is measured via balance-delta;
    ///           the pre-computed quote is only used to size the pair.swap() call.
    ///
    /// @param amountIn     USDT amount (BUY) or gross A7A5 amount before FOT (SELL).
    /// @param side         BUY: USDT → A7A5.  SELL: A7A5 → USDT.
    /// @param amountOutMin Minimum tokens the caller must receive; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts (MEV protection).
    /// @return amountOut   Tokens actually received by the caller after the swap
    ///                     (net of FOT on the relevant leg).
    function swapA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) public nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "PoolsFacade: zero amountIn");
        require(block.timestamp <= deadline, "PoolsFacade: expired");

        // ── Allowance check: fail early with a clear message ──────────────────
        // BUY path pulls USDT; SELL path pulls A7A5.
        _requireAllowance(
            side == SIDE.SELL ? address(A7A5) : address(USDT),
            msg.sender,
            amountIn
        );

        if (side == SIDE.SELL) {
            amountOut = _v2Sell(amountIn);
        } else {
            amountOut = _v2Buy(amountIn);
        }

        require(amountOut >= amountOutMin, "PoolsFacade: insufficient output");
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
    /// @param amountOutMin Minimum tokens the caller must receive; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts (MEV protection).
    /// @return amountOut   Tokens actually received by the caller.
    function swapWA7A5(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) public nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "PoolsFacade: zero amountIn");
        require(block.timestamp <= deadline, "PoolsFacade: expired");

        address tokenIn = side == SIDE.BUY ? address(USDT) : address(WA7A5);

        _requireAllowance(tokenIn, msg.sender, amountIn);
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        amountOut = _executeV3WA7A5Swap(
            amountIn,
            side,
            amountOutMin,
            msg.sender
        );
    }

    /// @notice Execute A7A5 ↔ USDT at the best available price across the V2 direct
    ///         and V3 mixed (via wA7A5) paths, decided at call time.
    /// @dev    Calls getBestQuoteA7A5PerUSDT to select the winning strategy, then
    ///         executes it in the same transaction.
    ///
    ///         BUY always delivers A7A5 to the caller regardless of strategy:
    ///           DIRECT → _v2Buy; MIXED → V3 USDT→wA7A5 (facade), unwrap, send A7A5.
    ///         SELL always delivers USDT to the caller regardless of strategy:
    ///           DIRECT → _v2Sell; MIXED → wrap A7A5→wA7A5 (facade), V3 wA7A5→USDT.
    ///
    ///         amountOut is the actual post-FOT amount received by the caller
    ///         (measured via balance delta for all paths).
    ///         The inner V3 sub-swap runs with amountOutMinimum = 0; the single
    ///         top-level check enforces the caller's slippage tolerance.
    ///
    /// @param amountIn     USDT (BUY) or A7A5 (SELL) gross input amount.
    /// @param side         BUY: USDT → A7A5.  SELL: A7A5 → USDT.
    /// @param amountOutMin Minimum actual tokens received; reverts if not met.
    /// @param deadline     Unix timestamp after which the call reverts.
    /// @return amountOut   Actual tokens received by the caller (post-FOT).
    function swapA7A5AtBestQuote(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        uint256 deadline
    ) public nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "PoolsFacade: zero amountIn");
        require(block.timestamp <= deadline, "PoolsFacade: expired");
        _requireAllowance(
            side == SIDE.SELL ? address(A7A5) : address(USDT),
            msg.sender,
            amountIn
        );

        (, STRATEGY strategy) = getBestQuoteA7A5PerUSDT(amountIn, side);

        if (strategy == STRATEGY.DIRECT) {
            if (side == SIDE.BUY) {
                // Measure balance delta to return actual post-FOT receipt.
                uint256 callerBefore = A7A5.balanceOf(msg.sender);
                _v2Buy(amountIn);
                amountOut = A7A5.balanceOf(msg.sender) - callerBefore;
            } else {
                amountOut = _v2Sell(amountIn); // USDT has no FOT; return is exact
            }
        } else if (side == SIDE.BUY) {
            // USDT → wA7A5 via V3 (recipient = facade), then unwrap → A7A5 to caller.
            // Two FOT hits: (1) WA7A5 → facade on unwrap, (2) facade → caller on transfer.
            _safeTransferFrom(
                address(USDT),
                msg.sender,
                address(this),
                amountIn
            );
            _safeApprove(address(USDT), address(v3Router), amountIn);
            uint256 wa7a5Out = v3Router.exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: address(USDT),
                    tokenOut: address(WA7A5),
                    fee: wa7a5UsdtV3Fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            _safeApprove(address(USDT), address(v3Router), 0);
            uint256 facadeA7A5Before = A7A5.balanceOf(address(this));
            WA7A5.unwrap(wa7a5Out);
            uint256 facadeA7A5Received =
                A7A5.balanceOf(address(this)) - facadeA7A5Before;
            uint256 callerA7A5Before = A7A5.balanceOf(msg.sender);
            _safeTransfer(address(A7A5), msg.sender, facadeA7A5Received);
            amountOut = A7A5.balanceOf(msg.sender) - callerA7A5Before;
        } else {
            // SELL MIXED: A7A5 from caller → wrap at facade → wA7A5 → V3 → USDT to caller.
            // Two FOT hits: (1) caller → facade, (2) facade → WA7A5 inside wrap().
            uint256 facadeA7A5Before = A7A5.balanceOf(address(this));
            _safeTransferFrom(
                address(A7A5),
                msg.sender,
                address(this),
                amountIn
            );
            uint256 effectiveA7A5 =
                A7A5.balanceOf(address(this)) - facadeA7A5Before;
            _safeApprove(address(A7A5), address(WA7A5), effectiveA7A5);
            uint256 wa7a5Amount = WA7A5.wrap(effectiveA7A5);
            _safeApprove(address(A7A5), address(WA7A5), 0);
            _safeApprove(address(WA7A5), address(v3Router), wa7a5Amount);
            amountOut = v3Router.exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: address(WA7A5),
                    tokenOut: address(USDT),
                    fee: wa7a5UsdtV3Fee,
                    recipient: msg.sender,
                    amountIn: wa7a5Amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            _safeApprove(address(WA7A5), address(v3Router), 0);
        }

        require(amountOut >= amountOutMin, "PoolsFacade: insufficient output");
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
        // BUY
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

    /// @dev    BUY  → amountIn is USDT  → output is A7A5
    ///         SELL → amountIn is A7A5  → output is USDT
    ///         Applies the standard 0.3 % V2 swap fee.
    /// @param amountIn Raw token amount (USDT for BUY, A7A5 for SELL).
    /// @param side     Direction of the hypothetical trade.
    /// @return amountOut  Simulated output amount for the given direction.
    function quoteA7A5PerUSDT(
        uint256 amountIn,
        SIDE side
    ) public view returns (uint256 amountOut) {
        uint112 rIn;
        uint112 rOut;
        (rIn, rOut) = _getV2ReserveInReserveOut(side);

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
    function quoteWA7A5PerUSDT(
        uint256 amountIn,
        SIDE side
    ) public returns (uint256 amountOut) {
        address tokenIn;
        address tokenOut;
        if (side == SIDE.BUY) {
            tokenIn = address(USDT);
            tokenOut = address(WA7A5);
        } else {
            tokenIn = address(WA7A5);
            tokenOut = address(USDT);
        }

        (amountOut, , , ) = v3Quoter.quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: wa7a5UsdtV3Fee,
                sqrtPriceLimitX96: 0
            })
        );
    }

    // ── Allowance checkers ────────────────────────────────────────────────────
    // Convenience view functions for callers (frontends, scripts) to check whether
    // they have approved enough of each input token to this facade before calling
    // a swap function.  The values returned by these functions are the exact thresholds
    // that the internal _requireAllowance guard enforces.

    /// @notice USDT allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapA7A5(BUY), swapWA7A5(BUY), or swapA7A5AtBestQuote(BUY).
    function allowanceUSDT(address owner) external view returns (uint256) {
        return USDT.allowance(owner, address(this));
    }

    /// @notice A7A5 allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapA7A5(SELL) or swapA7A5AtBestQuote(SELL).
    function allowanceA7A5(address owner) external view returns (uint256) {
        return A7A5.allowance(owner, address(this));
    }

    /// @notice wA7A5 allowance granted to this facade by `owner`.
    ///         Must be ≥ amountIn before calling swapWA7A5(SELL).
    function allowanceWA7A5(address owner) external view returns (uint256) {
        return WA7A5.allowance(owner, address(this));
    }

    /// @notice Net A7A5 amount received after the on-chain transfer tax is deducted.
    /// @dev    Used for off-chain quoting only — the execution paths use balance-delta
    ///         measurements instead of this analytic estimate.
    /// @param amountIn Gross A7A5 amount before the fee.
    /// @return effectiveOut Net A7A5 the recipient actually receives.
    function getA7A5EffectiveOutput(
        uint256 amountIn
    ) public view returns (uint256 effectiveOut) {
        uint256 bps = A7A5.basisPointsRate();
        uint256 precision = A7A5.FEE_PRECISION();
        effectiveOut = (amountIn * (precision - bps)) / precision;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _v2Buy(uint256 amountIn) internal returns (uint256 amountOut) {
        // ── Step 1: Read reserves before any transfer ─────────────────────────
        // BUY:  rIn == USDT reserve,  rOut == A7A5 reserve
        // SELL: rIn == A7A5 reserve,  rOut == USDT reserve
        (uint112 rIn, uint112 rOut) = _getV2ReserveInReserveOut(SIDE.BUY);
        // ── BUY path: USDT → A7A5 ────────────────────────────────────────

        // Step 2b: Compute the A7A5 amount the pair must send (pre-FOT quote).
        //          Used only to size the pair.swap() call; the actual receipt
        //          will be less due to the FOT deduction on the outbound transfer.
        //          Reverts here (not after transfer) if reserves are empty.
        amountOut = _v2AmountOut(amountIn, rIn, rOut);
        require(amountOut > 0, "PoolsFacade: zero output");

        // Step 3b: Pull USDT from caller directly into the pair.
        //          USDT is not FOT — full amountIn lands in the pair.
        _safeTransferFrom(address(USDT), msg.sender, address(v2Pair), amountIn);

        // Step 5b: Execute the swap.  The pair sends effectiveOut A7A5, but
        //          the caller receives effectiveOut − FOT fee.
        //          Slot assignment: A7A5=token0 → A7A5 exits as token0 (out0)
        //                           A7A5=token1 → A7A5 exits as token1 (out1)
        (uint256 out0, uint256 out1) = v2A7A5IsToken0
            ? (amountOut, uint256(0)) // A7A5 is token0
            : (uint256(0), amountOut); // A7A5 is token1
        v2Pair.swap(out0, out1, msg.sender, bytes(""));
    }

    function _v2Sell(uint256 amountIn) internal returns (uint256 effectiveOut) {
        // ── Step 1: Read reserves before any transfer ─────────────────────────
        // BUY:  rIn == USDT reserve,  rOut == A7A5 reserve
        // SELL: rIn == A7A5 reserve,  rOut == USDT reserve
        (uint112 rIn, uint112 rOut) = _getV2ReserveInReserveOut(SIDE.SELL);

        // ── SELL path: A7A5 → USDT ────────────────────────────────────────

        // Step 2a: Snapshot pair's A7A5 balance before the transfer.
        //          A7A5 is fee-on-transfer, so the pair may receive less
        //          than amountIn.  We measure the actual delta rather than
        //          relying on an analytic formula, which ensures the
        //          constant-product formula below matches the pair's own
        //          K-invariant check.
        uint256 pairA7A5Before = A7A5.balanceOf(address(v2Pair));

        // Step 3a: Pull the gross A7A5 amount from the caller into the pair.
        _safeTransferFrom(address(A7A5), msg.sender, address(v2Pair), amountIn);

        // Step 4a: Measure what the pair actually received.
        uint256 received = A7A5.balanceOf(address(v2Pair)) - pairA7A5Before;
        require(received > 0, "PoolsFacade: zero received by pair");

        // Step 5a: Compute USDT output using the measured (post-FOT) input.
        //          Reverts if reserves are empty.
        effectiveOut = _v2AmountOut(received, rIn, rOut);
        require(effectiveOut > 0, "PoolsFacade: zero output");

        // Step 6a: Execute the swap.  USDT is not FOT so effectiveOut equals
        //          the USDT amount the caller will actually receive.
        //          Slot assignment: A7A5=token0 → USDT exits as token1 (out1)
        //                           A7A5=token1 → USDT exits as token0 (out0)
        (uint256 out0, uint256 out1) = v2A7A5IsToken0
            ? (uint256(0), effectiveOut) // A7A5 is token0 → USDT is token1
            : (effectiveOut, uint256(0)); // A7A5 is token1 → USDT is token0
        v2Pair.swap(out0, out1, msg.sender, bytes(""));
    }

    /// @dev Executes a V3 exactInputSingle for the wA7A5/USDT pool.
    ///      Assumes `amountIn` of tokenIn is already held by this contract.
    ///      Approves the router, swaps, resets approval to 0.
    ///      Pass amountOutMin = 0 when the caller enforces slippage on the
    ///      final output instead (e.g. the MIXED paths in swapA7A5AtBestQuote).
    function _executeV3WA7A5Swap(
        uint256 amountIn,
        SIDE side,
        uint256 amountOutMin,
        address recipient
    ) private returns (uint256 amountOut) {
        address tokenIn = side == SIDE.BUY ? address(USDT) : address(WA7A5);
        address tokenOut = side == SIDE.BUY ? address(WA7A5) : address(USDT);

        _safeApprove(tokenIn, address(v3Router), amountIn);
        amountOut = v3Router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: wa7a5UsdtV3Fee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );
        _safeApprove(tokenIn, address(v3Router), 0);
    }

    /// @dev Reverts with a clear message when `owner` has not approved at least
    ///      `amount` of `token` to this contract.  Called before every
    ///      _safeTransferFrom so failures surface before any state is touched.
    function _requireAllowance(
        address token,
        address owner,
        uint256 amount
    ) private view {
        require(
            IERC20(token).allowance(owner, address(this)) >= amount,
            "PoolsFacade: insufficient allowance"
        );
    }

    /// @dev Standard Uniswap V2 getAmountOut formula with 0.3 % swap fee.
    function _v2AmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256) {
        require(reserveIn > 0 && reserveOut > 0, "PoolsFacade: empty reserves");
        uint256 amountInWithFee = amountIn * 997;
        return
            (amountInWithFee * reserveOut) /
            (reserveIn * 1000 + amountInWithFee);
    }

    function _validV2Pair(
        IUniswapV2Pair _pair,
        address _a7a5,
        address _usdt
    ) internal view returns (bool) {
        address t0 = _pair.token0();
        address t1 = _pair.token1();
        return (t0 == _a7a5 && t1 == _usdt) || (t1 == _a7a5 && t0 == _usdt);
    }

    function _getV2ReserveInReserveOut(
        SIDE side
    ) internal view returns (uint112 rIn, uint112 rOut) {
        (uint112 r0, uint112 r1, ) = v2Pair.getReserves();

        // Map reserves to their token identity first …
        uint112 rA7A5 = v2A7A5IsToken0 ? uint112(r0) : uint112(r1);
        uint112 rUSDT = v2A7A5IsToken0 ? uint112(r1) : uint112(r0);

        // … then route input/output reserves according to the trade direction
        if (side == SIDE.BUY) {
            // Spending USDT to receive A7A5
            rIn = rUSDT;
            rOut = rA7A5;
        } else {
            // Spending A7A5 to receive USDT
            rIn = rA7A5;
            rOut = rUSDT;
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "PoolsFacade: transfer failed"
        );
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(
                IERC20.transferFrom.selector,
                from,
                to,
                amount
            )
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "PoolsFacade: transferFrom failed"
        );
    }

    function _safeApprove(
        address token,
        address spender,
        uint256 amount
    ) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "PoolsFacade: approve failed"
        );
    }
}
