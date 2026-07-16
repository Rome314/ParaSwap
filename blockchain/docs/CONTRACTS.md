<!-- markdownlint-disable MD024 MD060 -->

# Contract API Reference

> **Units and FOT note** — Mainnet A7A5, wA7A5, and USDT use **6 decimals**. A7A5 is fee-on-transfer. Execution paths use balance-delta measurements where A7A5 crosses a taxed boundary; analytic fee calculations are for quotes only. Swap return values are the actual tokens received by the selected recipient.

---

## ParaSwap

`blockchain/contracts/ParaSwap.sol`

Multi-route DEX aggregator. Routes swaps across Uniswap V3 and PoolsFacade, with automatic two-hop bridging via USDT when one leg involves A7A5 or wA7A5.

### Constructor

```solidity
constructor(address _facade, address _v3Router, address owner_)
```

| Parameter | Type | Description |
|---|---|---|
| `_facade` | `address` | Deployed PoolsFacade contract |
| `_v3Router` | `address` | Uniswap V3 SwapRouter02 |
| `owner_` | `address` | Initial owner (pause rights) |

### State Variables (immutable)

| Name | Type | Description |
|---|---|---|
| `FACADE` | `IPoolsFacade` | PoolsFacade reference |
| `QUOTER` | `IQuoterV2` | V3 off-chain quoter |
| `A7A5_TOKEN` | `address` | A7A5 token |
| `WA7A5_TOKEN` | `address` | wA7A5 wrapper token |
| `USDT_TOKEN` | `address` | USDT token |
| `V3_ROUTER` | `ISwapRouter02` | Uniswap V3 router |

### Functions

#### `swap`

```solidity
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOutMin,
    uint24  fee,
    uint256 deadline
) external returns (uint256 amountOut)
```

The custom-recipient overload appends `address recipient`. Both overloads require `amountOutMin`; there is no slippage-unbounded generic API.

