# Sepolia testnet launch runbook

Use this checklist before pointing users at Sepolia. The canonical contract release line is **`origin/feat/contracts-polishing`** (7 commits ahead of `master` as of review): pre-testnet contract hardening, `security-hardening.test.ts`, Slither/Solhint wiring, `prepare-deployment.ts`, and production-style docs in `blockchain/docs/`.

## Branch decision matrix

| Branch | vs `master` | Role |
|--------|-------------|------|
| **`feat/contracts-polishing`** | +7 commits | **Recommended for testnet/mainnet contracts** — security pass, deploy runbooks, Sepolia Ignition module |
| `master` | baseline | Frontend fixes; **missing** pre-testnet contract/docs/tooling |
| `feature/subgraph-and-backend` | −5 (merged) | Historical; do not deploy from this branch |
| `feature/aa-test` | −13 | Debug UI only; stale relative to `master` |

Sepolia scope (`A7A5AA_Sepolia.ts`): mock A7A5/wA7A5, mock TWAP/Chainlink, **A7A5 + USDT paymasters**, WebAuthn + ECDSA account factories. **PoolsFacade / ParaSwap are intentionally omitted** — no A7A5 liquidity on Sepolia. Swap UX on testnet is limited to AA/oracle/paymaster validation unless you add mocks + a future SwapStack module.

## 1. Environment

From repo root, copy and fill `.env.example`:

```bash
cp .env.example .env
```

Minimum for Sepolia AA testnet:

| Variable | Purpose |
|----------|---------|
| `VITE_CHAIN=eth-sepolia` | Frontend chain |
| `VITE_ALCHEMY_API_KEY` | Sepolia RPC (derived in app) |
| `DEPLOYER_PRIVATE_KEY` | Ignition deployer (never commit) |
| `SEPOLIA_RPC_URL` or `ALCHEMY_API_KEY` | `predeploy:prepare sepolia` |
| `ETHERSCAN_API_KEY` | `--verify` on deploy |

After deploy, set `VITE_*` contract addresses from Ignition output (`ignition/deployments/chain-11155111/deployed_addresses.json`).

## 2. Reproducible install (blockchain/)

```bash
cd blockchain
corepack enable
corepack prepare pnpm@8.14.0 --activate
pnpm install --frozen-lockfile
```

From repo root for consumers:

```bash
npm install
npm run build:contracts
```

## 3. Release gate (local / CI)

Run in `blockchain/`:

```bash
pnpm format:check          # fix with pnpm format if needed
pnpm lint:sol              # 1 solhint error on vendor interface without pragma — known
pnpm build
pnpm test                  # unit + security; fork suites skip without MAINNET_FORK
```

**Mainnet-fork gate** (required before mainnet; strongly recommended before treating contracts as final):

```bash
export ALCHEMY_API_KEY='…'
export FORK_BLOCK='<approved block>'   # e.g. 25271161 for test:predeploy
export MAINNET_FORK=1
pnpm test:fork
pnpm test:fork:aa
# or single pinned gate:
pnpm test:predeploy
```

Without `MAINNET_FORK=1`, fork tests (quotes, swaps, oracle fork, AA E2E) **skip** — not a failure.

**Static analysis** (on frozen commit):

```bash
pnpm lint:slither:high    # requires Slither installed
pnpm audit                # format + solhint + build + coverage + slither
```

Archive `slither-report.sarif` outside git. See caveats in [DEPLOY.md](./DEPLOY.md) for OZ partial-IR skips.

## 4. Sepolia deploy

Preflight (checks RPC chain id, deployer balance, writes `.ignition-parameters/sepolia.json`):

```bash
export DEPLOYER_PRIVATE_KEY='0x…'
export ALCHEMY_API_KEY='…'   # or SEPOLIA_RPC_URL
pnpm predeploy:prepare sepolia
```

Dry-run visualization:

```bash
pnpm deploy:sepolia:dry-run
```

Deploy + verify:

```bash
pnpm deploy:sepolia
```

Default Sepolia paymaster funding from `ignition/parameters/sepolia.json`: **1 ETH deposit + 0.5 ETH stake each** (2 paymasters). Fund deployer accordingly plus deployment gas.

## 5. Post-deploy publication

1. Run `pnpm build` / `pnpm export-artifacts` in `blockchain/` (or `npm run build:contracts` at root).
2. Update `packages/contracts/src/addresses.ts` (Sepolia section if present) and regenerate consumer ABIs.
3. Set frontend `.env`: `VITE_ENTRYPOINT_V08`, `VITE_ACCOUNT_FACTORY`, paymasters, oracles.
4. Optional: `subgraph/networks.json` — only if you index Sepolia mock tokens later.
5. Record commit hash, parameter file, tx hashes, and addresses in your release log.

## 6. Smoke tests on Sepolia

- [ ] TWAP oracle `latestAnswer() > 0`, `twapWindow()` matches params (300s on Sepolia mocks).
- [ ] Native oracles return positive `tokenPrice()`.
- [ ] Both paymasters: correct EntryPoint, gas token, deposit/stake visible on EntryPoint.
- [ ] WebAuthn counterfactual deploy via factory + one sponsored UserOp per paymaster (small amounts).
- [ ] ECDSA factory `predictAddress` / `deployAccount` idempotency.
- [ ] Frontend: Wallet + Passkey tabs load with env addresses; no console errors on Sepolia.

Swap stack smoke tests apply only on **mainnet fork** or after a future Sepolia SwapStack with mock liquidity.

## 7. Security review status (feat/contracts-polishing)

- **Unit security suite**: `test/security-hardening.test.ts` — constructor guards, pause, reentrancy, FOT accounting, allowance clearing, slippage/recipient checks.
- **Contract changes** tagged in branch history: `Contracts update after security check`, `pre-testnet contracts changes`.
- **Remaining manual items**: Slither full pass on frozen commit, multisig `PRODUCTION_OWNER` for mainnet (Sepolia deployer may remain owner for testnet), npm audit noise in monorepo (89 reported; triage before production frontend deploy).

## 8. Known gaps before “public” testnet

1. Merge **`feat/contracts-polishing` → `master`** so CI and Docker use one line.
2. Run fork suite with pinned `FORK_BLOCK` and archive results.
3. Configure bundler URL (`VITE_BUNDLER_URL`) for real ERC-4337 on Sepolia.
4. Mainnet swap UI still reads live pools; Sepolia users should see copy that **swap is mainnet-only** until SwapStack ships on testnet.

## Quick command reference

```bash
# Unit gate (no RPC)
cd blockchain && pnpm test

# Full monorepo build
cd .. && npm run build:contracts && npm run build -w para-swap-frontend

# Sepolia deploy
cd blockchain && pnpm deploy:sepolia
```
