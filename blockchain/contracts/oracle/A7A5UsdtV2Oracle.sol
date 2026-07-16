// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IUniswapV2Pair} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

// ── Errors ──────────────────────────────────────────────────────────────────────

error A7A5UsdtV2Oracle__PairMismatch();
error A7A5UsdtV2Oracle__EmptyReserves();
error A7A5UsdtV2Oracle__InsufficientLiquidity();
error A7A5UsdtV2Oracle__NoHistoricalData();
error A7A5UsdtV2Oracle__ZeroAddress();

/**
 * @title A7A5UsdtV2Oracle
 * @notice A Chainlink-compatible (`AggregatorV3Interface`) price feed for **A7A5 quoted in USDT**,
 *         sourced from the Uniswap V2 A7A5/USDT pair's spot reserves.
 *
 * @dev Drop-in counterpart to {A7A5UsdtTwapOracle}: same 8-decimal USDT-per-A7A5 output,
 *      same interface — but reads the live V2 reserves instead of a V3 TWAP.  No configurable
 *      parameters so no Ownable needed.
 *
 *      `answer` = USDT-per-A7A5 scaled by 1e8 (Chainlink convention for an "A7A5 / USDT" feed).
 *
 *      Formula:
 *          USDT/A7A5 (8 dec) = reserveUSDT * A7A5_SCALE * 1e8 / (reserveA7A5 * USDT_SCALE)
 */
contract A7A5UsdtV2Oracle is AggregatorV3Interface {
    using Math for uint256;

    uint8 private constant FEED_DECIMALS = 8;

    IUniswapV2Pair public immutable PAIR;
    address public immutable A7A5;
    address public immutable USDT;

    bool private immutable A7A5_IS_TOKEN0;

    uint256 public immutable A7A5_SCALE; // 10**a7a5.decimals()
    uint256 public immutable USDT_SCALE; // 10**usdt.decimals()

    /// @notice Minimum A7A5 reserve required to return a price; prevents manipulation via thin liquidity.
    uint256 public immutable MIN_RESERVE_A7A5;

    /**
     * @param pair  Uniswap V2 A7A5/USDT pair.
     * @param a7a5  A7A5 token address (one of the pair's two tokens).
     * @param usdt  USDT token address (the other pair token).
     */
    constructor(IUniswapV2Pair pair, address a7a5, address usdt, uint256 minReserveA7A5_) {
        if (address(pair) == address(0) || a7a5 == address(0) || usdt == address(0)) {
            revert A7A5UsdtV2Oracle__ZeroAddress();
        }
        address t0 = pair.token0();
        address t1 = pair.token1();
        if (!((t0 == a7a5 && t1 == usdt) || (t0 == usdt && t1 == a7a5))) {
            revert A7A5UsdtV2Oracle__PairMismatch();
        }

        PAIR = pair;
        A7A5 = a7a5;
        USDT = usdt;
        A7A5_IS_TOKEN0 = t0 == a7a5;
        A7A5_SCALE = 10 ** IERC20Metadata(a7a5).decimals();
        USDT_SCALE = 10 ** IERC20Metadata(usdt).decimals();
        MIN_RESERVE_A7A5 = minReserveA7A5_;
    }

    // ── Pricing ─────────────────────────────────────────────────────────────────

    /// @notice USDT per A7A5, scaled by 1e8. Reverts if A7A5 reserve is empty.
    function latestAnswer() public view returns (uint256 priceUsdtPerA7A5) {
        // slither-disable-next-line unused-return
        (uint112 reserve0, uint112 reserve1, ) = PAIR.getReserves();

        (uint256 reserveA7A5, uint256 reserveUSDT) = A7A5_IS_TOKEN0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));

        if (reserveA7A5 < MIN_RESERVE_A7A5) revert A7A5UsdtV2Oracle__InsufficientLiquidity();

        // USDT/A7A5 (8 dec) = (reserveUSDT / USDT_SCALE) / (reserveA7A5 / A7A5_SCALE) * 1e8
        //                   = reserveUSDT * A7A5_SCALE * 1e8 / (reserveA7A5 * USDT_SCALE)
        priceUsdtPerA7A5 = Math.mulDiv(
            reserveUSDT * A7A5_SCALE,
            10 ** FEED_DECIMALS,
            reserveA7A5 * USDT_SCALE
        );
    }

    // ── AggregatorV3Interface ─────────────────────────────────────────────────────

    function decimals() external pure returns (uint8) {
        return FEED_DECIMALS;
    }

    function description() external pure returns (string memory) {
        return "A7A5 / USDT V2";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    /// @dev V2 spot price has no history; only "latest" is meaningful.
    function getRoundData(uint80) external pure returns (uint80, int256, uint256, uint256, uint80) {
        revert A7A5UsdtV2Oracle__NoHistoricalData();
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
}
