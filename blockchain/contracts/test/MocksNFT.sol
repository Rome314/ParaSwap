// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// ── Mock mintable ERC-721 ─────────────────────────────────────────────────────

contract MockERC721 is ERC721 {
    constructor() ERC721("MockNFT", "MNFT") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

// ── Mock mintable ERC-1155 ────────────────────────────────────────────────────

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

// ── Non-payable receiver (rejects ETH transfers) ──────────────────────────────

contract NonPayableReceiver {
    // Intentionally has no receive() — any ETH transfer to this contract reverts.
}
