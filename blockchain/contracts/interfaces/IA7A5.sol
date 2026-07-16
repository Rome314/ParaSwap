// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.22;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Interface for the A7A5 token — a standard ERC-20 with a transfer tax.
///         Every transfer deducts `basisPointsRate / FEE_PRECISION` of the amount
///         as a protocol fee. Use `getA7A5EffectiveOutput` in PoolsFacade for
///         the analytic deduction, or measure balance-deltas in execution paths.
interface IA7A5 is IERC20 {
    /// @notice Current transfer tax rate in basis points (e.g. 10 = 0.1 %).
    /// @return Basis-point fee charged on every A7A5 transfer.
    function basisPointsRate() external view returns (uint256);

    /// @notice Denominator for the fee rate: `effectiveOut = amount * (FEE_PRECISION - bps) / FEE_PRECISION`.
    /// @return Fee-rate denominator (typically 10 000).
    function FEE_PRECISION() external view returns (uint256);
}

/// @notice Interface for the wA7A5 wrapped token.
///         wA7A5 is a rebasing ERC-20 wrapper around A7A5. It holds A7A5 in escrow
///         and issues wA7A5 shares that are unaffected by the A7A5 transfer tax,
///         making them suitable for Uniswap V3 pools.
interface IWA7A5 is IERC20 {
    /// @notice Wrap `_A7A5Amount` of A7A5 into wA7A5 shares.
    ///         Caller must pre-approve this contract for at least `_A7A5Amount` of A7A5.
    ///         A7A5's transfer tax is deducted during the pull, so the received
    ///         wA7A5 will correspond to the post-tax A7A5 amount held.
    /// @param _A7A5Amount Gross A7A5 to deposit (before FOT deduction).
    /// @return            wA7A5 shares minted to the caller.
    function wrap(uint256 _A7A5Amount) external returns (uint256);

    /// @notice Unwrap `_wA7A5Amount` of wA7A5 shares back into A7A5.
    ///         The corresponding A7A5 is transferred to the caller; A7A5's
    ///         transfer tax is deducted on this outbound transfer.
    /// @param _wA7A5Amount wA7A5 shares to redeem.
    /// @return             A7A5 received by the caller (post-FOT).
    function unwrap(uint256 _wA7A5Amount) external returns (uint256);

    /// @notice Convert an A7A5 amount to the equivalent wA7A5 shares (view, no tax).
    /// @param _A7A5Amount A7A5 amount to convert.
    /// @return            Equivalent wA7A5 shares.
    function getwA7A5ByA7A5(uint256 _A7A5Amount) external view returns (uint256);

    /// @notice Convert a wA7A5 share amount to the equivalent underlying A7A5 (view, no tax).
    /// @param _wA7A5Amount wA7A5 share amount to convert.
    /// @return             Equivalent A7A5 amount before any FOT deduction.
    function getA7A5BywA7A5(uint256 _wA7A5Amount) external view returns (uint256);

    /// @notice Address of the underlying A7A5 token held in this wrapper.
    /// @return A7A5 token address.
    function A7A5() external view returns (address);
}
