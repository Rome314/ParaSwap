// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

error UsdtNativeOracle__InvalidPrice();
error UsdtNativeOracle__IncompleteRound();
error UsdtNativeOracle__StalePrice(uint256 validUntil, uint256 nowTs);
error UsdtNativeOracle__StalenessTooLow(uint256 given, uint256 min);
error UsdtNativeOracle__ZeroAddress();

event UsdtMaxStalenessUpdated(uint256 oldMaxStaleness, uint256 newMaxStaleness);

/**
 * @title UsdtNativeOracle
 * @notice USDT base units (6 decimals) charged per 1e18 wei of native gas for {UsdtPaymaster}.
 *
 * Uses Chainlink USDT/ETH (ETH per USDT). Same staleness / validationData pattern as {A7A5NativeOracle}.
 */
contract UsdtNativeOracle is Ownable2Step {
    uint256 public constant MIN_MAX_STALENESS = 5 minutes;
    uint8 public constant USDT_DECIMALS = 6;

    AggregatorV3Interface public immutable USDT_ETH;

    /// @dev 10**(USDT_DECIMALS + feedDecimals)
    uint256 public immutable NUMERATOR;

    uint8 public immutable USDT_ETH_DECIMALS;

    uint256 public maxStaleness;

    constructor(
        AggregatorV3Interface usdtEth,
        uint256 maxStaleness_,
        address owner_
    ) Ownable(owner_) {
        if (address(usdtEth) == address(0)) revert UsdtNativeOracle__ZeroAddress();
        if (maxStaleness_ < MIN_MAX_STALENESS)
            revert UsdtNativeOracle__StalenessTooLow(maxStaleness_, MIN_MAX_STALENESS);

        USDT_ETH = usdtEth;
        uint8 feedDec = usdtEth.decimals();
        USDT_ETH_DECIMALS = feedDec;
        NUMERATOR = 10 ** (uint256(USDT_DECIMALS) + uint256(feedDec));
        maxStaleness = maxStaleness_;
    }

    function setMaxStaleness(uint256 newMaxStaleness) external onlyOwner {
        if (newMaxStaleness < MIN_MAX_STALENESS)
            revert UsdtNativeOracle__StalenessTooLow(newMaxStaleness, MIN_MAX_STALENESS);
        uint256 old = maxStaleness;
        maxStaleness = newMaxStaleness;
        emit UsdtMaxStalenessUpdated(old, newMaxStaleness);
    }

    function tokenPriceData() public view returns (uint256 price, uint48 validUntil) {
        // slither-disable-next-line unused-return
        (uint80 roundId, int256 ethPerUsdt, , uint256 updatedAt, uint80 answeredInRound) = USDT_ETH
            .latestRoundData();
        if (answeredInRound < roundId) revert UsdtNativeOracle__IncompleteRound();
        if (ethPerUsdt <= 0) revert UsdtNativeOracle__InvalidPrice();

        price = NUMERATOR / uint256(ethPerUsdt);
        if (price == 0) revert UsdtNativeOracle__InvalidPrice();

        validUntil = uint48(updatedAt + maxStaleness);
    }

    function tokenPrice() external view returns (uint256 price) {
        uint48 validUntil;
        (price, validUntil) = tokenPriceData();
        // slither-disable-next-line timestamp
        if (block.timestamp > validUntil)
            revert UsdtNativeOracle__StalePrice(validUntil, block.timestamp);
    }
}
