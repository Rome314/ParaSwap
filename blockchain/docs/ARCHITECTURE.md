# Architecture

## System overview

The protocol combines:

- `PoolsFacade`, an A7A5/wA7A5/USDT router that compares the direct V2 A7A5 pool with the mixed wA7A5 V3 path.
- `ParaSwap`, a general ERC-20 router that delegates A7A5-family legs to `PoolsFacade` and uses Uniswap V3 for other legs.
- ERC-4337 WebAuthn, EIP-7702, and ECDSA/UUPS account variants.
- A7A5 and USDT paymasters backed by native-denominated price oracles.

## Token units and fee-on-transfer accounting

A7A5, wA7A5, and mainnet USDT use **6 decimals**. Never format A7A5 with 18 decimals or assume wrapper shares have 18 decimals. Read token metadata where possible and use `parseUnits(value, 6)` / `formatUnits(value, 6)` for the current mainnet tokens.

A7A5 charges a fee on every `transfer` and `transferFrom`:

```text
received = amount * (FEE_PRECISION - basisPointsRate) / FEE_PRECISION
```

Execution measures the relevant balance before and after each taxed transfer. The analytic `getA7A5EffectiveOutput()` helper is only for quoting. This distinction matters because the fee rate can change between a prior quote and execution.

wA7A5 is the non-FOT wrapper used in concentrated liquidity. Wrapping and unwrapping can themselves move A7A5 across taxed boundaries; the quote logic models those transfers rather than treating conversion as tax-free.

## ParaSwap routing

`ParaSwap` classifies a pair with two bits: bit 1 says the input is A7A5 or wA7A5, and bit 0 says the output is A7A5 or wA7A5.

```text
00  ERC20 -> ERC20:       one Uniswap V3 leg
01  ERC20/USDT -> family: optional V3 to USDT, then PoolsFacade
10  family -> USDT/ERC20: PoolsFacade, then optional V3 from USDT
11  A7A5 <-> wA7A5:      direct wrap/unwrap
```

Route 11 quoting mirrors execution:

- A7A5 to wA7A5 applies the caller-to-ParaSwap FOT transfer and the ParaSwap-to-wrapper FOT transfer before converting to shares.
- wA7A5 to A7A5 applies the wrapper-to-ParaSwap FOT transfer and the ParaSwap-to-recipient FOT transfer after converting shares.

The generic `ParaSwap.swap` overloads require `amountOutMin` and a deadline. Custom-recipient overloads measure the recipient's actual balance delta. `quote()` is state-mutating at the ABI level because it calls QuoterV2; integrations must invoke it with `eth_call`.

### Multi-hop slippage and MEV

For two-hop routes, the intermediate leg deliberately uses a zero minimum and the terminal leg/top-level recipient delta enforces `amountOutMin`. The transaction is atomic: if final output is below the user's minimum, every leg reverts.

This protects final proceeds but does not impose a separate price bound on the temporary USDT amount. Searchers can worsen the intermediate fill while still satisfying a loose final minimum. Integrators must use a recent quote, a short deadline, conservative final slippage, and private transaction submission where appropriate. Operators needing independent per-leg bounds must add a different API; the current API exposes only a final-output bound.

## PoolsFacade routing and FOT flows

The generic facade API is:

```solidity
swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline)
swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline, recipient)
```

There is no unbounded generic swap overload. The dispatcher only accepts A7A5, wA7A5, and USDT, rejects identical tokens, and selects the specialized route.

For A7A5/USDT, `getBestQuoteA7A5PerUSDT()` compares:

```text
DIRECT: A7A5 <-> V2 A7A5/USDT pair
MIXED:  A7A5 <-> wA7A5 <-> V3 wA7A5/USDT pool
```

Facade-internal FOT accounting is:

- DIRECT SELL: A7A5 caller to V2 pair, one FOT transfer; pair input is measured.
- DIRECT BUY: V2 pair to recipient, one FOT transfer; recipient output is measured.
- MIXED SELL: caller to facade, then facade to wrapper, two FOT transfers before the V3 leg.
- MIXED BUY: wrapper to facade during unwrap, then facade to recipient, two FOT transfers after the V3 leg.

When `ParaSwap` first receives A7A5, its caller-to-router transfer is an additional external FOT hop. Facade quotes model only facade-internal hops; `ParaSwap.quote()` adds its own external hop where applicable.

The direct route bypasses UniswapV2Router02 and calls the pair directly. V2 BUY output is not inferred from the analytic fee formula: the recipient's actual A7A5 balance delta is authoritative.

## Accounts and factories

Two factory families are deployed:

- `A7A5AccountFactory` deploys deterministic EIP-1167 `A7A5WebAuthnAccount` clones and publishes the `A7A5EIP7702Account` delegate. Its salt is `keccak256(callData)`.
- `A7A5AccountFactoryV2` deploys deterministic ERC-1967 proxies for the ECDSA `A7A5Account`. Its salt is derived from the owner address. The account is UUPS-upgradeable, and only that account's owner can authorize an upgrade.

Both factories support atomic creation-time ERC-20 approvals. Allowed spenders are immutable factory-construction choices; approval values do not affect the counterfactual address. The approvals reinitializer is consumed even for an empty list, preventing a later caller from claiming initialization.

`SimpleA7A5Account` is a simpler account implementation used by legacy/examples and is not deployed by the mainnet `AccountSystem` module.

## Oracle and paymaster policy

Production A7A5 pricing is:

```text
wA7A5/USDT Uniswap V3 TWAP
  -> wrapper ratio to USDT/A7A5
  -> Chainlink USDT/ETH
  -> A7A5 base units per native token
```

The mainnet stack must use `A7A5UsdtTwapOracle` through `A7A5NativeOracle`. `A7A5UsdtV2Oracle` reads manipulable spot reserves and is **reference/test-only; it must never be wired into a production paymaster**. The TWAP pool must have non-trivial liquidity and enough observation history for the configured window before deployment.

Both paymasters are funded and staked at EntryPoint during deployment. A7A5 prefunding grosses up the FOT pull and records the actual amount received. Oracle staleness is propagated into ERC-4337 validation data.

## Ownership and administration

`PoolsFacade`, `ParaSwap`, both paymasters, and all three production oracle contracts use `Ownable2Step`. Ignition deploys them with the deployer as initial owner, then calls `transferOwnership(PRODUCTION_OWNER)`. This only nominates the production multisig: the multisig must separately call `acceptOwnership()` on every contract.

- Facade and ParaSwap owners can pause/unpause swaps.
- Paymaster owners can pause sponsorship, manage EntryPoint stake/deposit/withdrawal, and replace the paymaster oracle.
- Oracle owners can change the TWAP window or Chainlink maximum staleness, subject to contract minimums.
- Factories have no owner and their spender allowlists cannot be changed.

See [DEPLOY.md](DEPLOY.md) for the required acceptance and verification checklist.

## Deployment records

Canonical deployment outputs are Ignition artifacts under `ignition/deployments/<chain-id>/`. Constructor templates live in `ignition/parameters/`; operator-injected generated parameters live in the ignored `.ignition-parameters/` directory. Published consumers must use reviewed addresses from the completed deployment, not stale historical files.
