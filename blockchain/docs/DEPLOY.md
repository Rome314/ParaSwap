# Production deployment runbook

This runbook is for Ethereum mainnet (`chainId = 1`). Execute it from `blockchain/` with pnpm 8.14.0. Record the git commit, lockfile hash, Node/pnpm versions, RPC endpoint identity, approved fork block, deployer, production multisig, transaction hashes, and final addresses in the release record.

## 1. Required operator inputs

Export these values in the deployment shell:

```bash
export MAINNET_RPC_URL='https://...'
export DEPLOYER_PRIVATE_KEY='0x...'
export PRODUCTION_OWNER='0x...'
export ETHERSCAN_API_KEY='...'
export FORK_BLOCK='<APPROVED_MAINNET_BLOCK>'
```

- `MAINNET_RPC_URL` may be replaced by `ALCHEMY_RPC_URL`, or by `ALCHEMY_API_KEY` from which the scripts derive an Alchemy URL.
- `DEPLOYER_PRIVATE_KEY` must control the funded deployment account. Never commit it or the generated `.ignition-parameters/` files.
- `PRODUCTION_OWNER` must be the reviewed production multisig contract. The preflight rejects an EOA/no-code address.
- `ETHERSCAN_API_KEY` is required by the `--verify` deployment.
- `FORK_BLOCK` must be an explicitly approved recent mainnet block at which EntryPoint v0.8, the P-256 precompile behavior used by tests, project tokens, and both pools are available.

Optional address overrides are `ENTRYPOINT`, `CHAINLINK_USDT_ETH`, and `UNIV3_FEE_TIER`. Do not override them without a reviewed change record. Mainnet defaults are in `common/addresses.ts`.

The checked-in `ignition/parameters/mainnet.json` currently specifies:

```text
TWAP window:                 1,800 seconds
Chainlink maximum staleness: 86,400 seconds
Per-paymaster deposit:       5 ETH
Per-paymaster stake:         1 ETH
Stake unlock delay:          86,400 seconds
```

`DEPOSIT_ETH` and `STAKE_ETH` in `.env.example` are informational/legacy shell values; the current Ignition deployment reads `depositWei` and `stakeWei` from the parameter JSON. Review the JSON values, not those environment variables.

Unresolved inputs that must be approved before mainnet execution:

- `PRODUCTION_OWNER` multisig address, signer set, and threshold.
- `FORK_BLOCK`.
- Deployer address and gas budget.
- Whether 30-minute TWAP, 24-hour Chainlink staleness, 5 ETH deposits, 1 ETH stakes, and one-day unlock delay meet the current risk policy.

## 2. Reproducible preflight and release checks

Install exactly from the lockfile:

```bash
corepack enable
corepack prepare pnpm@8.14.0 --activate
pnpm install --frozen-lockfile
```

Before the release gate, confirm the worktree contains only reviewed changes and record `git rev-parse HEAD`. Run the deterministic non-fork checks:

```bash
pnpm format:check
pnpm lint:sol
pnpm build
pnpm test
pnpm test:coverage
```

Run the mainnet-fork suites against the approved pinned block:

```bash
FORK_BLOCK='<APPROVED_MAINNET_BLOCK>' MAINNET_FORK=1 pnpm test:fork
FORK_BLOCK='<APPROVED_MAINNET_BLOCK>' MAINNET_FORK=1 pnpm test:fork:aa
```

Do not combine fork tests with coverage; Hardhat EDR fork coverage is not supported by this setup. Any skipped fork test is a failed production gate and must be investigated.

### Fresh Slither/SARIF workflow

`slither.config.json` writes `./slither-report.sarif`; `.gitignore` ignores that exact file. Both Slither package scripts first remove the prior report so an old SARIF cannot be mistaken for current analysis:

```bash
pnpm lint:slither:high
pnpm lint:slither
```

For the full local audit sequence use:

```bash
pnpm audit
```

