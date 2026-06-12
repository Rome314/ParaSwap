# Local fork setup

## Prerequisites

- Node 20+
- Alchemy API key (mainnet archive access)
- Token addresses and whales configured in `blockchain/.env` (see `blockchain/.env.example`)

## Environment

```bash
cd blockchain
cp .env.example .env
# Set ALCHEMY_API_KEY, A7A5_ADDRESS, WA7A5_ADDRESS, whale addresses, etc.
```

Enable fork in Hardhat (already wired in `hardhat.config.ts` when `MAINNET_FORK=1`).

## Run fork tests

```bash
MAINNET_FORK=1 ALCHEMY_API_KEY=your_key npm run test:fork:aa
```

This runs WebAuthn fork E2E, A7A5/USDT paymaster swap integration, and existing paymaster fork suites.

## Full local dev workflow (fork + bundler + debug UI)

```bash
# Terminal 1 — mainnet fork node (chainId 1, RPC :8545)
cd blockchain && ALCHEMY_API_KEY=... npm run node:fork

# Terminal 2 — deploy AA stack; copy printed JSON to frontend .env.local
cd blockchain && npm run fork:deploy

# Terminal 3 — ERC-4337 dev bundler (JSON-RPC :4337)
cd blockchain && npm run bundler:dev

# Terminal 4 — frontend debug dashboard
cd frontend && cp .env.fork.example .env.local
# Paste addresses from fork:deploy into VITE_* vars
npm run dev
# Open http://localhost:5173/debug
```

See [debug-dashboard.md](./debug-dashboard.md) for panel reference.

## One-shot demo (in-process fork)

Deploys oracle stack, paymasters, factory, ParaSwap wiring, then executes A7A5-gas and USDT-gas demo swaps:

```bash
MAINNET_FORK=1 ALCHEMY_API_KEY=your_key npm run fork:demo
```

Printed JSON includes addresses to paste into frontend `VITE_*` variables.

## TWAP warmup

Fork tests call `warmUpTwap` (see `blockchain/test/helpers.ts`) so Uniswap V3 TWAP oracle observations exist before paymaster quotes. `fork:deploy` also performs warmup swaps.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| PoolsFacade constructor reverts on pair validation | Run with `MAINNET_FORK=1` — local Hardhat network has no real Uniswap pairs |
| Paymaster stale price | Advance time or refresh Chainlink mock on non-fork unit tests |
| Bundler not used in tests | Tests call EntryPoint directly; use `npm run bundler:dev` for frontend `/debug` |
| chainId confusion | Hardhat fork mirrors mainnet — use chainId **1**, RPC `http://127.0.0.1:8545` |
| WebAuthn on localhost | Use `http://localhost` hostname, not `127.0.0.1` |
