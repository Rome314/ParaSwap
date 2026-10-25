# Subgraph

Follow the root `AGENTS.md`. Keep entity definitions in `schema.graphql` and
event handlers in `src/`. ABIs are synced from `packages/contracts` by
`scripts/sync-abis.ts`; generated bindings and WASM output are disposable.
Run root `npm run subgraph:build`. Compilation does not verify addresses, deployment
blocks, event completeness, or live indexing. The current zero-address sources and
`startBlock: 0` placeholders need review before any deployment. Publishing to Studio
or starting an external indexing service requires explicit task scope.
