# Deployment (mainnet & Sepolia)

Deployments use Hardhat Ignition under `blockchain/ignition/modules/`.

## Modules

| Module | Network | Deploys |
|--------|---------|---------|
| `A7A5AA` | Mainnet | Full stack: oracles, paymasters, WebAuthn factory, PoolsFacade, ParaSwap |
| `A7A5AA_Sepolia` | Sepolia | AA stack only: mock-backed oracles, paymasters, WebAuthn factory (no swap contracts) |
| `SepoliaMocks` | Sepolia | Mock A7A5/USDT/wA7A5, mock V3 pool, mock Chainlink USDT/ETH |
| `OracleStack` | Mainnet | TWAP + native oracles (real mainnet pools/feeds) |
| `Paymasters` | Both | A7A5 + USDT ERC-4337 paymasters |
| `AccountSystem` | Both | WebAuthn implementation + factory |
| `SwapStack` | Mainnet only | PoolsFacade + ParaSwap |

Parameters: `blockchain/ignition/parameters/mainnet.json` and `sepolia.json`.

## Prerequisites

```bash
cd blockchain
cp .env.example .env
# Required:
#   ALCHEMY_API_KEY          — Sepolia RPC (or set SEPOLIA_RPC_URL)
#   DEPLOYER_PRIVATE_KEY     — funded Sepolia account
# Optional:
#   ETHERSCAN_API_KEY        — for --verify on deploy
```

Fund the deployer with Sepolia ETH (faucet). Paymaster module deposits **1 ETH** deposit + **0.5 ETH** stake per paymaster (configurable in `sepolia.json`).

## Sepolia deploy

Sepolia has **no A7A5 tokens or project pools**. The Sepolia module deploys **mocks** for pricing and paymaster settlement tokens. Swap contracts are **not** deployed.

```bash
cd blockchain

# Validate the deployment plan (no broadcast, no key required)
npm run deploy:sepolia:dry-run

# Broadcast to Sepolia + verify on Etherscan
npm run deploy:sepolia
```

`deploy:sepolia:dry-run` runs `hardhat ignition visualize` (writes `cache/visualization/index.html`). Ignition has no `--dry-run` broadcast flag. A full local `--network hardhat` deploy fails at paymaster funding because the canonical EntryPoint is not on the in-process Hardhat chain — use Sepolia for end-to-end deploy.

Equivalent command:

```bash
hardhat ignition deploy ignition/modules/A7A5AA_Sepolia.ts \
  --network sepolia \
  --parameters ignition/parameters/sepolia.json \
  --verify
```

### Sepolia parameter defaults (`ignition/parameters/sepolia.json`)

| Parameter | Value | Notes |
|-----------|-------|-------|
| `entryPoint` | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | EntryPoint v0.8 (canonical) |
| `depositWei` / `stakeWei` | `1000000000000000000` / `500000000000000000` | 1 ETH / 0.5 ETH per paymaster on EntryPoint |
| `twapWindow` | `60` | TWAP seconds (mock pool) |
| `maxStaleness` | `172800` | 2 days oracle staleness |
| `ethPerUsdt` | `400000000000000` | Mock Chainlink: ~1/2500 ETH per USDT (18 dec) |
| `feedUpdatedAt` | `1704067200` | **Update to recent unix time before deploy** |
| `wa7a5Ratio` | `1000000` | 1 wA7A5 = 1 A7A5 (6 dec) |
| `twapCumulativeOlder/Newer` | `-276324` / `0` | Mock pool TWAP tick cumulatives |

Reference constants (not used when mocks deploy): `blockchain/common/addresses-sepolia.ts` — Sepolia Uniswap periphery, Circle test USDT, Chainlink ETH/USD.

### Post-deploy (Sepolia)

1. Record deployed addresses from Ignition output (or `ignition/deployments/chain-11155111/`).
2. Mint/transfer mock **A7A5** and **USDT** to test accounts (MockToken has no mint — redeploy with a mintable mock or transfer from deployer if extended).
3. Update frontend `.env`:
   - `VITE_ENTRYPOINT=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`
   - `VITE_ACCOUNT_FACTORY=<accountFactory>`
   - `VITE_A7A5_PAYMASTER=<a7a5Paymaster>`
   - `VITE_USDT_PAYMASTER=<usdtPaymaster>`
   - `VITE_BUNDLER_URL=<your bundler>`
4. Refresh mock Chainlink `feedUpdatedAt` if quotes revert with stale price (redeploy or call `setUpdatedAt` on the mock feed).

## Mainnet deploy

```bash
cd blockchain
npm run deploy:mainnet
```

Uses `ignition/modules/A7A5AA.ts` and `parameters/mainnet.json` (real mainnet token/pool/feed addresses from `common/addresses.ts`).

## EntryPoint

EntryPoint v0.8: `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (same address on mainnet and Sepolia).

No Gas Manager or third-party sponsorship — users pay gas in A7A5 or USDT only.
