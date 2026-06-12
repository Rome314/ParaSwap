# A7A5 Swap — V0 Prototype

Ethereum-only prototype for the A7A5 / wA7A5 / USDT swap UX. Designed against ADR-001.

No production backend yet — the UI reads on-chain state via ethers + Multicall3. Quotes come from the Uniswap Routing API in the browser. A minimal **Go** `backend/` HTTP stub and `subgraph/` scaffold are included for future indexer/API work.

## Monorepo layout

```
package.json              npm workspaces root
blockchain/                 Hardhat 3 contracts + fork tests
frontend/                 React + Vite + wagmi
packages/contracts/         @para-swap/contracts — shared ABIs + addresses
subgraph/                   The Graph indexer scaffold
backend/                    Go HTTP stub (reads synced ABIs + addresses.json)
docs/                       Permit2 explainer
```

## Quickstart (Docker Compose)

1. Copy env template and fill in your Alchemy key:
   ```bash
   cp .env.example .env
   ```
2. Build shared contract artifacts (required before frontend / Go backend):
   ```bash
   npm install
   npm run build:contracts   # also syncs backend/contracts/
   ```
3. Launch:
   ```bash
   docker compose up --build
   ```
4. Open http://localhost:5173.

## Local development

```bash
npm install
npm run build:contracts   # hardhat compile + export ABIs to @para-swap/contracts
cd frontend && npm run dev
```

## Contracts (fork tests)

```bash
cd blockchain
ALCHEMY_RPC_URL=… npm test
```

`npm run build:contracts` from the repo root compiles project + `a7a5` npm token contracts, syncs ABIs into `packages/contracts`, and copies artifacts to `backend/contracts/` for the Go service.

## Backend (Go)

```bash
npm run build:contracts   # sync ABIs + addresses.json
cd backend && go run .
```

See [backend/README.md](backend/README.md).

## Subgraph

```bash
npm run subgraph:codegen
npm run subgraph:build
cd subgraph && docker compose up -d && npm run deploy-local
```

Set `PARASWAP_ADDRESS` and `POOLS_FACADE_ADDRESS` in `subgraph/networks.json` after deploy. See [subgraph/README.md](subgraph/README.md).

## What the UI does

| Section | What it does |
|---|---|
| **Wallet** | Shows ETH, A7A5, wA7A5, USDT balances. Warns if A7A5 is paused or address is blacklisted. Displays current transfer fee (basisPointsRate). |
| **Wrap / Unwrap** | `A7A5.approve(wA7A5)` → `wA7A5.wrap(amount)` or `wA7A5.unwrap(amount)`. |
| **Swap** | Quote → `token.approve(Permit2, MAX)` (once) → `Permit2.approve(UR, MAX, expiry)` (once) → `UniversalRouter.execute`. A7A5→USDT via V2; wA7A5→USDT via V3. |

See [`docs/PERMIT2.md`](docs/PERMIT2.md) for the approval model.

## Scope (V0)

- Ethereum only — all UI copy says "Ethereum".
- No smart routing — user picks A7A5 (V2) or wA7A5 (V3) manually.
- No custom router contract, paymaster, or Tron in the default UI path.
