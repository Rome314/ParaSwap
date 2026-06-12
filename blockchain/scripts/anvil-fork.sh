#!/usr/bin/env bash
# Starts an Anvil mainnet fork on http://127.0.0.1:8545.
# Reads ALCHEMY_API_KEY / ALCHEMY_RPC_URL and FORK_BLOCK from blockchain/.env.
#
# Requires Foundry — install once with:
#   curl -L https://foundry.paradigm.xyz | bash && foundryup
#
#   npm run anvil:fork   (from blockchain/)

set -euo pipefail

if ! command -v anvil &>/dev/null; then
  echo "Error: anvil not found. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

# Load .env from blockchain/ (the CWD when invoked via npm run)
if [ -f ".env" ]; then
  set -a; source .env; set +a
fi

ALCHEMY_KEY="${ALCHEMY_API_KEY:-}"
FORK_URL="${ALCHEMY_RPC_URL:-}"
if [ -z "$FORK_URL" ] && [ -n "$ALCHEMY_KEY" ]; then
  FORK_URL="https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}"
fi

if [ -z "$FORK_URL" ]; then
  echo "Error: set ALCHEMY_API_KEY or ALCHEMY_RPC_URL in blockchain/.env" >&2
  exit 1
fi

FORK_BLOCK="${FORK_BLOCK:-25271161}"

echo "Starting Anvil mainnet fork at block ${FORK_BLOCK}..."
echo "RPC: http://127.0.0.1:8545  chainId=1"
echo "Now run: npm run fork:deploy (in another terminal)"
echo "Ctrl-C to stop."
echo ""

exec anvil \
  --fork-url "${FORK_URL}" \
  --fork-block-number "${FORK_BLOCK}" \
  --chain-id 1 \
  --accounts 10 \
  --balance 10000 \
  --mnemonic "test test test test test test test test test test test junk" \
  --port 8545 \
  --host 127.0.0.1
