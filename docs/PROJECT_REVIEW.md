# Project review — 2026-10-24

## Scope and evidence

Reviewed the original checkout, three supplied Cursor snapshots, remote branch history,
package/configuration files, contract architecture and representative implementation,
frontend transaction/passkey code, Go stub, subgraph, and executable checks. The selected
source is Cursor `3zj9`, reconciled against `feat/contracts-polishing` at
`211f6cac64c50f23e7a3816422c629dbef0f5a70`. Recovery details are in [WORKTREES.md](WORKTREES.md).

This is a project and verification review, not a completed security audit or live-chain
acceptance. Final check results are recorded in [Harness2 evidence](../.harness2/validation.json).
No Solidity product behavior was changed during setup.

## Verification result

`npm ci --no-audit --no-fund` succeeded from removed dependency trees. The final
`npm run check` exited zero in 24.38 seconds: contracts and ABI/shared-package builds,
frontend production build, contract TypeScript check, seven Python and two Node harness
tests, 156 passing local contract tests with 82 pending fork cases, Go compile/vet,
and Graph codegen/WASM build. Two missing-prerequisite fork probes rejected correctly;
a deliberately inherited remote/fork environment still produced a passing local suite.
Vite dependency prebundling also succeeded. No live wallet or RPC acceptance is implied.

## Existing work worth keeping

- The existing workspace boundaries are useful: browser application, contracts, shared
  exports, Go metadata service, and indexer.
- Routers contain fee-on-transfer balance-delta accounting, final-output bounds,
  reentrancy protection, pausing, and two-step ownership. Local security tests exercise
  recipients, allowance cleanup, constructor guards, and malicious callbacks.
- Account work includes WebAuthn clones, EIP-7702 delegation, ECDSA/UUPS proxies,
  deterministic factories, and creation-time approval allowlists.
- Oracle/paymaster work covers TWAP pricing, staleness propagation, and transfer-fee
  prefunding. These still need fork and deployment evidence for operational claims.
- The UI contains normal, AA-debug, and generic contract dashboards, plus separate
  EVM/Tron adapters. The README's original Ethereum-only/no-routing description was stale.
- The Go service and Graph mappings are scaffolding with useful boundaries. A large
  service architecture would be premature; the Go design guidance was applied by
  keeping this stub compact and documenting feature boundaries for future behavior.

## Repairs made in this task

1. Recovered a usable main checkout and Git database while preserving all original
   source/configuration/history snapshots; reduced active worktrees to one.
2. Added canonical root/scoped agent guidance, thin Claude/Cursor entry points,
   navigation and commands, and a documented recovery path.
3. Standardized on root npm workspaces and one lock. Removed redundant package locks,
   stale pnpm assumptions, unused incompatible lint/gas packages, and replaced gas
   reporting with Hardhat 3's native option. Removed the obsolete dependency-patching
   postinstall hook and Vite shims after restoring correct package resolution. Direct versions are pinned while repairing
   resolution to avoid a simultaneous broad dependency upgrade. Aligned the Uniswap
   SDK versions with the router's SDK cohort and declared its direct imports.
4. Added metadata preflight and an executable local Hardhat profile that bypasses
   operator credentials/network selection. Required fork checks fail without prerequisites.
5. Guarded the fork-dependent quote suite, completed the partial Sepolia module move,
   repaired generated-type imports/overload references and strict TypeScript errors.
6. Made contract compilation, ABI export/sync, shared-package compilation, frontend,
   backend, and subgraph checks an ordered root pipeline, with a checked-in CI workflow.
   Regenerated ABI snapshots to match current contracts, aligned subgraph event signatures,
   declared entity mutability, and corrected optional strategy-field clearing.

## Open product priorities

