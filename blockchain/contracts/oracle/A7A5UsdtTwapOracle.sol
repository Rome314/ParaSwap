// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {IUniswapV3PoolOracle} from "../interfaces/IUniswapV3PoolOracle.sol";
import {IWA7A5} from "../interfaces/IA7A5.sol";
import {TickMath} from "../vendor/uniswap/TickMath.sol";

// ── Errors ──────────────────────────────────────────────────────────────────────

error A7A5UsdtTwapOracle__WindowTooShort(uint32 window, uint32 minWindow);
error A7A5UsdtTwapOracle__PoolMismatch();
error A7A5UsdtTwapOracle__NoHistoricalData();
error A7A5UsdtTwapOracle__InvalidRatio();

// ── Events ──────────────────────────────────────────────────────────────────────

event TwapWindowUpdated(uint32 oldWindow, uint32 newWindow);

/**
 * @title A7A5UsdtTwapOracle
 * @notice A Chainlink-compatible (`AggregatorV3Interface`) price feed for **A7A5 quoted in USDT**.
 *
 * A7A5 has no Chainlink feed and is a fee-on-transfer token, so its spot AMM reserves are unsafe to
 * price against directly. Instead we read a time-weighted average price (TWAP) from the existing
 * non-FOT **wA7A5/USDT Uniswap V3 pool** via `observe()`, then convert wA7A5 → A7A5 using the
 * wrapper's exchange ratio. The result (USDT per A7A5, 8 decimals) is manipulation-resistant per the
 * project's `defi-security` guidance (no spot reserves, TWAP only).
 *
 * @dev `answer` = USDT-per-A7A5 scaled by 1e8 (Chainlink convention for an "A7A5 / USDT" feed).
 */
