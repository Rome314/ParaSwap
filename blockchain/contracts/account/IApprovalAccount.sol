// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice ERC-20 allowance granted by a smart account at creation time.
struct TokenApproval {
    address token;
    address spender;
    uint256 amount;
}

/**
 * @title IApprovalAccount
 * @notice Accounts that grant a batch of ERC-20 allowances during initialization.
 */
interface IApprovalAccount {
    function initializeApprovals(TokenApproval[] calldata approvals) external;
}
