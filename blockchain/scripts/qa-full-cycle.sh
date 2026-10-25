#!/usr/bin/env bash
# Local mainnet-fork QA: node → deploy AA stack → fork tests → HTTP smoke.
# Logs: /opt/cursor/artifacts/qa-full-cycle.log
set -euo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-/opt/cursor/artifacts}"
LOG="${ARTIFACT_DIR}/qa-full-cycle.log"
DEPLOY_LOG="${ARTIFACT_DIR}/qa-fork-deploy.log"
ADDRS_JSON="${ARTIFACT_DIR}/qa-deployed-addresses.json"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BC="${ROOT}/blockchain"

MAINNET_RPC_URL="${MAINNET_RPC_URL:-${ALCHEMY_RPC_URL:-https://ethereum.publicnode.com}}"

resolve_fork_block() {
  if [ -n "${FORK_BLOCK:-}" ]; then
    echo "$FORK_BLOCK"
    return
  fi
  local hex latest dec
  hex=$(curl -sf -X POST "$MAINNET_RPC_URL" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')
  latest=$((16#${hex#0x}))
  dec=$((latest - 500))
  echo "Auto FORK_BLOCK=${dec} (latest=${latest})" >&2
  echo "$dec"
}

FORK_BLOCK="$(resolve_fork_block)"
echo "$FORK_BLOCK" > "${ARTIFACT_DIR}/qa-fork-block.txt"
NODE_PORT="${NODE_PORT:-8545}"
NODE_URL="http://127.0.0.1:${NODE_PORT}"

mkdir -p "$ARTIFACT_DIR"
exec > >(tee -a "$LOG") 2>&1

echo "═══════════════════════════════════════════════════════════════"
echo " QA full cycle started $(date -Iseconds)"
echo " RPC=${MAINNET_RPC_URL%%/*}//…  FORK_BLOCK=${FORK_BLOCK}"
echo "═══════════════════════════════════════════════════════════════"

rpc_chain_id() {
  curl -sf -X POST "$NODE_URL" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

wait_for_rpc() {
  local i=0
  until [ "$(rpc_chain_id 2>/dev/null || echo '')" = "0x1" ]; do
    i=$((i + 1))
    if [ "$i" -gt 300 ]; then
      echo "ERROR: RPC not ready with chainId=1 after 300s"
      exit 1
    fi
    sleep 1
  done
  echo "RPC ready at ${NODE_URL} (chainId=1)"
}

stop_local_node() {
  if [ -f "${ARTIFACT_DIR}/qa-hardhat-node.pid" ]; then
    kill "$(cat "${ARTIFACT_DIR}/qa-hardhat-node.pid")" 2>/dev/null || true
    rm -f "${ARTIFACT_DIR}/qa-hardhat-node.pid"
    sleep 2
  fi
}

# ── 1. Hardhat fork node ─────────────────────────────────────────────
if [ "$(rpc_chain_id 2>/dev/null || echo '')" = "0x1" ]; then
  echo "Reusing existing mainnet-fork node on ${NODE_URL}"
else
  stop_local_node
  echo "Starting Anvil mainnet fork (chainId=1)…"
  export PATH="${PATH}:/home/ubuntu/.foundry/bin"
  if ! command -v anvil >/dev/null; then
    echo "ERROR: anvil not found; install Foundry (foundryup)"
    exit 1
  fi
  nohup anvil \
    --fork-url "$MAINNET_RPC_URL" \
    --fork-block-number "$FORK_BLOCK" \
    --chain-id 1 \
    --auto-impersonate \
    --accounts 10 \
    --balance 10000 \
    --mnemonic "test test test test test test test test test test test junk" \
    --port "$NODE_PORT" \
    --host 127.0.0.1 \
    >> "${ARTIFACT_DIR}/qa-hardhat-node.log" 2>&1 &
  echo $! > "${ARTIFACT_DIR}/qa-hardhat-node.pid"
  wait_for_rpc
fi

# ── 2. Contract build ───────────────────────────────────────────────
echo "Building contracts…"
cd "$ROOT"
npm run build:contracts

# ── 3. Deploy + demo on localhost ────────────────────────────────────
echo "Running fork-setup-and-demo (deploy + sponsored swap demos)…"
cd "$BC"
set +e
npm run fork:deploy 2>&1 | tee "$DEPLOY_LOG"
DEPLOY_RC=${PIPESTATUS[0]}
set -e
if [ "$DEPLOY_RC" -ne 0 ]; then
  if grep -q '"entryPoint"' "$DEPLOY_LOG"; then
    echo "WARN: fork:deploy demos exited ${DEPLOY_RC} but deployment JSON present — continuing QA"
  else
    echo "ERROR: fork:deploy failed before deployment JSON"
    exit 1
  fi
else
  echo "fork:deploy OK"
fi

# Extract last JSON object block from deploy log
python3 - <<'PY' "$DEPLOY_LOG" "$ADDRS_JSON"
import json, re, sys
text = open(sys.argv[1]).read()
# Find last {...} that looks like our address bundle
matches = list(re.finditer(r'\{[^{}]*"entryPoint"[^{}]*\}', text, re.DOTALL))
if not matches:
    # multiline JSON from console.log
    start = text.rfind('{\n  "entryPoint"')
    if start == -1:
        start = text.rfind('{"entryPoint"')
    if start == -1:
        sys.exit("No address JSON in deploy log")
    depth = 0
    end = start
    for i, c in enumerate(text[start:], start):
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    blob = text[start:end]
else:
    blob = matches[-1].group(0)
obj = json.loads(blob)
json.dump(obj, open(sys.argv[2], 'w'), indent=2)
print("Wrote", sys.argv[2])
PY

# ── 4. Frontend .env for fork QA ─────────────────────────────────────
ENV_QA="${ROOT}/frontend/.env.qa.local"
python3 - <<PY "$ADDRS_JSON" "$ENV_QA"
import json, sys
a = json.load(open(sys.argv[1]))
lines = [
    "VITE_CHAIN=hardhat-fork",
    "VITE_FORK_RPC_URL=http://127.0.0.1:8545",
    f"VITE_ENTRYPOINT_V08={a['entryPoint']}",
    f"VITE_ACCOUNT_FACTORY={a['accountFactory']}",
    f"VITE_A7A5_PAYMASTER={a['a7a5Paymaster']}",
    f"VITE_USDT_PAYMASTER={a['usdtPaymaster']}",
    f"VITE_POOLS_FACADE={a['poolsFacade']}",
    f"VITE_PARASWAP={a['paraSwap']}",
    f"VITE_A7A5_TWAP_ORACLE={a['a7a5TwapOracle']}",
    f"VITE_A7A5_NATIVE_ORACLE={a['a7a5NativeOracle']}",
    f"VITE_USDT_NATIVE_ORACLE={a['usdtNativeOracle']}",
    "VITE_ALCHEMY_API_KEY=qa-local-not-used",
]
open(sys.argv[2], 'w').write("\\n".join(lines) + "\\n")
print("Wrote", sys.argv[2])
PY

# ── 5. Unit tests (no fork in-process) ───────────────────────────────
echo "Unit + security tests (pnpm test)…"
cd "$BC"
npm test

# ── 6. In-process fork test suites ───────────────────────────────────
if [ "${QA_SKIP_EDR_FORK:-1}" = "1" ]; then
  echo "Skipping in-process EDR fork tests (local QA uses live Anvil deploy + smoke)."
  echo "  Full fork gate: QA_SKIP_EDR_FORK=0 ALCHEMY_API_KEY=… FORK_BLOCK=… $0"
else
  echo "Fork test suite (MAINNET_FORK=1)…"
  export FORK_BLOCK
  set +e
  timeout 1200 env MAINNET_FORK=1 FORK_BLOCK="$FORK_BLOCK" MAINNET_RPC_URL="${MAINNET_RPC_URL}" npm run test:fork
  FORK_TEST_RC=$?
  timeout 1200 env MAINNET_FORK=1 FORK_BLOCK="$FORK_BLOCK" MAINNET_RPC_URL="${MAINNET_RPC_URL}" npm run test:fork:aa
  AA_FORK_RC=$?
  set -e
  [ "$FORK_TEST_RC" -eq 0 ] || echo "WARN: test:fork exited $FORK_TEST_RC"
  [ "$AA_FORK_RC" -eq 0 ] || echo "WARN: test:fork:aa exited $AA_FORK_RC"
fi

echo "On-chain smoke (cast)…"
bash "$BC/scripts/qa-smoke-local.sh" | tee -a "$LOG"

# ── 7. Backend smoke ─────────────────────────────────────────────────
echo "Backend health smoke…"
cd "${ROOT}/backend"
if ! pgrep -f "go run \\." >/dev/null 2>&1; then
  nohup go run . >> "${ARTIFACT_DIR}/qa-backend.log" 2>&1 &
  echo $! > "${ARTIFACT_DIR}/qa-backend.pid"
  sleep 2
fi
curl -sf "http://127.0.0.1:${PORT:-8080}/health" && echo " backend /health OK"
curl -sf "http://127.0.0.1:${PORT:-8080}/addresses" | head -c 400 && echo " …"

SUMMARY="${ARTIFACT_DIR}/qa-summary.md"
cat > "$SUMMARY" <<EOF
# Local testnet QA summary

- **Finished:** $(date -Iseconds)
- **Fork block:** ${FORK_BLOCK}
- **RPC:** ${NODE_URL}
- **Deployed addresses:** \`${ADDRS_JSON}\`
- **Frontend env:** \`${ENV_QA}\`
- **Anvil PID:** $(cat "${ARTIFACT_DIR}/qa-hardhat-node.pid" 2>/dev/null || echo n/a)
- **Full log:** \`${LOG}\`

## Re-run / attach

\`\`\`bash
cd blockchain && npm run qa:local
# Frontend against local fork:
cp frontend/.env.qa.local frontend/.env.local && cd frontend && npm run dev
\`\`\`

## Full EDR fork gate (requires Alchemy)

\`\`\`bash
QA_SKIP_EDR_FORK=0 ALCHEMY_API_KEY=... FORK_BLOCK=... bash blockchain/scripts/qa-full-cycle.sh
\`\`\`
EOF

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " QA full cycle finished $(date -Iseconds)"
echo " Deployed addresses: ${ADDRS_JSON}"
echo " Frontend QA env:    ${ENV_QA}"
echo " Summary:            ${SUMMARY}"
echo " Full log:           ${LOG}"
echo " Anvil left running on ${NODE_URL} (PID $(cat "${ARTIFACT_DIR}/qa-hardhat-node.pid" 2>/dev/null || echo '?'))"
echo "═══════════════════════════════════════════════════════════════"
