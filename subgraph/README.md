# ParaSwap Subgraph

Indexes A7A5 protocol events, wA7A5 transfers (wrap/unwrap), ParaSwap `Swapped`, and PoolsFacade swap events.

## Prerequisites

1. Run `npm run build:contracts` from the repo root (populates ABIs).
2. Set deployed addresses in `networks.json` and `subgraph.yaml` for ParaSwap and PoolsFacade.
3. Pin `startBlock` to each contract deployment block before production deploy.

## Local Graph Node

```bash
cp .env.example .env   # set ETHEREUM_RPC_URL
docker compose up -d
npm run sync-abis
npm run codegen
npm run create-local
npm run deploy-local
```

Query endpoint: http://localhost:8000/subgraphs/name/para-swap/para-swap

## Subgraph Studio

```bash
export GRAPH_DEPLOY_KEY=...
npm run deploy:studio
```

## ABI sync

`npm run sync-abis` copies ABIs from `@para-swap/contracts` (`packages/contracts/src/abis`).
