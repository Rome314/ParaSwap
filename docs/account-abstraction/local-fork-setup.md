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

## One-shot demo

Deploys oracle stack, paymasters, factory, ParaSwap wiring, then executes A7A5-gas and USDT-gas demo swaps:

```bash
MAINNET_FORK=1 ALCHEMY_API_KEY=your_key npm run fork:demo
```

Printed JSON includes addresses to paste into frontend `VITE_*` variables.

## TWAP warmup

Fork tests call `warmUpTwap` (see `blockchain/test/helpers.ts`) so Uniswap V3 TWAP oracle observations exist before paymaster quotes.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| PoolsFacade constructor reverts on pair validation | Run with `MAINNET_FORK=1` — local Hardhat network has no real Uniswap pairs |
| Paymaster stale price | Advance time or refresh Chainlink mock on non-fork unit tests |
| Bundler not used in tests | Tests call EntryPoint directly; bundler is frontend / ops concern |
