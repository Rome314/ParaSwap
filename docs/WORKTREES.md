# Worktree recovery — 2026-10-24

Use `/Users/rome/Documents/Projects/coding/para-swap` on `codex/project-harness`.
The active Git database starts at remote commit
`211f6cac64c50f23e7a3816422c629dbef0f5a70` (`feat/contracts-polishing`).

The supplied Cursor directory contained three checkouts whose `.git` pointers still
referenced deleted `/Users/rome/coding/para-swap`. Git reported invalid repositories.
The original main checkout also had cloud-only Git metadata; bounded reads and
`git worktree repair` stalled, so that database was preserved intact.

`3zj9` was the most complete checkout. Against the newest remote branch, 278 compared
files matched; the sole differing tracked file was a TypeScript cache; five old
Sepolia module paths were absent. Its new `modules/sepolia/` held a partial relocation,
completed during setup. Copied source files were hash-verified before migration.
Later changes are visible in the active diff.

## Recovery locations

| Original | Preserved location |
| --- | --- |
| Original main checkout | `/Users/rome/Documents/Projects/coding/para-swap-original-20261024` |
| Cursor `3zj9` | `/Users/rome/.codex/archives/para-swap-20261024/cursor-3zj9` |
| Cursor `g5j2` | `/Users/rome/.codex/archives/para-swap-20261024/cursor-g5j2` |
| Cursor `qsb3` | `/Users/rome/.codex/archives/para-swap-20261024/cursor-qsb3` |

Every snapshot includes its original dependencies, local changes/configuration, and
Git metadata or pointer file. The original main folder stays in its cloud-managed
parent so preserving placeholders did not require downloading them.

The older snapshots differ: the bounded inventory found 52 differing authored files
in `g5j2` and 67 in `qsb3` relative to `3zj9`. Both retain `A7A5_multirouter.ts`;
`qsb3` also has older Sepolia paths. They were preserved rather than merged by timestamp.

These are recovery snapshots, not active worktrees. Their original `.git` pointer
files remain unchanged as evidence. The active repository lists one worktree. Do not
prune or delete the archives before reviewing unique work. They may contain credentials.

Cloud-only local commits, refs, and index state remain preserved in the original
checkout but were not imported into the recovered Git database. Restore those files
locally before future history reconciliation. Remote history and latest readable
source are available in the active checkout now.

## Future worktrees

Use the active checkout for ordinary work. Give any concurrent worktree a specific
owner and base ref. Inspect status and unique commits before removing it. After moving
a repository, use `git worktree repair` while metadata is available. Pruning removes
stale registrations; it does not recover source or reconcile changes.
