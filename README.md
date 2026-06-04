# A7A5 Swap — V0 Prototype

Ethereum-only prototype for the A7A5 / wA7A5 / USDT swap UX. Designed against ADR-001.

No backend. All on-chain reads go directly through ethers + Multicall3 (Alchemy RPC). Quotes come from the Uniswap Routing API directly from the browser.

## Layout

```
frontend/       React + TS + Vite, wagmi + ethers + universal-router-sdk
contracts/      Hardhat 3 (mocha-ethers) fork tests
docs/           Permit2 explainer
```

## Quickstart (Docker Compose)

1. Copy env template and fill in addresses + your Alchemy key:
   ```bash
   cp .env.example .env
   ```
2. Launch:
   ```bash
   docker compose up --build
   ```
3. Open http://localhost:5173.

## Local development

```bash
cd frontend
npm install
cp ../.env.example .env.local   # fill in values
npm run dev
```

## Contracts (fork tests)

```bash
cd contracts
npm install
ALCHEMY_RPC_URL=… A7A5_ADDRESS=0x… WA7A5_ADDRESS=0x… \
  A7A5_WHALE=0x… WA7A5_WHALE=0x… MAINNET_FORK=1 npm test
```

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
- No custom router contract, paymaster, or Tron.