| Priority | Finding | Evidence and next check |
| --- | --- | --- |
| P1 | Browser passkey challenges use hex strings where the browser library decodes base64url | `frontend/src/lib/aa/passkey.ts:68,106`; installed SimpleWebAuthn decodes `optionsJSON.challenge` as base64url. A 32-byte hash rendered as 64 hex characters decodes as 48 bytes there, unlike the contract test helper's base64url challenge. Fix byte conversion and verify a real browser assertion against the account. |
| P1 | Two-stage swaps reuse estimated USDT output as the next input | `frontend/src/components/swap/RouteSwap.tsx:139-146,172`; after confirmation, the code stores a quote rather than the actual received delta. A worse fill can make leg two fail or consume pre-existing USDT. Measure confirmed receipts and preserve recovery state between legs. |
| P1 | Production routing endpoint is not provided | `frontend/src/components/swap/shared.ts`, `frontend/vite.config.ts`, `backend/main.go`; `/api/uniswap-quote` is a Vite dev proxy, while the Go stub has no quote handler. Define production serving, credentials, request/response validation, and integration acceptance. |
| P2 | Arbitrary output tokens are formatted with six decimals and converted through Number | `frontend/src/components/swap/RouteSwap.tsx:98`; read token decimals and format integer units without float precision loss. |
| P2 | Static ABI fragments and generated exports can diverge | Compare `frontend/src/lib/aa/abis.ts` with generated artifacts; for example, paymaster debug fragments use `token()` while the interface exposes `gasToken()`. Add an interface-consistency check when repairing those panels. |
| P2 | Docker configuration predates the workspace layout | `frontend/Dockerfile` uses Node 20 and copies only frontend files; the UI imports the shared workspace package. Modernize the build context and validate Docker separately. |
| P2 | Indexer deployment configuration is unfinished | `subgraph/subgraph.yaml` has zero-address ParaSwap/facade sources and `startBlock: 0`. Review real deployments and replay/event semantics before publishing. |
| P2 | Deployment records do not establish production state | Historical `ignition/deployments/chain-1` contains mock/test-stack entries. Preserve it, verify network/bytecode/ownership independently, and do not infer mainnet readiness from the directory name. |
| P2 | Third-party wallet/UI peer warnings remain | The synchronized lock installs and the executable checks run, but `npm ls --all` reports peer disagreements involving wagmi core, zod, and React. A transitive relayer package also advertises pnpm in its engine metadata. Resolve these through a focused dependency/interactive-wallet review; do not suppress them with global peer overrides. |

The passkey encoding finding is supported by the installed library implementation,
contract/test encoding, and a deterministic byte-length probe. See the
[SimpleWebAuthn browser documentation](https://simplewebauthn.dev/docs/packages/browser).
Other product findings above are source-review findings, not executed wallet transactions.

## Remaining verification boundaries

- Fork suites: no operator RPC was used during setup; pending cases remain unverified.
- Wallets, real passkeys, bundlers, TronLink, quotes, swaps, ownership acceptance, and
  indexer replay: no live acceptance performed.
- Go: compilation/static analysis only; behavioral tests do not yet exist.
- CI: workflow is published on `codex/project-harness`; no GitHub Actions run was observed.
- Original cloud-only local Git history: preserved, not imported; see recovery guide.

Keep future progress in this project record and the relevant owning guide. Do not
copy changing status into global agent instructions or global memory.

## Handoff review — 2026-10-26

- The recovered work was committed as `c911f2d` on `codex/project-harness` and pushed
  to `origin/codex/project-harness`; the local branch now tracks that remote branch.
- The active Git database has one registered worktree. After fetching, `master`,
  `feature/aa-test`, `feature/subgraph-and-backend`, and `feat/contracts-polishing`
  were ancestors of the active branch, so no remote branch commits were missing.
- Recovery snapshots `cursor-3zj9` and `cursor-g5j2` passed metadata preflight;
  `cursor-qsb3` has no source placeholders but lacks required workspace manifests.
  The original cloud-managed checkout remains blocked by missing files and source/Git
  placeholders and was left untouched. The old `A7A5_multirouter.ts` example in two
  snapshots references a contract absent from the active tree, so it was not merged.
- A fresh `npm run check` passed the preflight and harness portion (7 Python and 2 Node
  tests), then stopped at Hardhat compilation with `HHE905` because the compiler
  version list could not be downloaded. The complete green run recorded above remains
  the last full local check; fork-dependent and live acceptance limits are unchanged.