Execute a token swap. Routing is automatic based on the token pair (see [Architecture](ARCHITECTURE.md#swap-routing-paraswap)).

| Parameter | Description |
|---|---|
| `tokenIn` | Token being sold (caller must pre-approve this contract) |
| `tokenOut` | Token being bought |
| `amountIn` | Exact amount to spend |
| `amountOutMin` | Minimum output; reverts with `ParaSwap__InsufficientOutput` if not met |
| `fee` | Uniswap V3 fee tier for any V3 leg (e.g. `3000` = 0.3 %). Ignored for facade-only routes |
| `deadline` | Unix timestamp; reverts with `ParaSwap__Expired` if exceeded |

Returns the actual output received by the caller (post-FOT for A7A5 routes).

For a two-hop route, an intermediate leg may execute with a zero local minimum. The final leg and top-level recipient balance check enforce `amountOutMin` atomically. This is a final-output guarantee, not an independent bound on each intermediate price; use a recent quote, short deadline, appropriately tight minimum, and private submission for MEV-sensitive transactions.

#### `quote`

```solidity
function quote(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint24  fee
) external returns (uint256 amountOut)
```

Simulate a swap off-chain. Uses the same routing logic as `swap()`. **Not a view function** — the V3 quoter is state-mutating. Must be called via `eth_call` / `callStatic`.

### Events

```solidity
event Swapped(
    address indexed tokenIn,
    address indexed tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    address indexed recipient
)
```

Emitted after every successful `swap()`.

### Errors

| Error | Trigger |
|---|---|
| `ParaSwap__ZeroAmountIn()` | `amountIn == 0` |
| `ParaSwap__ZeroRecipient()` | Custom recipient is zero |
| `ParaSwap__Expired()` | `block.timestamp > deadline` |
| `ParaSwap__InsufficientAllowance(token, have, need)` | Caller hasn't approved enough |
| `ParaSwap__InsufficientOutput(actual, minimum)` | Output below `amountOutMin` |
| `ParaSwap__InvalidRoute(route)` | Internal route is unsupported |
| `ParaSwap__ZeroAddress()` | Constructor dependency is zero or facade exposes a zero dependency |

### Administration

`pause()` and `unpause()` are owner-only and gate every swap. Ownership is `Ownable2Step`: `transferOwnership(newOwner)` nominates, and `newOwner` must call `acceptOwnership()`.

---

## PoolsFacade

`blockchain/contracts/PoolsFacade.sol`

A7A5/USDT liquidity aggregator. Compares a direct Uniswap V2 path (A7A5↔USDT) against a mixed V3 path (A7A5↔wA7A5 wrap/unwrap + wA7A5↔USDT V3) and executes the better one.

### Constructor

```solidity
constructor(
    IWA7A5        _wA7A5Token,
    IA7A5         _a7A5Token,
    IERC20        _usdt,
    IUniswapV2Pair _v2Pair,
    ISwapRouter02 _v3Router,
    IQuoterV2     _v3Quoter,
    uint24        _wa7a5UsdtV3Fee,
    address       owner_
)
```

Reverts with `PoolsFacade__InvalidV2Pair` if the pair tokens don't match `_a7A5Token` and `_usdt`.

### State Variables (immutable)

| Name | Type | Description |
|---|---|---|
| `WA7A5` | `IWA7A5` | wA7A5 wrapper |
| `A7A5` | `IA7A5` | A7A5 token |
| `USDT` | `IERC20` | USDT token |
| `V2_PAIR` | `IUniswapV2Pair` | A7A5/USDT V2 pair |
| `V2_A7A5_IS_TOKEN0` | `bool` | Slot orientation in the V2 pair |
| `V3_ROUTER` | `ISwapRouter02` | V3 router |
| `V3_QUOTER` | `IQuoterV2` | V3 off-chain quoter |
| `WA7A5_USDT_V3_FEE` | `uint24` | wA7A5/USDT V3 pool fee tier |

### Functions

#### Generic `swap`

```solidity
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOutMin,
    uint256 deadline
) public returns (uint256 amountOut)

function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOutMin,
    uint256 deadline,
    address recipient
) public returns (uint256 amountOut)
```

Dispatches supported A7A5/wA7A5/USDT pairs to the appropriate specialized swap. It rejects unsupported or identical token pairs. `amountOutMin` is mandatory and is checked against the recipient's actual output.

#### `swapA7A5`

```solidity
function swapA7A5(
    uint256 amountIn,
    SIDE    side,
    uint256 amountOutMin,
    uint256 deadline
) external returns (uint256 amountOut)
```

Direct A7A5↔USDT swap through the V2 pair. Always uses the DIRECT strategy. Bypasses UniswapV2Router02 for gas efficiency.

- **SELL** (`A7A5 → USDT`): FOT hits the input side. The pair receives less than `amountIn`; pair input is measured via balance-delta.
- **BUY** (`USDT → A7A5`): FOT hits the output side. The caller receives less than the pair sends; output is measured via balance-delta.

#### `swapWA7A5`

```solidity
function swapWA7A5(
    uint256 amountIn,
    SIDE    side,
    uint256 amountOutMin,
    uint256 deadline
) external returns (uint256 amountOut)
```

wA7A5↔USDT swap via Uniswap V3. Neither token is FOT; no balance-delta needed.

#### `swapA7A5AtBestQuote`

```solidity
function swapA7A5AtBestQuote(
    uint256 amountIn,
    SIDE    side,
    uint256 amountOutMin,
    uint256 deadline
) external returns (uint256 amountOut)
```

A7A5↔USDT swap at the best available price. Calls `getBestQuoteA7A5PerUSDT` internally to pick DIRECT vs MIXED, then executes atomically. `amountOut` is always the actual post-FOT tokens received by the caller.

#### `getBestQuoteA7A5PerUSDT`

```solidity
function getBestQuoteA7A5PerUSDT(
    uint256 amountIn,
    SIDE    side
) public returns (uint256 amountOut, STRATEGY strategy)
```

Compare both paths off-chain and return the best output + winning strategy. **Not a view** — calls the V3 quoter. Must be called via `eth_call` / `callStatic`.

The returned `amountOut` nets out FOT hops inside the facade: DIRECT has one and MIXED has two. ParaSwap additionally models caller-to-ParaSwap A7A5 transfers. MIXED SELL is caller → facade → wrapper; MIXED BUY is wrapper → facade → recipient.

#### `quoteA7A5PerUSDT`

```solidity
function quoteA7A5PerUSDT(uint256 amountIn, SIDE side) public view returns (uint256 amountOut)
```

Quote the V2 direct path only (view, no V3 quoter call). Applies the 0.3 % V2 fee and one FOT deduction.

#### `quoteWA7A5PerUSDT`

```solidity
function quoteWA7A5PerUSDT(uint256 amountIn, SIDE side) public returns (uint256 amountOut)
```

Quote the V3 wA7A5/USDT path. Not a view; must be called via `eth_call`.

#### `getA7A5EffectiveOutput`

```solidity
function getA7A5EffectiveOutput(uint256 amountIn) public view returns (uint256 effectiveOut)
```

Apply one A7A5 transfer-tax deduction analytically. Used for off-chain quoting; execution paths use balance-deltas instead.

#### Allowance helpers (view)

```solidity
function allowanceUSDT(address owner)  external view returns (uint256)
function allowanceA7A5(address owner)  external view returns (uint256)
function allowanceWA7A5(address owner) external view returns (uint256)
```

Returns `owner`'s current allowance for this facade for the named token. These are convenience helpers for frontends to check whether a swap call will revert due to insufficient allowance before sending the transaction.

### Events

```solidity
event A7A5Swapped(
    address indexed user,
    address indexed recipient,
    SIDE side,
    STRATEGY strategy,
    uint256 amountIn,
    uint256 amountOut
)
event WA7A5Swapped(
    address indexed user,
    address indexed recipient,
    SIDE side,
    uint256 amountIn,
    uint256 amountOut
)
```

### Errors

| Error | Trigger |
|---|---|
| `PoolsFacade__InvalidV2Pair()` | Constructor: pair tokens don't match A7A5/USDT |
| `PoolsFacade__ZeroAmountIn()` | `amountIn == 0` |
| `PoolsFacade__Expired()` | Deadline has passed |
| `PoolsFacade__InsufficientOutput()` | Actual recipient output is below `amountOutMin` |
| `PoolsFacade__ZeroOutput()` | V2 calculation yields zero |
| `PoolsFacade__EmptyReserves()` | V2 input or output reserve is zero |
| `PoolsFacade__InsufficientAllowance()` | Caller allowance is below gross input |
| `PoolsFacade__TransferFailed()` | ERC-20 `transfer` failed |
| `PoolsFacade__TransferFromFailed()` | ERC-20 `transferFrom` failed |
| `PoolsFacade__ApproveFailed()` | ERC-20 approval failed |
| `PoolsFacade__ZeroRecipient()` | Recipient is zero |
| `PoolsFacade__InvalidToken()` | Generic pair is unsupported or identical |
| `PoolsFacade__ZeroAddress()` | Constructor dependency is zero |

### Administration

`pause()` and `unpause()` are owner-only. Ownership uses the same two-step nomination/acceptance model as ParaSwap.

---

## A7A5AccountFactory

`blockchain/contracts/account/A7A5AccountFactory.sol`

CREATE2 factory for `A7A5WebAuthnAccount` minimal proxies and registry for `A7A5EIP7702Account` delegate addresses.

### Constructor

```solidity
constructor(address impl_, address eip7702Delegate_, address[] memory allowedSpenders_)
```

Reverts with `A7A5AccountFactory__InvalidImplementation` if either `impl_` or `eip7702Delegate_` is not a deployed contract.

Emits `SpenderWhitelisted(spender)` for each address in `allowedSpenders_`.

### Functions

#### `predictAddress`

```solidity
function predictAddress(bytes calldata callData) public view returns (address)
```

Compute the counterfactual address for an account before deploying. The salt is `keccak256(callData)`. Typical `callData` is `abi.encodeWithSelector(A7A5WebAuthnAccount.initializeWebAuthn.selector, qx, qy)`.

The same WebAuthn credentials always produce the same address regardless of the creation-time approval amounts, because approvals are excluded from the salt.

#### `cloneAndInitialize`

```solidity
function cloneAndInitialize(bytes calldata callData) public returns (address)
```

Deploy a new account and call its initializer. No creation-time approvals. If the account is already deployed, returns the existing address without re-deploying.

#### `cloneAndInitializeWithApprovals`

```solidity
function cloneAndInitializeWithApprovals(
    bytes         calldata callData,
    TokenApproval[] memory approvals
) public returns (address)
```

Deploy + initialize + grant ERC-20 allowances atomically. Every spender in `approvals` must be in the whitelist set at construction, otherwise reverts with `A7A5AccountFactory__SpenderNotAllowed`. The approvals reinitializer is always consumed (even for an empty list) so it cannot be claimed later.

#### `getImplementation` / `getEip7702Implementation`

```solidity
function getImplementation()        external view returns (address)
function getEip7702Implementation() external view returns (address)
```

Return the implementation addresses set at construction.

#### `isAllowedSpender`

```solidity
mapping(address => bool) public isAllowedSpender
```

Returns `true` if `spender` is permitted in creation-time approvals.

### Events

```solidity
event SpenderWhitelisted(address indexed spender)
```

### Errors

| Error | Trigger |
|---|---|
| `A7A5AccountFactory__InvalidImplementation()` | Constructor: impl or delegate has no code |
| `A7A5AccountFactory__SpenderNotAllowed(spender)` | `cloneAndInitializeWithApprovals`: spender not whitelisted |

---

## Account and factory variants

### `A7A5WebAuthnAccount`

Minimal-clone ERC-4337 account initialized with P-256/WebAuthn public-key coordinates. It is deployed by `A7A5AccountFactory` and supports creation-time approvals. It is not UUPS-upgradeable.

### `A7A5EIP7702Account`

An ERC-4337 delegate implementation for EOAs using EIP-7702. The delegate address is published by `A7A5AccountFactory.getEip7702Implementation()`; it is not a factory-created clone.

### `A7A5Account` and `A7A5AccountFactoryV2`

`A7A5Account` is an ECDSA `personal_sign` ERC-4337 account deployed behind an ERC-1967 proxy. It supports ERC-7821 execution, token/NFT/native withdrawals, owner-managed approvals, and owner-authorized UUPS upgrades.

```solidity
function predictAddress(address owner_) public view returns (address)
function deployAccount(address owner_) public returns (address)
function deployAccountWithApprovals(
    address owner_,
    TokenApproval[] memory approvals
) public returns (address)
```

`A7A5AccountFactoryV2` derives its CREATE2 salt from the owner address. Like the WebAuthn factory, it validates creation-time approvals against an immutable spender allowlist and consumes the approval initializer even for an empty list.

`SimpleA7A5Account` is not deployed by the production `AccountSystem` module.

---

## Production oracle and paymaster APIs

`A7A5UsdtTwapOracle` exposes `latestAnswer()`, Chainlink-compatible `latestRoundData()`, `twapWindow()`, and owner-only `setTwapWindow(uint32)`. It emits `TwapWindowUpdated(oldWindow, newWindow)`. The minimum window is five minutes; production parameters currently request 30 minutes.

`A7A5NativeOracle` combines the A7A5/USDT TWAP with Chainlink USDT/ETH. Its owner can update maximum staleness, and it emits `MaxStalenessUpdated(oldMaxStaleness, newMaxStaleness)`.

`UsdtNativeOracle` reads Chainlink USDT/ETH directly and emits `UsdtMaxStalenessUpdated(oldMaxStaleness, newMaxStaleness)` when its owner updates the bound.

`A7A5Paymaster` and `UsdtPaymaster` expose `gasToken()`, `oracle()`, owner-only `setOracle(...)`, `pause()`, and `unpause()`, in addition to inherited EntryPoint deposit/stake operations. Each emits `OracleUpdated(oldOracle, newOracle)`. A7A5 prefunding grosses up the token pull for its transfer fee and records the actual received delta.

All production oracles and paymasters use `Ownable2Step`. `A7A5UsdtV2Oracle` is a spot-reserve reference implementation only and must not be used for production sponsorship.

---

## Types

### `SIDE` enum

```solidity
enum SIDE { BUY, SELL }
```

- `BUY`  — spend USDT, receive A7A5 (or wA7A5)
- `SELL` — spend A7A5 (or wA7A5), receive USDT

### `STRATEGY` enum

```solidity
enum STRATEGY { DIRECT, MIXED }
```

- `DIRECT` — A7A5↔USDT via the Uniswap V2 pair
- `MIXED`  — A7A5↔wA7A5 wrap/unwrap + wA7A5↔USDT via Uniswap V3

### `TokenApproval` struct

```solidity
struct TokenApproval {
    address token;
    address spender;
    uint256 amount;
}
```

Used by `A7A5AccountFactory.cloneAndInitializeWithApprovals` and `IApprovalAccount.initializeApprovals`.
