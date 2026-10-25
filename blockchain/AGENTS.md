# Blockchain

Follow the root `AGENTS.md`. This package owns contracts, chain tests, and deployment sources.

- Active Solidity lives in `contracts/`, grouped into `account/`, `paymaster/`, `oracle/`,
  `interfaces/`, and `vendor/`. `contracts/test/` provides test doubles.
- TypeScript tests live in `test/`, grouped by contract or integration. Reuse relevant
  fixtures/helpers instead of creating a second setup path. Inspect whether each suite
  needs a mainnet fork before running it.
- Shared TypeScript ABIs, addresses, and ERC-4337 helpers live in `common/`.
  Check browser ABI/encoding compatibility when a contract interface changes.
- Keep deployment composition in `ignition/modules/`; chain parameters belong in
  `ignition/parameters/`. Inspect `scripts/` before execution: filenames are not a
  guarantee that a script is read-only.
- Mainnet modules live directly in `ignition/modules/`; Sepolia composition belongs in
  `ignition/modules/sepolia/`. Preserve existing `ignition/deployments/` records; never
  reset a deployment journal to silence an error.
- This project identifies as Hardhat 3 with the Mocha/ethers toolbox. Verify its exact
  installed version before using API examples. Compile before typechecking generated
  contract bindings. Do not edit generated `types/` or `artifacts/` by hand.
- For contract behavior changes, use focused fixtures/tests for access control, token
  units, fee-on-transfer/rebasing behavior, oracle freshness, and account/paymaster
  invariants relevant to the change. Avoid broad formatting during security-sensitive work.
- Fork checks require explicit RPC/token/whale prerequisites and a reproducible block
  where supported. Missing prerequisites and skipped tests must remain visible.
- Compilation and mock tests do not establish deployed-contract correctness. Live
  deployment, approvals, funding, deposits, and swaps require explicit authorization.

Commands run from the repository root: `npm run build:contracts`,
`npm run typecheck:contracts`, `npm run test:unit`, and the separate `npm run test:fork`.
Local build/test scripts deliberately bypass operator dotenv files and remote networks.