contract A7A5UsdtTwapOracle is AggregatorV3Interface, Ownable2Step {
    using Math for uint256;

    uint8 private constant FEED_DECIMALS = 8;
    uint32 public constant MIN_TWAP_WINDOW = 300; // 5 minutes

    IUniswapV3PoolOracle public immutable POOL;
    IWA7A5 public immutable WA7A5;
    address public immutable USDT;

    // Cached token units to avoid repeated external calls in the hot path.
    uint256 public immutable WA7A5_UNIT; // 10**wA7A5.decimals()
    uint256 public immutable USDT_SCALE; // 10**usdt.decimals()
    uint256 public immutable A7A5_SCALE; // 10**a7a5.decimals()

    /// @dev TWAP averaging window in seconds. Longer = harder to manipulate, slower to react.
    uint32 public twapWindow;

    /**
     * @param pool   wA7A5/USDT Uniswap V3 pool.
     * @param wa7a5  Wrapped-A7A5 token (exposes the wA7A5↔A7A5 ratio).
     * @param usdt   USDT token (the quote asset of the pool).
     * @param window Initial TWAP window in seconds (>= {MIN_TWAP_WINDOW}).
     * @param owner_ Initial owner (should be a multisig in production).
     */
    constructor(
        IUniswapV3PoolOracle pool,
        IWA7A5 wa7a5,
        address usdt,
        uint32 window,
        address owner_
    ) Ownable(owner_) {
        address a7a5 = wa7a5.A7A5();
        // Both pool tokens must be exactly {wa7a5, usdt}.
        address t0 = pool.token0();
        address t1 = pool.token1();
        if (!((t0 == address(wa7a5) && t1 == usdt) || (t0 == usdt && t1 == address(wa7a5)))) {
            revert A7A5UsdtTwapOracle__PoolMismatch();
        }
        if (window < MIN_TWAP_WINDOW)
            revert A7A5UsdtTwapOracle__WindowTooShort(window, MIN_TWAP_WINDOW);

        POOL = pool;
        WA7A5 = wa7a5;
        USDT = usdt;
        WA7A5_UNIT = 10 ** IERC20Metadata(address(wa7a5)).decimals();
        USDT_SCALE = 10 ** IERC20Metadata(usdt).decimals();
        A7A5_SCALE = 10 ** IERC20Metadata(a7a5).decimals();
        twapWindow = window;
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// @notice Update the TWAP averaging window. Owner-only; enforces a minimum.
    function setTwapWindow(uint32 newWindow) external onlyOwner {
        if (newWindow < MIN_TWAP_WINDOW)
            revert A7A5UsdtTwapOracle__WindowTooShort(newWindow, MIN_TWAP_WINDOW);
        uint32 old = twapWindow;
        twapWindow = newWindow;
        emit TwapWindowUpdated(old, newWindow);
    }

    // ── Pricing ─────────────────────────────────────────────────────────────────

    /// @notice USDT per A7A5, scaled by 1e8. Reverts if the pool lacks `twapWindow` of history.
    function latestAnswer() public view returns (uint256 priceUsdtPerA7A5) {
        int24 meanTick = _consultMeanTick(twapWindow);

        // USDT base units obtained for 1 whole wA7A5 at the mean tick.
        uint256 usdtPerWA7A5 = _getQuoteAtTick(meanTick, WA7A5_UNIT, address(WA7A5), USDT);

        // A7A5 base units backing 1 whole wA7A5 (>= one A7A5 unit as the wrapper accrues value).
        uint256 a7a5PerWA7A5 = WA7A5.getA7A5BywA7A5(WA7A5_UNIT);
        if (a7a5PerWA7A5 == 0) revert A7A5UsdtTwapOracle__InvalidRatio();

        // USDT/A7A5 (8 dec) = (usdtPerWA7A5 / USDT_SCALE) / (a7a5PerWA7A5 / A7A5_SCALE) * 1e8
        //                   = usdtPerWA7A5 * A7A5_SCALE * 1e8 / (a7a5PerWA7A5 * USDT_SCALE)
        priceUsdtPerA7A5 = Math.mulDiv(
            usdtPerWA7A5 * A7A5_SCALE,
            10 ** FEED_DECIMALS,
            a7a5PerWA7A5 * USDT_SCALE
        );
    }

    // ── AggregatorV3Interface ─────────────────────────────────────────────────────

    function decimals() external pure returns (uint8) {
        return FEED_DECIMALS;
    }

    function description() external pure returns (string memory) {
        return "A7A5 / USDT TWAP";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    /// @dev TWAP is computed on-demand; only "latest" is meaningful.
    function getRoundData(uint80) external pure returns (uint80, int256, uint256, uint256, uint80) {
        revert A7A5UsdtTwapOracle__NoHistoricalData();
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        uint80 round = uint80(block.timestamp);
        return (round, int256(latestAnswer()), block.timestamp, block.timestamp, round);
    }

    // ── Internal math ─────────────────────────────────────────────────────────────

    /// @dev Arithmetic-mean tick over `window` seconds, rounded toward negative infinity (Uniswap convention).
    function _consultMeanTick(uint32 window) internal view returns (int24 meanTick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = window;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives, ) = POOL.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int56 windowI = int56(uint56(window));
        meanTick = int24(delta / windowI);
        if (delta < 0 && (delta % windowI != 0)) meanTick--;
    }

    /// @dev Amount of `quoteToken` for `baseAmount` of `baseToken` at `tick`. Port of Uniswap's
    ///      OracleLibrary.getQuoteAtTick using OZ `Math.mulDiv` for the 512-bit multiply.
    function _getQuoteAtTick(
        int24 tick,
        uint256 baseAmount,
        address baseToken,
        address quoteToken
    ) internal pure returns (uint256 quoteAmount) {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount =
                baseToken < quoteToken
                    ? Math.mulDiv(ratioX192, baseAmount, 1 << 192)
                    : Math.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = Math.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount =
                baseToken < quoteToken
                    ? Math.mulDiv(ratioX128, baseAmount, 1 << 128)
                    : Math.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
