// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {A7A5Account} from "./A7A5Account.sol";
import {IApprovalAccount, TokenApproval} from "./IApprovalAccount.sol";

/**
 * @title A7A5AccountFactoryV2
 * @notice CREATE2 factory for {A7A5Account} UUPS proxies.
 *
 * @dev Separate from {A7A5AccountFactory} because EIP-1167 minimal clones (used by that
 * factory) cannot be upgraded — UUPS upgradeability requires an ERC-1967 proxy.
 *
 * Address determinism: salt = keccak256(abi.encodePacked(owner_)), making each owner's
 * counterfactual address unique and stable regardless of the approval amounts. A whitelist
 * of allowed spenders prevents a front-runner from setting arbitrary allowances by
 * racing to call initializeApprovals after the proxy is created.
 *
 * Initialization is always two-step within a single transaction:
 *   1. Proxy constructor → delegatecall → A7A5Account.initialize(owner_) [reinitializer v1]
 *   2. Factory calls initializeApprovals(approvals)                      [reinitializer v2]
 * Both run atomically, so the approvals slot is never left open.
 */
contract A7A5AccountFactoryV2 {
    address private immutable _impl;
    mapping(address spender => bool allowed) public isAllowedSpender;

    error A7A5AccountFactoryV2__InvalidImplementation();
    error A7A5AccountFactoryV2__SpenderNotAllowed(address spender);

    event SpenderWhitelisted(address indexed spender);

    constructor(address impl_, address[] memory allowedSpenders_) {
        if (impl_.code.length == 0) revert A7A5AccountFactoryV2__InvalidImplementation();
        _impl = impl_;
        for (uint256 i; i < allowedSpenders_.length; ++i) {
            isAllowedSpender[allowedSpenders_[i]] = true;
            emit SpenderWhitelisted(allowedSpenders_[i]);
        }
    }

    function getImplementation() external view returns (address) {
        return _impl;
    }

    /**
     * @notice Compute the counterfactual address for a given owner.
     * Stable as long as the factory address and implementation address do not change.
     */
    function predictAddress(address owner_) public view returns (address) {
        bytes32 salt = _salt(owner_);
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(type(ERC1967Proxy).creationCode, abi.encode(_impl, _initData(owner_)))
        );
        return
            address(
                uint160(
                    uint256(
                        keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash))
                    )
                )
            );
    }

    /**
     * @notice Deploy proxy + initialize(owner_). Always seals the approvals reinitializer.
     * Idempotent: returns the existing address if the proxy already exists.
     */
    function deployAccount(address owner_) public returns (address) {
        return deployAccountWithApprovals(owner_, new TokenApproval[](0));
    }

    /**
     * @notice Deploy proxy + initialize + grant creation-time ERC-20 allowances.
     * All spenders must be whitelisted in the factory. Idempotent.
     */
    function deployAccountWithApprovals(
        address owner_,
        TokenApproval[] memory approvals
    ) public returns (address) {
        for (uint256 i; i < approvals.length; ++i) {
            if (!isAllowedSpender[approvals[i].spender]) {
                revert A7A5AccountFactoryV2__SpenderNotAllowed(approvals[i].spender);
            }
        }
        address predicted = predictAddress(owner_);
        if (predicted.code.length == 0) {
            new ERC1967Proxy{salt: _salt(owner_)}(_impl, _initData(owner_));
            IApprovalAccount(predicted).initializeApprovals(approvals);
        }
        return predicted;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _salt(address owner_) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner_));
    }

    function _initData(address owner_) private pure returns (bytes memory) {
        return abi.encodeCall(A7A5Account.initialize, (owner_));
    }
}
