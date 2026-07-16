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
    /// @notice Grant a batch of ERC-20 allowances during account initialization.
    ///         Called exactly once by the factory immediately after deployment;
    ///         the reinitializer guard prevents any subsequent call.
    /// @param approvals  Array of (token, spender, amount) tuples to approve.
    function initializeApprovals(TokenApproval[] calldata approvals) external;
}
