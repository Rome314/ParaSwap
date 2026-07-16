// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ERC7739} from "@openzeppelin/contracts/utils/cryptography/signers/draft-ERC7739.sol";
import {ERC7821} from "@openzeppelin/contracts/account/extensions/draft-ERC7821.sol";
import {SignerEIP7702} from "@openzeppelin/contracts/utils/cryptography/signers/SignerEIP7702.sol";
import {IEntryPoint} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";

/**
 * @title A7A5EIP7702Account
 * @notice ERC-4337 smart account delegated to by EOAs via EIP-7702 (`0xef0100 || address`).
 * Signatures are plain ECDSA validated against `address(this)` — the delegating EOA itself.
 *
 * Deliberately stateless (no initializer): EOA storage persists across re-delegations, so any
 * `Initializable` slot written here would survive a switch to a future delegate. Creation-time
 * approvals ride in the same type-4 transaction as the delegation, as an ERC-7821 `execute`
 * self-call batch.
 */
contract A7A5EIP7702Account is
    Account,
    EIP712,
    ERC7739,
    ERC7821,
    SignerEIP7702,
    ERC721Holder,
    ERC1155Holder
{
    IEntryPoint private immutable _ENTRY_POINT;

    error A7A5EIP7702Account__ZeroAddress();

    constructor(IEntryPoint entryPoint_) EIP712("A7A5EIP7702Account", "1") {
        if (address(entryPoint_) == address(0)) revert A7A5EIP7702Account__ZeroAddress();
        _ENTRY_POINT = entryPoint_;
    }

    /// @inheritdoc Account
    function entryPoint() public view override returns (IEntryPoint) {
        return _ENTRY_POINT;
    }

    // slither-disable-next-line dead-code
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view override returns (bool) {
        return
            caller == address(entryPoint()) ||
            super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}
