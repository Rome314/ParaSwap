# AA Debug Dashboard (`/debug`)

Interactive dashboard for testing ERC-4337 smart accounts, A7A5/USDT paymasters, and price oracles against a **local mainnet fork**.

## Prerequisites

- Node 20+
- Alchemy API key with **archive** mainnet access
- Browser at `http://localhost:5173` (not `127.0.0.1`) for WebAuthn passkeys

## Quick start

```bash
# Terminal 1 — forked Hardhat node (chainId 1)
cd blockchain && ALCHEMY_API_KEY=... npm run node:fork

# Terminal 2 — deploy AA stack, copy printed JSON
cd blockchain && npm run fork:deploy

# Terminal 3 — dev bundler JSON-RPC on :4337
cd blockchain && npm run bundler:dev

# Terminal 4 — frontend
cd frontend && cp .env.fork.example .env.local
# Paste fork:deploy addresses into .env.local
npm run dev
# Open http://localhost:5173/debug
```

## Panels

| Tab | Purpose |
|-----|---------|
| **Fork Status** | RPC health, chainId/block, contract address table, EntryPoint paymaster deposits, paste `fork:deploy` JSON |
| **Smart Account** | WebAuthn passkey, counterfactual/deployed address, balances, nonce, ERC-7821 execute preview |
| **Paymasters** | Deposits, pause state, oracle link, token price + staleness, gas quote simulation |
| **Oracles** | TWAP feed, A7A5/USDT native oracle, USDT native oracle, Chainlink USDT/ETH reference |
| **UserOp Pipeline** | Build → estimate → WebAuthn sign → submit; preset A7A5↔USDT swaps |
| **Event Log** | Recent `UserOperationEvent`, paymaster payments, oracle staleness updates |

## Environment variables

See `frontend/.env.fork.example`. Key settings:

- `VITE_CHAIN=hardhat-fork` — enables fork RPC in wagmi/ethers
- `VITE_FORK_RPC_URL=http://127.0.0.1:8545`
- `VITE_BUNDLER_URL=http://127.0.0.1:4337`
- `VITE_ENTRYPOINT_V08=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (EntryPoint v0.8)

Passkey coordinates (`VITE_PASSKEY_QX/QY`) are optional — they are stored in browser localStorage after **Create passkey**.

## Bundler RPC

The dev bundler (`blockchain/scripts/dev-bundler.ts`) implements:

- `eth_supportedEntryPoints`
- `eth_estimateUserOperationGas` (via `handleOps` static call)
- `eth_sendUserOperation` (submits via `handleOps`)
- `eth_getUserOperationReceipt`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Fork Status unhealthy | Start `npm run node:fork` with valid `ALCHEMY_API_KEY` |
| AA not configured | Set entryPoint, accountFactory, bundlerUrl in `.env.local` |
| Bundler errors | Ensure `npm run bundler:dev` runs while fork node is up |
| WebAuthn fails | Use `http://localhost:5173`, not `127.0.0.1` |
| chainId mismatch | Fork uses chainId **1** (not 31337) — verify Fork Status panel |
| TWAP stale / cold | Run fork deploy (includes TWAP warmup swaps) or wait for observations |
