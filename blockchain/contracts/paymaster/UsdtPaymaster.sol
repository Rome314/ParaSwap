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

import {UsdtNativeOracle} from "../oracle/UsdtNativeOracle.sol";
import {ITokenPaymaster} from "./ITokenPaymaster.sol";

error UsdtPaymaster__ZeroAddress();

/**
 * @title UsdtPaymaster
 * @notice ERC-4337 paymaster that accepts USDT for gas (standard ERC-20, no FOT gross-up).
 */
contract UsdtPaymaster is
    PaymasterERC20,
    Ownable2Step,
    Pausable,
    ITokenPaymaster
{
    using ERC4337Utils for PackedUserOperation;
    using SafeERC20 for IERC20;

    IEntryPoint private immutable _ENTRY_POINT;
    IERC20 public immutable USDT;
    UsdtNativeOracle private _oracle;

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    constructor(
        IEntryPoint entryPoint_,
        IERC20 usdt_,
        UsdtNativeOracle oracle_,
        address owner_
    ) Ownable(owner_) {
        if (
            address(entryPoint_) == address(0) ||
            address(usdt_) == address(0) ||
            address(oracle_) == address(0)
        ) {
            revert UsdtPaymaster__ZeroAddress();
        }
        _ENTRY_POINT = entryPoint_;
        USDT = usdt_;
        _oracle = oracle_;
    }

    /// @inheritdoc ITokenPaymaster
    function gasToken() external view returns (address) {
        return address(USDT);
    }

    /// @inheritdoc ITokenPaymaster
    function oracle() external view returns (address) {
        return address(_oracle);
    }

    function setOracle(UsdtNativeOracle newOracle) external onlyOwner {
        if (address(newOracle) == address(0))
            revert UsdtPaymaster__ZeroAddress();
        emit OracleUpdated(address(_oracle), address(newOracle));
        _oracle = newOracle;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function entryPoint() public view override returns (IEntryPoint) {
        return _ENTRY_POINT;
    }

    function _authorizeWithdraw() internal override onlyOwner {}

    function _fetchDetails(
        PackedUserOperation calldata /* userOp */,
        bytes32 /* userOpHash */
    )
        internal
        view
        override
        returns (uint256 validationData, IERC20 token, uint256 tokenPrice)
    {
        token = USDT;
        if (paused()) {
            return (ERC4337Utils.SIG_VALIDATION_FAILED, token, 0);
        }
        uint48 validUntil;
        (tokenPrice, validUntil) = _oracle.tokenPriceData();
        validationData = ERC4337Utils.packValidationData(true, 0, validUntil);
    }
}
