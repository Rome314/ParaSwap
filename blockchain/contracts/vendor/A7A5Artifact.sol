// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {A7A5} from 'a7a5/contracts/A7A5.sol';

/// @dev Compile helper — produces a Hardhat artifact for the deployed A7A5 token ABI.
contract A7A5Artifact is A7A5 {
    constructor()
        A7A5(
            'A7A5',
            'A7A5',
            6,
            address(0x000000000000000000000000000000000001),
            address(0x000000000000000000000000000000000002),
            address(0x000000000000000000000000000000000003)
        )
    {}
}
