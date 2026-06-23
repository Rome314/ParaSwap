// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IApprovalAccount, TokenApproval} from "./IApprovalAccount.sol";

/**
 * @title A7A5AccountFactory
 * @notice CREATE2 factory for {A7A5WebAuthnAccount} minimal proxies, and registry of the
 * {A7A5EIP7702Account} delegate EOAs point their EIP-7702 designator at.
 *
 * `callData` is typically `initializeWebAuthn(qx, qy)` calldata; the salt is `keccak256(callData)`.
 * Creation-time approvals are intentionally excluded from the salt so custom amounts never change
 * the counterfactual address. Because of that, spenders are restricted to a whitelist fixed at
 * construction — otherwise a front-runner could deploy a victim's account with arbitrary approvals.
 */
contract A7A5AccountFactory {
    using Clones for address;
    using Address for address;

    address private immutable _impl;
    address private immutable _eip7702Delegate;
    mapping(address spender => bool allowed) public isAllowedSpender;

    error A7A5AccountFactory__InvalidImplementation();
    error A7A5AccountFactory__SpenderNotAllowed(address spender);

    event SpenderWhitelisted(address indexed spender);

    constructor(address impl_, address eip7702Delegate_, address[] memory allowedSpenders_) {
        if (impl_.code.length == 0) revert A7A5AccountFactory__InvalidImplementation();
        if (eip7702Delegate_.code.length == 0) revert A7A5AccountFactory__InvalidImplementation();
        _impl = impl_;
        _eip7702Delegate = eip7702Delegate_;
        for (uint256 i; i < allowedSpenders_.length; ++i) {
            isAllowedSpender[allowedSpenders_[i]] = true;
            emit SpenderWhitelisted(allowedSpenders_[i]);
        }
    }

    function getImplementation() external view returns (address) {
        return _impl;
    }

    /// @notice Delegate contract for EIP-7702 accounts (`0xef0100 || address` designator target).
    function getEip7702Implementation() external view returns (address) {
        return _eip7702Delegate;
    }

    function predictAddress(bytes calldata callData) public view returns (address) {
        return _impl.predictDeterministicAddress(keccak256(callData), address(this));
    }

    function cloneAndInitialize(bytes calldata callData) public returns (address) {
        return cloneAndInitializeWithApprovals(callData, new TokenApproval[](0));
    }

    /**
     * @notice Deploys the account and grants creation-time allowances in the same transaction.
     * Always consumes the account's approvals initializer, even for an empty list, so it can
     * never be claimed later by another caller.
     */
    function cloneAndInitializeWithApprovals(
        bytes calldata callData,
        TokenApproval[] memory approvals
    ) public returns (address) {
        for (uint256 i; i < approvals.length; ++i) {
            if (!isAllowedSpender[approvals[i].spender]) {
                revert A7A5AccountFactory__SpenderNotAllowed(approvals[i].spender);
            }
        }
        address predicted = predictAddress(callData);
        if (predicted.code.length == 0) {
            _impl.cloneDeterministic(keccak256(callData));
            predicted.functionCall(callData);
            IApprovalAccount(predicted).initializeApprovals(approvals);
        }
        return predicted;
    }
}
