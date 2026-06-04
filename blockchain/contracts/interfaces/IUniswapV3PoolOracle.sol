// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @dev Minimal slice of the Uniswap V3 pool surface needed for TWAP pricing.
interface IUniswapV3PoolOracle {
    /// @notice Returns the cumulative tick and liquidity values as of `secondsAgos` before the current block.
    function observe(
        uint32[] calldata secondsAgos
    ) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);

    /// @notice The 0th storage slot in the pool stores many values; here we read observation metadata.
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    /// @notice Increase the number of stored observations the pool will keep.
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

    function token0() external view returns (address);

    function token1() external view returns (address);
}
