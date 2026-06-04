# A7A5 Protocol Dashboard — Architecture Reference

## Tab Layout

The dashboard is split into four tabs, each with a distinct purpose and data source.

### 1. Wallet
**Who uses it:** end users checking their balances.

| Section | Data source |
|---------|------------|
| A7A5 (ERC-20) balance | `useBalances()` → `tokens[0].balance` |
| wA7A5 (ERC-20) balance | `useBalances()` → `tokens[1].balance` |
| wA7A5 → A7A5 unwrap preview | `wA7A5_display × (totalLiquidity / totalShares)` |
| ETH balance | `useBalances()` → `eth` |
| Annual yield estimate | `a7a5Balance × 0.145` (14.5% APR, CBR − 1%) |
| A7A5 TRC-20 balance | TronGrid API: `GET /v1/accounts/{tronAddr}` |

The unwrap preview is computed client-side using the live `wrappedRate = rawTotalLiquidity / rawTotalShares`. No contract call is needed beyond what `useProtocolState` already fetches.

---

### 2. Protocol Overview
**Who uses it:** observers, analysts, auditors.

| Section | Data source |
|---------|------------|
| EVM stats (liquidity, shares, fee, pause) | `useProtocolState()` → `fetchProtocolState()` via multicall |
| TRON total supply | TronGrid API: `POST /wallet/triggerconstantcontract` (totalSupply()) |
| Recent protocol events | `useEvents()` → `fetchRecentEvents()` via `provider.getLogs()` |
| Permissioned addresses (owner, compliance, accountant) | `useRoles()` → `fetchRoles()` via multicall |
| Contract addresses | Static from `getAddresses(chainId)` + hardcoded TRC-20 address |

#### Event filtering
`fetchRecentEvents` scans the last **2000 blocks** (~8 hours on Ethereum mainnet). It fetches all logs from the A7A5 contract address and filters by topic hash, **excluding** Transfer and Approval. Events shown:

| Event | Meaning |
|-------|---------|
| `Issue` | Owner minted new A7A5 |
| `Burn` | Owner burned A7A5 |
| `Blacklisted` | Address frozen by Compliance |
| `DeBlacklisted` | Address unfrozen |
| `DestroyedBlackFunds` | Frozen address's funds destroyed |
| `TotalLiquidityUpdated` | Interest distribution (daily yield) |
| `Paused` / `Unpaused` | Protocol pause state change |
| `BasisPointsRateUpdated` | Transfer fee changed |

---

### 3. Admin
**Who uses it:** Owner, Accountant, Compliance multisig signers.

Role detection compares the connected wallet address (from wagmi `useAccount`) against addresses returned by `useRoles()`. The derived `userRole` is one of `"owner" | "compliance" | "accountant" | null`.

| Role | Enabled actions |
|------|----------------|
| `owner` | Issue tokens, Burn tokens, Set fee rate, Pause/Unpause |
| `accountant` | Distribute interest (update `_totalLiquidity`) |
| `compliance` | Blacklist address, Remove from blacklist, Destroy black funds |
| `null` | All buttons disabled, warning banner shown |

Sections for roles the connected user does not hold are rendered at 50% opacity with a transparent overlay that blocks pointer events.

All three roles are **immutable** — set at contract deployment. There is no way to change them without redeploying.

---

### 4. Actions
**Who uses it:** token holders performing ERC-20 operations.

| Panel | Actions |
|-------|---------|
| Wrap / Unwrap | Convert A7A5 ↔ wA7A5 with live exchange rate preview |
| Transfer | Send A7A5 to any address (fee deducted per `basisPointsRate`) |
| Approve | Grant spender allowance (e.g. wA7A5 contract before wrapping) |
| Query | Read `balanceOf`, `sharesOf`, `isBlackListed` for any address |

---

## Data Fetching Architecture

### Hooks

| Hook | File | Interval | Purpose |
|------|------|----------|---------|
| `useProtocolState` | `hooks/useProtocolState.ts` | 10 s | Global liquidity, shares, fee, pause state |
| `useBalances` | `hooks/useBalances.ts` | 5 s | Per-user token balances + A7A5 state |
| `useRoles` | `hooks/useRoles.ts` | 30 s | Owner / compliance / accountant addresses |
| `useEvents` | `hooks/useEvents.ts` | 15 s | Recent non-transfer contract events |

All hooks are backed by `@tanstack/react-query`. They are **disabled** when no supported chain is connected; the dashboard falls back to mainnet read-only data for `useProtocolState`.

### API functions (`lib/api.ts`)

| Function | What it does |
|----------|-------------|
| `fetchProtocolState` | Multicall: totalSupply, totalShares, basisPointsRate, paused |
| `fetchBalances` | Multicall: user's A7A5/wA7A5/USDT/ETH balances + A7A5 state |
| `fetchRoles` | Multicall: owner(), compliance(), accountant() |
| `fetchRecentEvents` | getLogs over last 2000 blocks, decoded via Interface, Transfer/Approval excluded |
| `fetchAddressQuery` | Multicall: balanceOf, sharesOf, isBlackListed for arbitrary address |
| `fetchTrc20Balance` | GET `https://api.trongrid.io/v1/accounts/{addr}` → parse trc20 array |
| `fetchTrc20TotalSupply` | POST `https://api.trongrid.io/wallet/triggerconstantcontract` → decode hex |

---

## TRON Integration Status

TRON is **read-only** in the current implementation. Wagmi does not support TRON (EVM-only), so no wallet connection or transaction signing is possible from the dashboard for TRC-20 operations.

| Chain | Status | How accessed |
|-------|--------|-------------|
| Ethereum mainnet | Full read + simulated writes | wagmi + ethers JsonRpcProvider |
| Ethereum Sepolia | Full read + simulated writes | wagmi + ethers JsonRpcProvider |
| Hardhat (local fork) | Full read + simulated writes | ethers JsonRpcProvider (localhost:8545) |
| TRON mainnet | Read-only (balance + supply) | TronGrid public REST API |

TRC-20 contract address: `TLeVfrdym8RoJreJ23dAGyfJDygRtiWKBZ`
TRC-20 decimals: 6 (same as ERC-20)

On TRON, `totalSupply()` returns `_totalSupply` (raw share units), unlike Ethereum where `totalSupply()` returns `_totalLiquidity`. Keep this in mind when comparing supply figures across chains.

---

## Contract Role Summary

| Role | Address getter | Functions it controls | Multisig quorum |
|------|---------------|----------------------|-----------------|
| Owner | `A7A5.owner()` | `issue`, `burn`, `pause`, `unpause`, `updateBasisPointsRate` | 3 / 5 |
| Accountant | `A7A5.accountant()` | `distributeInterest` | 3 / 5 |
| Compliance | `A7A5.compliance()` | `addBlackList`, `removeBlackList`, `destroyBlackFunds` | 5 / 5 |

All roles are stored as `address immutable` in the A7A5 constructor. The multisig logic lives in a separate governance contract (not part of this repo).
