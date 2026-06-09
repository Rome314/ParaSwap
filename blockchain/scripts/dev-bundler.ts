// Minimal ERC-4337 JSON-RPC bundler for local fork development.
// Listens on :4337 — eth_sendUserOperation, eth_estimateUserOperationGas,
// eth_supportedEntryPoints, eth_getUserOperationReceipt.
//
//   npm run bundler:dev
import http from 'node:http';
import { network } from 'hardhat';
import { ADDRESSES } from '../common/addresses.js';
import { ENTRYPOINT_ABI } from '../common/erc4337.js';

const PORT = Number(process.env.BUNDLER_PORT ?? 4337);
const ENTRY_POINT = process.env.ENTRYPOINT ?? ADDRESSES.ENTRYPOINT_V08;

type RpcUserOp = {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: string;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
};

type PackedUserOp = [
  string,
  bigint,
  string,
  string,
  string,
  bigint,
  string,
  string,
  string,
];

const receipts = new Map<string, Record<string, unknown>>();

function rpcToPacked(op: RpcUserOp): PackedUserOp {
  return [
    op.sender,
    BigInt(op.nonce),
    op.initCode,
    op.callData,
    op.accountGasLimits,
    BigInt(op.preVerificationGas),
    op.gasFees,
    op.paymasterAndData,
    op.signature,
  ];
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function main() {
  const conn = await network.connect({ network: 'localhost', chainType: 'l1' });
  const { ethers } = conn;
  const [bundlerSigner] = await ethers.getSigners();
  const beneficiary = await bundlerSigner.getAddress();
  const entryPoint = new ethers.Contract(ENTRY_POINT, ENTRYPOINT_ABI, bundlerSigner);

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { error: 'Method not allowed' });
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    let payload: { id?: number; method?: string; params?: unknown[] };
    try {
      payload = JSON.parse(body);
    } catch {
      json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }

    const { id = 1, method, params = [] } = payload;

    try {
      if (method === 'eth_supportedEntryPoints') {
        json(res, 200, { jsonrpc: '2.0', id, result: [ENTRY_POINT] });
        return;
      }

      if (method === 'eth_estimateUserOperationGas') {
        const [rpcOp] = params as [RpcUserOp];
        const op = rpcToPacked(rpcOp);
        try {
          await entryPoint.handleOps.staticCall([op], beneficiary);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          json(res, 200, {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: `Simulation failed: ${msg}` },
          });
          return;
        }
        json(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            preVerificationGas: rpcOp.preVerificationGas,
            verificationGasLimit: '0x927c0',
            callGasLimit: '0x124f80',
            paymasterVerificationGasLimit: '0x7a120',
            paymasterPostOpGasLimit: '0x30d40',
          },
        });
        return;
      }

      if (method === 'eth_sendUserOperation') {
        const [rpcOp] = params as [RpcUserOp, string];
        const op = rpcToPacked(rpcOp);
        const userOpHash = await entryPoint.getUserOpHash(op);
        const tx = await entryPoint.handleOps([op], beneficiary);
        const receipt = await tx.wait();

        const stored = {
          userOpHash,
          entryPoint: ENTRY_POINT,
          sender: rpcOp.sender,
          nonce: rpcOp.nonce,
          paymaster: rpcOp.paymasterAndData.length > 42 ? rpcOp.paymasterAndData.slice(0, 42) : undefined,
          success: true,
          actualGasCost: '0x0',
          actualGasUsed: receipt?.gasUsed?.toString(16) ? `0x${receipt.gasUsed.toString(16)}` : '0x0',
          receipt: receipt
            ? {
                transactionHash: receipt.hash,
                blockNumber: `0x${receipt.blockNumber.toString(16)}`,
                blockHash: receipt.blockHash,
                gasUsed: `0x${receipt.gasUsed.toString(16)}`,
              }
            : undefined,
        };
        receipts.set(userOpHash, stored);
        json(res, 200, { jsonrpc: '2.0', id, result: userOpHash });
        return;
      }

      if (method === 'eth_getUserOperationReceipt') {
        const [hash] = params as [string];
        json(res, 200, { jsonrpc: '2.0', id, result: receipts.get(hash) ?? null });
        return;
      }

      json(res, 200, {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      json(res, 200, { jsonrpc: '2.0', id, error: { code: -32603, message: msg } });
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Dev bundler listening on http://127.0.0.1:${PORT}`);
    console.log(`EntryPoint: ${ENTRY_POINT}`);
    console.log(`Beneficiary: ${beneficiary}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
