# Commands

Run npm commands at the root. Use npm 11.19.1, Node 24.22.1 (`.nvmrc`), Python
3.10+, and Go 1.22+ (exercised with 1.27.3). The root lock is the only install lock.

## Local verification

| Command | Purpose | Limits |
| --- | --- | --- |
| `npm run doctor` / `make doctor` | Metadata-only file availability check | Detects macOS cloud placeholders; not a product test |
| `npm ci` | Install the root workspace lock | Registry/Git access; no chain credentials |
| `npm run check:harness` | Preflight and local-runner regressions | Deterministic/mocked checks |
| `npm run build:contracts` | Compile, export ABIs, sync Go snapshots, build shared package | May download compilers; no deployment |
| `npm run build` | Contract pipeline and production UI build | No browser-wallet or external-API acceptance |
| `npm run typecheck:contracts` | Scripts, Ignition, and tests against generated types | Compile first |
| `npm run test:unit` | Contracts on the simulated local network | Fork cases remain explicitly pending |
| `npm run check:backend` | Go test/build and vet inside `backend/` | No current behavioral test files |
| `npm run subgraph:build` | Sync ABIs, codegen, compile mappings | No production-address/live-indexing validation |
| `npm run check` / `make check` | Full local pipeline in dependency order | Fork/live acceptance is separate |

The local Hardhat runner bypasses operator dotenv files, removes RPC/signing/network
environment variables used by the config, and rejects network overrides. Forking
requires `MAINNET_FORK=1` in the Hardhat config.

## Development

```sh
npm run build:contracts
npm run dev -w para-swap-frontend
```

Configure `frontend/.env.local` without replacing existing configuration. `VITE_*`
values are browser-visible. Start the Go stub with `cd backend && go run .`.
Stop temporary servers when checks finish. The `/api/uniswap-quote` route exists in
the Vite development proxy; production serving needs an equivalent route. The Go
stub does not provide it. The Docker setup remains a review item.

## Fork verification

Root `npm run test:fork` is the required-fork gate. Supply a positive `FORK_BLOCK`,
one RPC setting (`MAINNET_RPC_URL`, `ALCHEMY_RPC_URL`, or `ALCHEMY_API_KEY`), and any
token/whale prerequisites from `blockchain/common/addresses.ts`. Operator values can
live in `blockchain/.env`; local checks deliberately bypass that file.

```sh
FORK_BLOCK=<reviewed-mainnet-block> npm run test:fork
```

The command sets `MAINNET_FORK=1` and `REQUIRE_FORK_TESTS=1`. Missing RPC, pinning,
or suite prerequisites must fail. Pending cases under `npm test` are not fork
acceptance. No live RPC fork run was performed during setup.

## Deployment and agent entry points

Deployment, funding, approvals, staking, real swaps, and Studio publishing are
explicit operations outside local checks. Read [the deployment guide](../blockchain/docs/DEPLOY.md)
and [the AA guide](account-abstraction/mainnet-deployment.md) when preparing them.
Sepolia modules live under `blockchain/ignition/modules/sepolia/`.

Canonical rules are root/package `AGENTS.md` files. `CLAUDE.md` imports them, while
`.cursor/rules/project.mdc` points Cursor there. These follow documented
[Claude imports](https://code.claude.com/docs/en/memory#import-additional-files) and
[Cursor rules](https://cursor.com/docs/rules). Guidance complements executable checks.
The checked-in GitHub workflow uses `npm ci` and `npm run check` without chain
credentials; it has not been submitted or run on GitHub during this task.
