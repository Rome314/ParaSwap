// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @dev Chainlink price-feed interface. Implemented by our A7A5/USDT oracle so it
///      is a drop-in, Chainlink-compatible feed, and consumed for the USDT/ETH feed.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
