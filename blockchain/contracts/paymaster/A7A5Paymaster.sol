// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {PaymasterERC20} from "@openzeppelin/community-contracts/contracts/account/paymaster/PaymasterERC20.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {
    IEntryPoint,
    PackedUserOperation
} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    Ownable2Step,
    Ownable
} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IA7A5} from "../interfaces/IA7A5.sol";
import {A7A5NativeOracle} from "../oracle/A7A5NativeOracle.sol";
import {ITokenPaymaster} from "./ITokenPaymaster.sol";

// ── Errors ──────────────────────────────────────────────────────────────────────

error A7A5Paymaster__ZeroAddress();

/**
 * @title A7A5Paymaster
 * @notice ERC-4337 paymaster that lets users pay swap (and any) gas in **A7A5 tokens** instead of ETH.
 *
 * Built on OpenZeppelin's {PaymasterERC20} (community-contracts). The paymaster sponsors gas in native
 * ETH against the {IEntryPoint} and is reimbursed in A7A5, priced by {A7A5NativeOracle}
 * (A7A5/USDT TWAP × Chainlink USDT/ETH).
 *
 * Two project-specific concerns are handled on top of the base contract:
 *
 *  1. **Fee-on-transfer (A7A5).** A7A5 charges a transfer fee, so a naive `transferFrom(prefund)` leaves
 *     the paymaster short by `prefund * basisPointsRate`. {_prefund} is overridden to gross the pull up
 *     by the current fee rate and record the *actual received* balance delta as the prefund amount, so
 *     the inherited refund math keeps the paymaster whole (mirrors the FOT handling in `PoolsFacade`/
 *     `ParaSwap`).
 *
 *  2. **Price staleness.** {_fetchDetails} encodes the oracle's `validUntil` into the user operation's
 *     validation data, so an expired price makes the op invalid at the EntryPoint rather than mispriced,
 *     without reverting during validation (ERC-7562 friendly). An emergency {pause} short-circuits
 *     validation by returning `SIG_VALIDATION_FAILED`.
 */
contract A7A5Paymaster is PaymasterERC20, Ownable2Step, Pausable, ITokenPaymaster {
    using ERC4337Utils for PackedUserOperation;
    using SafeERC20 for IERC20;
    using Math for uint256;

    IEntryPoint private immutable _ENTRY_POINT;
    IA7A5 public immutable A7A5;
    A7A5NativeOracle private _oracle;

    // ── Events ────────────────────────────────────────────────────────────────────

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /**
     * @param entryPoint_ Canonical EntryPoint this paymaster registers with (v0.8/v0.9 singleton).
     * @param a7a5        The A7A5 token used for gas payment.
     * @param oracle_     A7A5-per-native price oracle.
     * @param owner_      Initial owner (multisig in production); controls stake/deposit/withdraw/pause.
     */
    constructor(
        IEntryPoint entryPoint_,
        IA7A5 a7a5,
        A7A5NativeOracle oracle_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(entryPoint_) == address(0) ||
            address(a7a5) == address(0) ||
            address(oracle_) == address(0)
        ) {
            revert A7A5Paymaster__ZeroAddress();
        }
        _ENTRY_POINT = entryPoint_;
        A7A5 = a7a5;
        _oracle = oracle_;
    }

    /// @inheritdoc ITokenPaymaster
    function gasToken() external view returns (address) {
        return address(A7A5);
    }

    /// @inheritdoc ITokenPaymaster
    function oracle() external view returns (address) {
        return address(_oracle);
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// @notice Point the paymaster at a new price oracle. Owner-only.
    function setOracle(A7A5NativeOracle newOracle) external onlyOwner {
        if (address(newOracle) == address(0))
            revert A7A5Paymaster__ZeroAddress();
        emit OracleUpdated(address(_oracle), address(newOracle));
        _oracle = newOracle;
    }

    /// @notice Emergency stop: new operations stop being sponsored (validation fails, no revert).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume sponsoring operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ── PaymasterCore / PaymasterERC20 hooks ───────────────────────────────────────

    /// @notice The EntryPoint singleton this paymaster registers with (pinned at construction).
    function entryPoint() public view override returns (IEntryPoint) {
        return _ENTRY_POINT;
    }

    /// @dev Gate stake/deposit/withdraw to the owner.
    function _authorizeWithdraw() internal override onlyOwner {}

    /// @inheritdoc PaymasterERC20
    function _fetchDetails(
        PackedUserOperation calldata /* userOp */,
        bytes32 /* userOpHash */
    )
        internal
        view
        override
        returns (uint256 validationData, IERC20 token, uint256 tokenPrice)
    {
        token = IERC20(address(A7A5));
        if (paused()) {
            return (ERC4337Utils.SIG_VALIDATION_FAILED, token, 0);
        }
        uint48 validUntil;
        (tokenPrice, validUntil) = _oracle.tokenPriceData();
        validationData = ERC4337Utils.packValidationData(true, 0, validUntil);
    }

    /**
     * @inheritdoc PaymasterERC20
     * @dev Gross the prefund pull up by A7A5's transfer fee and record the *actual* received amount so
     *      the inherited {_refund} (which transfers `prefundAmount - actualCost` back) leaves the
     *      paymaster holding exactly the cost it is owed.
     */
    function _prefund(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        IERC20 token,
        uint256 tokenPrice,
        address prefunder_,
        uint256 maxCost
    )
        internal
        override
        returns (
            bool prefunded,
            uint256 prefundAmount,
            address prefunder,
            bytes memory prefundContext
        )
    {
        uint256 feePerGas = userOp.maxFeePerGas();
        uint256 targetNet = _erc20Cost(maxCost, feePerGas, tokenPrice);
        uint256 grossPull = _grossUpForFee(targetNet);

        uint256 balBefore = token.balanceOf(address(this));
        if (!token.trySafeTransferFrom(prefunder_, address(this), grossPull)) {
            return (false, 0, prefunder_, "");
        }
        uint256 received = token.balanceOf(address(this)) - balBefore;
        // `received >= targetNet` by construction, so the inherited refund subtraction cannot underflow.
        return (true, received, prefunder_, "");
    }

    /// @dev Smallest gross amount whose post-fee receipt is >= `net`, given A7A5's current fee rate.
    function _grossUpForFee(uint256 net) internal view returns (uint256) {
        uint256 bps = A7A5.basisPointsRate();
        if (bps == 0) return net;
        uint256 precision = A7A5.FEE_PRECISION();
        // received = amount - amount*bps/precision  =>  amount = ceil(net * precision / (precision - bps))
        return net.mulDiv(precision, precision - bps, Math.Rounding.Ceil);
    }
}
