// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title ITokenPaymaster
 * @notice Shared view interface for ERC-20 gas paymasters (A7A5, USDT, …).
 */
interface ITokenPaymaster {
    function gasToken() external view returns (address);
    function oracle() external view returns (address);
}
