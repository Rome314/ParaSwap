// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ERC7739} from "@openzeppelin/contracts/utils/cryptography/signers/draft-ERC7739.sol";
import {ERC7821} from "@openzeppelin/contracts/account/extensions/draft-ERC7821.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IEntryPoint} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IApprovalAccount, TokenApproval} from "./IApprovalAccount.sol";

// ── Errors ───────────────────────────────────────────────────────────────────

error A7A5Account__ZeroAddress();
error A7A5Account__NotOwner();
error A7A5Account__WithdrawFailed();

/**
 * @title A7A5Account
 * @notice Upgradeable ERC-4337 smart account with ECDSA (personal_sign) validation.
 *
 * @dev Deployed as an ERC-1967 proxy via {A7A5AccountFactoryV2}. The implementation
 * constructor pins the EntryPoint and calls _disableInitializers() to prevent direct
 * initialization of the bare implementation. Storage is namespaced (ERC-7201) to keep
 * the layout collision-free across UUPS upgrades.
 *
 * Signing: the owner signs the EntryPoint-provided userOpHash with personal_sign
 * (eth_sign prefix), matching {buildSignedUserOp} in the off-chain helpers.
 */
contract A7A5Account is
    Initializable,
    Account,
    EIP712,
    ERC7739,
    ERC7821,
    UUPSUpgradeable,
    ReentrancyGuard,
    ERC721Holder,
    ERC1155Holder,
    IApprovalAccount
{
    using SafeERC20 for IERC20;

    // ── ERC-7201 namespaced storage ───────────────────────────────────────────

    /// @custom:storage-location erc7201:a7a5.storage.A7A5Account
    struct A7A5AccountStorage {
        address owner;
        uint256[50] __gap;
    }

    // keccak256(abi.encode(uint256(keccak256("a7a5.storage.A7A5Account")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant A7A5ACCOUNT_STORAGE_SLOT =
        0x65cec6402e094ca9b90b5ac9996396779d4de1b7702e604a49c43a9852592200;

    // ── Immutable ─────────────────────────────────────────────────────────────

    IEntryPoint private immutable _ENTRY_POINT;

    // ── Events ────────────────────────────────────────────────────────────────

    event ApprovalSet(address indexed token, address indexed spender, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);
    event ERC721Withdrawn(address indexed nft, address indexed to, uint256 tokenId);
    event ERC1155Withdrawn(address indexed nft, address indexed to, uint256 id, uint256 amount);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner()) revert A7A5Account__NotOwner();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IEntryPoint entryPoint_) EIP712("A7A5Account", "1") {
        if (address(entryPoint_) == address(0)) revert A7A5Account__ZeroAddress();
        _ENTRY_POINT = entryPoint_;
        _disableInitializers();
    }

    // ── Initializers ──────────────────────────────────────────────────────────

    /**
     * @notice Initialize the account with an owner. Called by the factory via the proxy.
     */
    function initialize(address owner_) public initializer {
        if (owner_ == address(0)) revert A7A5Account__ZeroAddress();
        _getStorage().owner = owner_;
    }

    /**
     * @notice Grant creation-time ERC-20 allowances. Consumes reinitializer version 2 so
     * it runs exactly once — {A7A5AccountFactoryV2} always calls it (even with an empty
     * list) so the slot is never left open for a third party to claim.
     */
    function initializeApprovals(TokenApproval[] calldata approvals) external reinitializer(2) {
        for (uint256 i; i < approvals.length; ++i) {
            IERC20(approvals[i].token).forceApprove(approvals[i].spender, approvals[i].amount);
            emit ApprovalSet(approvals[i].token, approvals[i].spender, approvals[i].amount);
        }
    }

    // ── Owner accessor ────────────────────────────────────────────────────────

    function owner() public view returns (address) {
        return _getStorage().owner;
    }

    // ── Account overrides ─────────────────────────────────────────────────────

    /// @inheritdoc Account
    function entryPoint() public view override returns (IEntryPoint) {
        return _ENTRY_POINT;
    }

    /**
     * @dev Validates the owner's ECDSA personal_sign signature over `hash`.
     * Returns false (rather than reverting) for any malformed or mismatched signature
     * so the EntryPoint can return SIG_VALIDATION_FAILED without aborting the batch.
     */
    function _rawSignatureValidation(
        bytes32 hash,
        bytes calldata signature
    ) internal view override returns (bool) {
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(ethHash, signature);
        return err == ECDSA.RecoverError.NoError && recovered == owner();
    }

    // ── ERC-7821 batch execution ───────────────────────────────────────────────

    /**
     * @dev Allows the EntryPoint, the owner (direct calls), and self (for atomic
     * batch self-calls) to call execute().
     */
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view override returns (bool) {
        return
            caller == address(entryPoint()) ||
            caller == owner() ||
            super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }

    // ── UUPS upgrade ──────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ── Approval management ───────────────────────────────────────────────────

    /**
     * @notice Set or revoke an ERC-20 allowance from this account.
     * Use `amount = 0` to revoke. Uses forceApprove for USDT/non-standard token compatibility.
     */
    function setApproval(address token, address spender, uint256 amount) external onlyOwner {
        IERC20(token).forceApprove(spender, amount);
        emit ApprovalSet(token, spender, amount);
    }

    /**
     * @notice Batch version of {setApproval}.
     */
    function setApprovals(TokenApproval[] calldata approvals) external onlyOwner {
        for (uint256 i; i < approvals.length; ++i) {
            IERC20(approvals[i].token).forceApprove(approvals[i].spender, approvals[i].amount);
            emit ApprovalSet(approvals[i].token, approvals[i].spender, approvals[i].amount);
        }
    }

    // ── Withdrawal functions ──────────────────────────────────────────────────

    /// @notice Withdraw ERC-20 tokens to the owner.
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner(), amount);
        emit TokenWithdrawn(token, owner(), amount);
    }

    /// @notice Withdraw the full ERC-20 balance of `token` to the owner.
    function withdrawTokenAll(address token) external onlyOwner nonReentrant {
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(owner(), bal);
        emit TokenWithdrawn(token, owner(), bal);
    }

    /// @notice Withdraw native ETH to the owner.
    function withdrawNative(uint256 amount) external onlyOwner nonReentrant {
        (bool ok, ) = owner().call{value: amount}("");
        if (!ok) revert A7A5Account__WithdrawFailed();
        emit NativeWithdrawn(owner(), amount);
    }

    /// @notice Withdraw the full native ETH balance to the owner.
    function withdrawNativeAll() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        (bool ok, ) = owner().call{value: bal}("");
        if (!ok) revert A7A5Account__WithdrawFailed();
        emit NativeWithdrawn(owner(), bal);
    }

    /// @notice Withdraw an ERC-721 NFT to the owner.
    function withdrawERC721(address nft, uint256 tokenId) external onlyOwner nonReentrant {
        IERC721(nft).safeTransferFrom(address(this), owner(), tokenId);
        emit ERC721Withdrawn(nft, owner(), tokenId);
    }

    /// @notice Withdraw ERC-1155 tokens to the owner.
    function withdrawERC1155(
        address nft,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external onlyOwner nonReentrant {
        IERC1155(nft).safeTransferFrom(address(this), owner(), id, amount, data);
        emit ERC1155Withdrawn(nft, owner(), id, amount);
    }

    // ── Receive ───────────────────────────────────────────────────────────────

    receive() external payable override {}

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _getStorage() private pure returns (A7A5AccountStorage storage $) {
        assembly {
            $.slot := A7A5ACCOUNT_STORAGE_SLOT
        }
    }
}