Archive the newly generated `blockchain/slither-report.sarif` as a release artifact outside the ignored worktree, together with the Slither version and command output. Do not use the existing ignored report as evidence unless its creation command and commit are recorded.

**Slither caveat:** current OpenZeppelin account/community-contract dependencies can trigger Slither/Solc partial-IR incompatibilities. A successful partial analysis does not prove that `A7A5Account`, WebAuthn/EIP-7702 implementations, factories, or inherited paymaster paths were analyzed. Record every skipped/uncompiled contract and the exact compiler error separately, and obtain manual or alternate-tool coverage for those contracts. Never describe a partial-IR run as a clean full-repository result.

The final Slither and release gate are intentionally not run as part of documentation preparation. They must run on the frozen release commit.

## 3. On-chain preflight

Generate operator-specific parameters and validate the RPC, chain, deployer balance, multisig code, token/pool/router/quoter/EntryPoint/feed code:

```bash
pnpm predeploy:prepare mainnet
```

Review `.ignition-parameters/mainnet.json` without publishing secrets. Confirm it contains the intended `productionOwner` under `OracleStack`, `Paymasters`, and `SwapStack`, and the approved funding/TWAP/staleness values.

Independently verify:

- A7A5, wA7A5, and USDT each report 6 decimals.
- `wA7A5.A7A5()` equals the approved A7A5 address.
- V2 pair tokens are exactly A7A5 and USDT, both reserves are non-zero, and reserves are plausible.
- V3 pool tokens are exactly wA7A5 and USDT, its fee equals `UNIV3_FEE_TIER` (default 500), liquidity is non-zero, and `observe([1800, 0])` succeeds.
- SwapRouter02, QuoterV2, EntryPoint v0.8, and Chainlink feed match reviewed mainnet addresses.
- Chainlink `latestRoundData()` has a positive answer, a complete round, and an `updatedAt` within the approved staleness policy.
- The production multisig can submit `acceptOwnership()` transactions.

## 4. Funding

The default module sends 5 ETH deposit plus 1 ETH stake to **each** paymaster: 12 ETH total, plus contract-deployment and verification gas. Fund the deployer above that total with a reviewed reserve. The preflight only checks for a non-zero balance; it does not prove sufficiency.

Do not pre-fund undeployed addresses from a hand-computed address unless the exact Ignition nonce/deployment plan has been independently verified. Ignition funds the paymasters through `deposit()` and `addStake(86_400)` after deployment.

## 5. Deployment order

`pnpm deploy:mainnet` deploys the aggregate `A7A5AA` module. Ignition resolves dependencies, but the effective order is:

1. `A7A5UsdtTwapOracle`.
2. `A7A5NativeOracle` and `UsdtNativeOracle`.
3. `A7A5Paymaster` and `UsdtPaymaster`.
4. Deposit and stake both paymasters at EntryPoint.
5. `PoolsFacade`, then `ParaSwap`.
6. `A7A5WebAuthnAccount` implementation and `A7A5EIP7702Account` delegate.
7. `A7A5AccountFactory` with facade, ParaSwap, and both paymasters as allowed spenders.
8. ECDSA/UUPS `A7A5Account` implementation.
9. `A7A5AccountFactoryV2` with the same allowed spenders.
10. Nominate `PRODUCTION_OWNER` on the three oracles, two paymasters, PoolsFacade, and ParaSwap.

Execute once from the frozen commit:

```bash
pnpm deploy:mainnet
```

This command runs preflight again and deploys with `--verify`. Do not interrupt or rerun with a different parameter file. If interrupted, inspect the Ignition journal and resume the same deployment; do not manually redeploy individual contracts unless the release owner approves a new deployment.

## 6. Ownership acceptance

Ignition's `transferOwnership` calls only nominate the multisig. From `PRODUCTION_OWNER`, call `acceptOwnership()` on:

- `A7A5UsdtTwapOracle`
- `A7A5NativeOracle`
- `UsdtNativeOracle`
- `A7A5Paymaster`
- `UsdtPaymaster`
- `PoolsFacade`
- `ParaSwap`

