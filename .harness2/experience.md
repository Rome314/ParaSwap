# Bounded Harness2 lessons — 2026-10-24

Starting source: Cursor `3zj9`, compared with remote commit
`211f6cac64c50f23e7a3816422c629dbef0f5a70`. The original main checkout's ref file
reported `9ef5ae6533103c84113c71db634f02abb5e11d9f`, but its commit/index contents
were unavailable as cloud placeholders. Do not treat that ref as a verified source baseline.

## Cue: project reads stall before useful inspection

- Baseline: a bounded read of `blockchain/package.json` timed out after three seconds;
  Git and discovery that opened ignore files also stalled.
- Change: metadata-only preflight detects macOS dataless flags, missing required files,
  and missing tools without opening credentials or dependencies.
- Candidate: reported project/Git placeholders with recovery steps instead of opening
  those files. Seven deterministic/mocked regression cases cover local files, cloud flags,
  missing files/tools, exclusions, authored types, and symlink traversal.
- Evidence: `.harness2/validation.json`, `scripts/preflight.py`, and its tests.
- Confidence: high for this observed macOS failure mode. It does not restore cloud
  files or prove universal filesystem/read-timeout protection. Source recovery was separate.

## Cue: a local check depends on saved operator configuration and historical installs

- Baseline: root `npm ci --dry-run` failed on a tsx lock mismatch; the historical
  frontend production build failed on ethers v5/v6 resolution. The credential-free
  contract command had 13 quote-test failures because the quote suite needed a fork.
- Change: one npm workspace lock, explicit artifact build order, isolated local Hardhat
  runner, exact direct dependency versions during repair, typed test bindings, and the
  same fork readiness gate for quotes as other fork suites.
- Candidate: local contract suite reached 156 passing, 82 pending, zero failing.
  Required fork mode remains a separate prerequisite gate, not a renamed unit pass.
  Full composed pipeline results are recorded in the evidence file.
- Evidence: `.harness2/validation.json`, root scripts, lockfile, scoped instructions.
- Confidence: high for repeatability of the executed local checks; limited for browser,
  fork, deployment, live indexer, or future agent behavior. Product build repairs are
  recorded separately from the executable workflow improvement.

These were deterministic tool runs and source/configuration checks. No live model
benchmark, paid model call, delegated agent evaluation, or upstream research executor
was run. Passing these checks does not establish general agent-accuracy improvements.
