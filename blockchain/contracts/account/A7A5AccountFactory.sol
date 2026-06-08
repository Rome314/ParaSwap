// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title A7A5AccountFactory
 * @notice CREATE2 factory for {A7A5WebAuthnAccount} minimal proxies.
 *
 * `callData` is typically `initializeWebAuthn(qx, qy)` calldata; the salt is `keccak256(callData)`.
 */
contract A7A5AccountFactory {
    using Clones for address;
    using Address for address;

    address private immutable _impl;

    error A7A5AccountFactory__InvalidImplementation();

    constructor(address impl_) {
        if (impl_.code.length == 0) revert A7A5AccountFactory__InvalidImplementation();
        _impl = impl_;
    }

    function getImplementation() external view returns (address) {
        return _impl;
    }

    function predictAddress(bytes calldata callData) public view returns (address) {
        return _impl.predictDeterministicAddress(keccak256(callData), address(this));
    }

    function cloneAndInitialize(bytes calldata callData) public returns (address) {
        address predicted = predictAddress(callData);
        if (predicted.code.length == 0) {
            _impl.cloneDeterministic(keccak256(callData));
            predicted.functionCall(callData);
        }
        return predicted;
    }
}
