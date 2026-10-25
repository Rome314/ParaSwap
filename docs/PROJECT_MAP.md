# Project map

| Area | Owns | Read first | Verification |
| --- | --- | --- | --- |
| `frontend/` | UI, wallet state, adapters, encoding | Scoped `AGENTS.md`, `src/App.tsx` | Root `build`; workspace `typecheck` |
| `blockchain/` | Solidity, tests, deployment composition | Scoped `AGENTS.md`, `docs/ARCHITECTURE.md` | `build:contracts`, `typecheck:contracts`, `test:unit`; fork separately |
| `packages/contracts/` | Shared addresses and ABI exports | Scoped `AGENTS.md`, `src/addresses.ts` | Built by `build:contracts` |
| `backend/` | Health, ABI listing, address snapshots | Scoped `AGENTS.md`, `main.go` | `check:backend`; currently no Go behavioral tests |
| `subgraph/` | Entities and event mappings | Scoped `AGENTS.md`, schema/manifest | `subgraph:build`; live indexing separately |
| `scripts/` | File availability and local isolation | `preflight.py`, `hardhat-local.mjs` | `check:harness` |

Keep the existing monorepo boundaries. Add packages for implemented behavior with a
clear owner; avoid empty layers or broad import renames.

## Frontend navigation

- `src/components/`: wallet, swap, overview, utilities, and shared UI.
- `src/hooks/`: React orchestration and data fetching.
- `src/lib/a7a5/`: EVM and Tron adapters; `src/lib/aa/`: UserOperations, signatures,
  passkeys, EIP-7702, and bundler transport.
- `src/debug/`: AA/fork inspection at `/debug`; `src/contracts/`: generic interaction
  interface at `/contracts`.
- `src/config/`: chain/wallet configuration; addresses delegate to the shared package.
- `src/i18n/`: EN/RU copy. `src/types/` is authored source, not generated output.

## Contract navigation

- `contracts/ParaSwap.sol` and `PoolsFacade.sol`: routing and fee-on-transfer accounting.
- `contracts/account/`: WebAuthn, EIP-7702, ECDSA/UUPS accounts, factories, approvals.
- `contracts/paymaster/` and `contracts/oracle/`: sponsorship settlement and pricing.
- `contracts/test/`: test doubles; `contracts/vendor/`: integration sources.
- `test/`: tests by contract/integration, with shared fixtures/helpers.
- `common/`: chain-side ABIs, addresses, multicall, ERC-4337 helpers.
- `ignition/modules/`: mainnet composition; `ignition/modules/sepolia/`: testnet.
- `ignition/parameters/`: templates; `.ignition-parameters/`: ignored operator output.
- `ignition/deployments/`: preserved journals; verify their network identity independently.

## Artifact flow

```text
Solidity -> Hardhat artifacts -> export-artifacts.ts -> shared ABI sources
                                                    -> backend/contracts/
shared addresses.ts --------------------------------> backend/contracts/addresses.json
shared package build -------------------------------> frontend imports
shared ABIs -> subgraph sync -> codegen -> WASM build
```

Run `npm run build:contracts` after interface changes. Most ABIs are generated;
`WA7A5.json` and `erc20.min.json` remain maintained inputs. The wrapper package's
compiler-version conflict is documented in `export-artifacts.ts`. Do not hand-edit
generated output to make a consumer compile.

Search authored paths first. Exclude dependencies, `.venv/`, `artifacts/`, `cache/`,
`coverage/`, `dist/`, generated `blockchain/types/`, and deployment build-info from
routine discovery. Preserve deployment records and archived user work.
