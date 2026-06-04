// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {IAccount, PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";

// ── Mock Chainlink AggregatorV3Interface ─────────────────────────────────────

contract MockChainlinkFeed {
    int256 public answer;
    uint256 public updatedAt;
    uint8 private _dec;

    constructor(int256 answer_, uint256 updatedAt_, uint8 dec_) {
        answer = answer_;
        updatedAt = updatedAt_;
        _dec = dec_;
    }

    function setAnswer(int256 v) external { answer = v; }
    function setUpdatedAt(uint256 v) external { updatedAt = v; }

    function decimals() external view returns (uint8) { return _dec; }
    function description() external pure returns (string memory) { return "Mock"; }
    function version() external pure returns (uint256) { return 1; }

    function getRoundData(uint80) external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, updatedAt, 1);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, updatedAt, 1);
    }
}

// ── Mock wA7A5 token ──────────────────────────────────────────────────────────

contract MockWA7A5 {
    address private _a7a5;
    uint256 private _ratio;
    uint8 private _dec;

    constructor(address a7a5_, uint256 ratio_, uint8 dec_) {
        _a7a5 = a7a5_;
        _ratio = ratio_;
        _dec = dec_;
    }

    function A7A5() external view returns (address) { return _a7a5; }
    function getA7A5BywA7A5(uint256) external view returns (uint256) { return _ratio; }
    function decimals() external view returns (uint8) { return _dec; }
    function setRatio(uint256 r) external { _ratio = r; }

    // Stub IERC20 surface so the cast `IWA7A5(mockWA7A5)` compiles at runtime.
    function totalSupply() external pure returns (uint256) { return 0; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function allowance(address, address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function approve(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

// ── Mock ERC-20 token (used as stand-in A7A5 or USDT for decimal reads) ──────

contract MockToken {
    uint8 private _dec;
    constructor(uint8 dec_) { _dec = dec_; }
    function decimals() external view returns (uint8) { return _dec; }
}

// ── Mock Uniswap V3 pool oracle ───────────────────────────────────────────────

contract MockPool {
    address public token0;
    address public token1;
    int56[2] private _cumulatives;

    constructor(address t0, address t1) {
        token0 = t0;
        token1 = t1;
    }

    function setCumulatives(int56 older, int56 newer) external {
        _cumulatives[0] = older;
        _cumulatives[1] = newer;
    }

    function observe(uint32[] calldata) external view returns (int56[] memory ticks, uint160[] memory liq) {
        ticks = new int56[](2);
        ticks[0] = _cumulatives[0];
        ticks[1] = _cumulatives[1];
        liq = new uint160[](2);
    }

    // Stubs required by IUniswapV3PoolOracle.
    function slot0() external pure returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (0, 0, 0, 0, 0, 0, true);
    }
    function increaseObservationCardinalityNext(uint16) external {}
}

// ── Mock EntryPoint (lets tests call account.validateUserOp as the EP) ────────

contract MockEntryPoint {
    function callValidate(
        IAccount account,
        bytes32 userOpHash,
        uint256 missingFunds,
        bytes calldata sig
    ) external returns (uint256) {
        PackedUserOperation memory op;
        op.signature = sig;
        return account.validateUserOp(op, userOpHash, missingFunds);
    }

    receive() external payable {}
}

// ── Target contract that always reverts with a reason string ──────────────────

contract RevertingTarget {
    function fail() external pure {
        revert("target failed");
    }
}