For each contract, verify `owner() == PRODUCTION_OWNER` and `pendingOwner() == address(0)` after execution. Until all seven acceptances settle, the deployer remains owner and the handoff is incomplete. Factories and account implementations do not have this protocol-admin ownership transfer.

## 7. Verification and address publication

Confirm Etherscan source verification, compiler version, optimizer settings, constructor arguments, and bytecode for every deployed contract. If automatic verification failed, use the exact Ignition artifact and constructor arguments; do not flatten or recompile with changed settings.

Treat `ignition/deployments/chain-1/deployed_addresses.json` and its journal/build info as the deployment record. Review and publish the resulting addresses to:

- `packages/contracts/src/addresses.ts`
- generated consumer ABIs via `pnpm build` / `pnpm export-artifacts`
- `backend/contracts/addresses.json` and `backend/contracts/abis/`
- frontend environment/config values
- subgraph/backend deployment configuration
- the signed release record

Do not copy stale addresses from a previous `chain-1` directory. Consumers should update only after ownership acceptance and smoke checks.

## 8. Post-deployment sanity and smoke checks

Read and record all immutable dependencies and compare them with the approved manifest. Then check:

- TWAP oracle `twapWindow() == 1800`, `latestAnswer() > 0`, `decimals() == 8`, and `latestRoundData()` succeeds.
- Native oracles point to the approved TWAP/Chainlink contracts, expose the approved `maxStaleness`, and return positive `tokenPrice()` values.
- A7A5 paymaster points to the TWAP-composed native oracle. It must never point to `A7A5UsdtV2Oracle`.
- Both paymasters report the correct EntryPoint, gas token, oracle, deposit, stake, and unstake delay.
- Facade token/pair/router/quoter/fee immutables match the manifest.
- ParaSwap reads the deployed facade and correct token/quoter/router addresses.
- Both factories expose the expected implementations and return `true` only for the four intended allowed spenders.

Using small approved amounts, quote and execute with non-zero `amountOutMin`:

- Facade DIRECT and, where economically selected, MIXED BUY/SELL.
- Facade wA7A5 BUY/SELL.
- ParaSwap direct A7A5/USDT, route 11 A7A5/wA7A5, and one two-hop route.
- One WebAuthn counterfactual deployment and one ECDSA factory prediction/deployment.
- One sponsored operation per paymaster after the user account grants the required token allowance.

Compare emitted recipient-aware events and measured recipient deltas. Do not use production funds for broad exploratory testing.

## 9. Pause, incident response, and rollback

There is no proxy upgrade or automatic rollback for PoolsFacade, ParaSwap, paymasters, or oracles. The ECDSA user accounts are UUPS-upgradeable by each account owner; protocol operators cannot centrally upgrade them.

If a swap issue is detected:

1. Multisig calls `pause()` on both `PoolsFacade` and `ParaSwap`.
2. Remove the published router addresses from clients and stop order submission.
3. Diagnose on the pinned fork and deploy a new reviewed stack if necessary.

If oracle or sponsorship is unsafe:

1. Multisig calls `pause()` on both paymasters.
2. Do not replace the A7A5 paymaster oracle with the V2 spot oracle.
3. Deploy and verify a corrected TWAP/native oracle, sanity-check it, then call `setOracle()` from the multisig.
4. Resume only after fresh simulation and monitoring.

To retire a paymaster, keep it paused, use the inherited owner-authorized EntryPoint withdrawal/unstake process, wait the unlock delay, withdraw to the multisig, and remove its address from clients/bundlers.

If deployment fails before ownership acceptance, do not publish addresses. Preserve journals and transaction hashes, stop the deployer, determine whether Ignition can safely resume, and otherwise create a new reviewed deployment manifest. If a defect is found after publication, pause first; rollback means migrating clients and liquidity/operations to a newly deployed reviewed version, not mutating immutable dependencies.
