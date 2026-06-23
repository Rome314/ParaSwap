// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {IWA7A5} from "../interfaces/IA7A5.sol";

// ── Errors ──────────────────────────────────────────────────────────────────────

error A7A5NativeOracle__InvalidPrice();
error A7A5NativeOracle__IncompleteRound();
error A7A5NativeOracle__StalePrice(uint256 validUntil, uint256 nowTs);
error A7A5NativeOracle__StalenessTooLow(uint256 given, uint256 min);

// ── Events ──────────────────────────────────────────────────────────────────────

event MaxStalenessUpdated(uint256 oldMaxStaleness, uint256 newMaxStaleness);

/**
 * @title A7A5NativeOracle
 * @notice Produces the `tokenPrice` consumed by {A7A5Paymaster}: the number of **A7A5 base units
 *         charged per 1e18 wei of native (ETH)** gas, matching OpenZeppelin `PaymasterERC20`'s
 *         `_erc20Cost = cost * tokenPrice / 1e18`.
 *
 * @dev Composition (see {A7A5UsdtTwapOracle} for the A7A5/USDT leg and the Chainlink USDT/ETH feed):
 *
 *      A7A5_per_ETH(whole) = (USDT per ETH) / (USDT per A7A5)
 *                          = (1 / ethPerUsdt) / usdtPerA7A5
 *      tokenPrice          = A7A5_per_ETH(whole) * 10**A7A5_DECIMALS
 *                          = 10**(A7A5dec + feedDec + twapDec) / (ethPerUsdt * usdtPerA7A5)
 *
 *      All feed reads are validated: non-zero answers, and a `validUntil = updatedAt + maxStaleness`
 *      window the paymaster encodes into the user operation's validation data (a stale price makes
 *      the op *expire* rather than be mispriced — and does not revert during validation).
 */
contract A7A5NativeOracle is Ownable2Step {
    uint256 public constant MIN_MAX_STALENESS = 5 minutes;

    AggregatorV3Interface public immutable A7A5_USDT; // USDT per A7A5, `twapDecimals`
    AggregatorV3Interface public immutable USDT_ETH; // ETH per USDT (Chainlink), `feedDecimals`

    uint256 public immutable NUMERATOR; // 10**(A7A5dec + feedDec + twapDec) folded for mulDiv

    uint8 public immutable A7A5_USDT_DECIMALS;
    uint8 public immutable USDT_ETH_DECIMALS;

    /// @dev Maximum age of the Chainlink USDT/ETH answer before a quote is considered expired.
    uint256 public maxStaleness;

    /**
     * @param a7a5Usdt    A7A5/USDT TWAP feed (this repo's {A7A5UsdtTwapOracle}).
     * @param usdtEth     Chainlink USDT/ETH feed (returns ETH per USDT).
     * @param wa7a5       Wrapped A7A5, used only to read the A7A5 token's decimals.
     * @param maxStaleness_ Initial staleness window (>= {MIN_MAX_STALENESS}).
     * @param owner_      Initial owner (multisig in production).
     */
    constructor(
        AggregatorV3Interface a7a5Usdt,
        AggregatorV3Interface usdtEth,
        IWA7A5 wa7a5,
        uint256 maxStaleness_,
        address owner_
    ) Ownable(owner_) {
        if (maxStaleness_ < MIN_MAX_STALENESS)
            revert A7A5NativeOracle__StalenessTooLow(maxStaleness_, MIN_MAX_STALENESS);

        A7A5_USDT = a7a5Usdt;
        USDT_ETH = usdtEth;

        uint8 twapDec = a7a5Usdt.decimals();
        uint8 feedDec = usdtEth.decimals();
        uint8 a7a5Dec = IERC20Metadata(wa7a5.A7A5()).decimals();

        A7A5_USDT_DECIMALS = twapDec;
        USDT_ETH_DECIMALS = feedDec;
        NUMERATOR = 10 ** (uint256(a7a5Dec) + uint256(feedDec) + uint256(twapDec));
        maxStaleness = maxStaleness_;
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    function setMaxStaleness(uint256 newMaxStaleness) external onlyOwner {
        if (newMaxStaleness < MIN_MAX_STALENESS)
            revert A7A5NativeOracle__StalenessTooLow(newMaxStaleness, MIN_MAX_STALENESS);
        uint256 old = maxStaleness;
        maxStaleness = newMaxStaleness;
        emit MaxStalenessUpdated(old, newMaxStaleness);
    }

    // ── Pricing ─────────────────────────────────────────────────────────────────

    /**
     * @notice A7A5 base units per 1e18 wei of native gas, plus the timestamp until which it is valid.
     * @dev Does NOT revert on staleness (only on clearly invalid data) so it is safe to call inside
     *      ERC-4337 paymaster validation; the caller should reject the op if `validUntil` has passed.
     */
    function tokenPriceData() public view returns (uint256 price, uint48 validUntil) {
        (uint80 roundId, int256 ethPerUsdt, , uint256 updatedAt, uint80 answeredInRound) = USDT_ETH
            .latestRoundData();
        if (answeredInRound < roundId) revert A7A5NativeOracle__IncompleteRound();
        if (ethPerUsdt <= 0) revert A7A5NativeOracle__InvalidPrice();

        (, int256 usdtPerA7A5, , , ) = A7A5_USDT.latestRoundData();
        if (usdtPerA7A5 <= 0) revert A7A5NativeOracle__InvalidPrice();

        uint256 denominator = uint256(ethPerUsdt) * uint256(usdtPerA7A5);
        price = NUMERATOR / denominator;
        if (price == 0) revert A7A5NativeOracle__InvalidPrice();

        validUntil = uint48(updatedAt + maxStaleness);
    }

    /// @notice Convenience accessor that reverts if the current quote is already expired.
    function tokenPrice() external view returns (uint256 price) {
        uint48 validUntil;
        (price, validUntil) = tokenPriceData();
        if (block.timestamp > validUntil)
            revert A7A5NativeOracle__StalePrice(validUntil, block.timestamp);
    }
}
