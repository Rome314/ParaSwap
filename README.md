# ParaSwap / A7A5 Swap

Ethereum swap and account-abstraction prototype for A7A5, wA7A5, and USDT, with a separate Tron wallet adapter. Includes Solidity routers, smart accounts, paymasters and oracles, a React application, shared contract exports, a small Go metadata service, and a Graph indexer scaffold.

## Start locally

Use Node from `.nvmrc`, npm 11, Go 1.22+, and Python 3.10+. Go checks were exercised with Go 1.27.3. Run npm commands from this directory:

```sh
nvm use
npm ci
npm run check
npm run dev -w para-swap-frontend
```

The app opens at `http://localhost:5173`; `/debug` and `/contracts` contain development dashboards. Interactive chain reads and wallet flows need local configuration. Create `frontend/.env.local` from the root `.env.example` without overwriting existing configuration. Use `blockchain/.env.example` for separately authorized fork/deployment work. Local verification bypasses operator dotenv files and needs no RPC credentials.

`npm run check` builds contracts, exports/syncs ABIs, builds the shared package and UI, typechecks contract tooling/tests, runs local contract and harness tests, checks the Go stub, and builds the subgraph. Pending fork cases do not establish mainnet behavior.

## Repository map

```text
frontend/             React, Vite, wagmi/ethers; main, debug, and contract dashboards
blockchain/           Hardhat contracts, tests, chain helpers, and Ignition modules
packages/contracts/   Shared addresses and generated/maintained ABI exports
backend/              Go metadata stub; generated contract snapshots
subgraph/             Graph schema, handlers, and local indexer configuration
scripts/              Preflight and isolated local check runner
docs/                 Navigation, commands, review, and recovery instructions
.harness2/            Baseline/probe evidence and bounded workflow lessons
```

Use the single root `package-lock.json`. Package-local npm/pnpm lockfiles and old dependency folders are preserved in recovery snapshots outside the active checkout.

## Guides

- [Project map and ownership](docs/PROJECT_MAP.md)
- [Commands and verification boundaries](docs/COMMANDS.md)
- [Review and next priorities](docs/PROJECT_REVIEW.md)
- [Worktree recovery](docs/WORKTREES.md)
- [Contract architecture](blockchain/docs/ARCHITECTURE.md)
- [Contract API reference](blockchain/docs/CONTRACTS.md)
- [Account-abstraction guides](docs/account-abstraction/README.md)
- [Permit2 model](docs/PERMIT2.md)

Agents start with [AGENTS.md](AGENTS.md) and the scoped guide in their package. Root `CLAUDE.md` and the Cursor rule point to that shared contract. The existing Docker configuration still needs modernization for the workspace layout; use the local commands above as the development entry point.
