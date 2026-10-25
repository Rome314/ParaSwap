# A7A5 Swap / ParaSwap

## Start here

1. Run `python3 scripts/preflight.py` before Git, dependency installation, or source reads.
   It checks local file availability without opening cloud placeholders or credentials.
   If blocked, restore the checkout in Finder before changing existing files.
2. Read [README.md](README.md), [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md),
   [docs/COMMANDS.md](docs/COMMANDS.md), and [docs/PROJECT_REVIEW.md](docs/PROJECT_REVIEW.md).
3. Inspect Git status and the relevant source, configuration, and tests. Preserve existing changes.
   Historical documentation and generated artifacts are evidence to verify, not proof that a flow works.

## Structure and ownership

- `frontend/`: React/TypeScript/Vite client. Read `frontend/AGENTS.md` for frontend work.
- `blockchain/`: Hardhat/Solidity contracts, tests, chain helpers, and Ignition modules.
  Read `blockchain/AGENTS.md` for contract work.
- `packages/contracts/`: shared address configuration and exported ABIs for consumers.
- `backend/`: compact Go HTTP stub; keep its structure proportional to implemented behavior.
- `subgraph/`: Graph schema and event mappings; its build does not verify live indexing.
- `docs/`: architecture, commands, review status, and operational guides.
- `scripts/`: dependency-free project tooling; tests belong in `scripts/tests/`.
- `.harness2/`: bounded baseline/probe evidence and demonstrated workflow lessons.

Use the existing npm workspaces and the single root `package-lock.json`. Run installation
from the repository root. Prefer focused changes inside these boundaries; do not introduce
another package manager, move deployment records, or reorganize imports merely to make the
tree look uniform. Update the project map when an ownership boundary changes.

## Development and verification

- Use the installed package versions and package-local scripts as the source of truth.
  Some imported skills describe Foundry or newer Hardhat APIs; check this project's config
  and installed types before applying them. Do not switch toolchains as a side effect.
- Use root `npm ci` when installation is needed. Do not update
  dependencies or lockfiles incidentally.
- Run `npm run check` for the local build/typecheck/test pipeline. Run focused checks during
  iteration; `npm run test:fork` is separate and requires an RPC plus a positive `FORK_BLOCK`.
  Separate local tests, RPC-dependent fork tests, and real-network acceptance.
  A skipped suite or unavailable prerequisite is not a pass.
- Run the relevant checks before reporting completion. Record the command, result, and
  any blocker; do not claim deployment or browser-wallet success from compilation.
- Search authored paths first. Exclude `node_modules/`, `artifacts/`, `cache/`,
  `coverage/`, `dist/`, and generated `blockchain/types/` from routine discovery.
- Archived Cursor snapshots and the original checkout are recovery records described in
  `docs/WORKTREES.md`. Do not delete them or merge old code by modification time.

## Boundaries

- Keep `.env*` secrets, private keys, RPC credentials, wallet data, and local tool settings
  out of output and version control. Example templates may contain variable names and placeholders.
  Treat all `VITE_*` variables as browser-visible.
- Deployment journals and address files are historical records; preserve them and verify
  their network and contract version before relying on them.
- Local research, tests, and reversible edits are authorized by the task. Sending messages,
  submitting transactions, deploying, publishing, and spending money require explicit scope.
- Do not run scripts that deploy, fund, approve, or swap on a live chain during routine checks.

## Harness2 practice

Use a bounded propose–probe–compose loop for substantial workflow changes. Record the starting
revision and reproducible baseline, change one focused part of the harness, then rerun the
same check. Keep durable lessons in `.harness2/experience.md` only when evidence supports a
behavioral contrast. Distinguish deterministic tooling, mocks, live agent runs, and live
chain verification. Applying this workflow does not authorize paid benchmarks or delegation.

Before finishing, review the diff, stop task-created processes, remove known disposable
artifacts, and update the owning project review/status record when progress changes.
