// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.22;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Read the current transfer-fee rate from A7A5
interface IA7A5 is IERC20 {
    function basisPointsRate() external view returns (uint256);
    function FEE_PRECISION() external view returns (uint256);
}

interface IWA7A5 is IERC20 {
    function wrap(uint256 _A7A5Amount) external returns (uint256);
    function unwrap(uint256 _wA7A5Amount) external returns (uint256);
    function getwA7A5ByA7A5(uint256 _A7A5Amount) external view returns (uint256);
    function getA7A5BywA7A5(uint256 _wA7A5Amount) external view returns (uint256);
    function A7A5() external view returns (address);
}
