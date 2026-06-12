// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {
    IAccount,
    IEntryPoint,
    PackedUserOperation
} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// ── Errors ──────────────────────────────────────────────────────────────────────

error SimpleA7A5Account__NotEntryPoint();
error SimpleA7A5Account__NotOwnerOrEntryPoint();
error SimpleA7A5Account__ZeroAddress();

/**
 * @title SimpleA7A5Account
 * @notice Minimal single-owner ERC-4337 smart account used to drive A7A5-sponsored swaps.
 *
 * @dev Intentionally minimal (no upgradeability, no batching, no modules): it validates an ECDSA
 *      signature by the `owner` over the EntryPoint-provided `userOpHash` (eth-signed-message prefix)
 *      and executes a single call. Signing the hash the EntryPoint hands the account keeps this
 *      self-consistent across EntryPoint versions. For production, prefer an audited modular account.
 */
contract SimpleA7A5Account is IAccount {
    IEntryPoint public immutable ENTRY_POINT;
    address public immutable owner;

    event Executed(address indexed target, uint256 value, bytes data);

    constructor(IEntryPoint entryPoint_, address owner_) {
        if (address(entryPoint_) == address(0) || owner_ == address(0))
            revert SimpleA7A5Account__ZeroAddress();
        ENTRY_POINT = entryPoint_;
        owner = owner_;
    }

    /// @inheritdoc IAccount
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != address(ENTRY_POINT))
            revert SimpleA7A5Account__NotEntryPoint();

        // eth_sign / personal_sign prefix, inlined to avoid the ^0.8.24 MessageHashUtils dependency.
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        address recovered = ECDSA.recover(ethHash, userOp.signature);
        validationData =
            recovered == owner
                ? ERC4337Utils.SIG_VALIDATION_SUCCESS
                : ERC4337Utils.SIG_VALIDATION_FAILED;

        if (missingAccountFunds != 0) {
            // Best-effort top-up of the EntryPoint; failures are surfaced by the EntryPoint itself.
            (bool ok, ) = msg.sender.call{value: missingAccountFunds}("");
            ok; // silence unused; EntryPoint reverts on genuine shortfall
        }
    }

    /// @notice Execute a single call. Callable by the EntryPoint (sponsored) or directly by the owner.
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bytes memory) {
        if (msg.sender != address(ENTRY_POINT) && msg.sender != owner)
            revert SimpleA7A5Account__NotOwnerOrEntryPoint();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        emit Executed(target, value, data);
        return ret;
    }

    receive() external payable {}
}
