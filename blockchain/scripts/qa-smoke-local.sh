#!/usr/bin/env bash
# Quick on-chain smoke against deployed local fork (requires Anvil on 8545 + addresses JSON).
set -euo pipefail
ARTIFACT_DIR="${ARTIFACT_DIR:-/opt/cursor/artifacts}"
ADDRS="${ARTIFACT_DIR}/qa-deployed-addresses.json"
RPC="${RPC:-http://127.0.0.1:8545}"
export PATH="${PATH}:/home/ubuntu/.foundry/bin"

if [ ! -f "$ADDRS" ]; then
  echo "Missing $ADDRS — run qa-full-cycle.sh deploy first"
  exit 1
fi

TWAP=$(jq -r .a7a5TwapOracle "$ADDRS")
FACADE=$(jq -r .poolsFacade "$ADDRS")
EP=$(jq -r .entryPoint "$ADDRS")

chain_id=$(cast chain-id --rpc-url "$RPC")
twap=$(cast call "$TWAP" 'latestAnswer()(int256)' --rpc-url "$RPC")
paused=$(cast call "$FACADE" 'paused()(bool)' --rpc-url "$RPC")
ep_size=$(cast codesize "$EP" --rpc-url "$RPC")
echo "Smoke: chainId=$chain_id"
echo "Smoke: TWAP latestAnswer=$twap"
echo "Smoke: Facade paused=$paused"
echo "Smoke: EntryPoint code size=$ep_size"
[ "$chain_id" = "1" ] || { echo "FAIL: expected chainId 1"; exit 1; }
[ "$ep_size" -gt 0 ] || { echo "FAIL: EntryPoint has no code"; exit 1; }
echo "Smoke OK"
