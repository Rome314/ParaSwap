/**
 * Copies selected Hardhat artifact ABIs into packages/contracts for @para-swap/contracts consumers.
 * Run after `hardhat build`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS = path.join(ROOT, 'blockchain/artifacts');
const OUT = path.join(ROOT, 'packages/contracts/src/abis');
const BACKEND_CONTRACTS = path.join(ROOT, 'backend/contracts');
const BACKEND_ABIS = path.join(BACKEND_CONTRACTS, 'abis');

type ExportSpec = {
  /** Output filename (without path) */
  out: string;
  /** Relative path under blockchain/artifacts to artifact JSON */
  artifact: string;
};

// NOTE: WA7A5 is intentionally absent. Its source (`a7a5/contracts/wA7A5.sol`)
// pins `=0.8.22` but pulls in OpenZeppelin ERC20Permit (`^0.8.24` since OZ
// v5.5.0), so it cannot be compiled here. Its ABI is hand-maintained at
// packages/contracts/src/abis/WA7A5.json and shipped to the backend below.
const EXPORTS: ExportSpec[] = [
  {out: 'A7A5.json', artifact: 'contracts/vendor/A7A5Artifact.sol/A7A5Artifact.json'},
  {out: 'ParaSwap.json', artifact: 'contracts/ParaSwap.sol/ParaSwap.json'},
  {out: 'PoolsFacade.json', artifact: 'contracts/PoolsFacade.sol/PoolsFacade.json'},
  {out: 'A7A5NativeOracle.json', artifact: 'contracts/oracle/A7A5NativeOracle.sol/A7A5NativeOracle.json'},
  {
    out: 'A7A5UsdtTwapOracle.json',
    artifact: 'contracts/oracle/A7A5UsdtTwapOracle.sol/A7A5UsdtTwapOracle.json',
  },
  {out: 'A7A5Paymaster.json', artifact: 'contracts/paymaster/A7A5Paymaster.sol/A7A5Paymaster.json'},
  {
    out: 'SimpleA7A5Account.json',
    artifact: 'contracts/account/SimpleA7A5Account.sol/SimpleA7A5Account.json',
  },
];

function findArtifact(relativePath: string): string | null {
  const direct = path.join(ARTIFACTS, relativePath);
  if (fs.existsSync(direct)) return direct;

  // Hardhat may nest artifacts differently — search by contract base name
  const base = path.basename(relativePath);
  const matches: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === base) matches.push(full);
    }
  }

  walk(ARTIFACTS);
  if (matches.length === 0) return null;

  // Prefer a7a5 npm package artifacts over local contracts when both exist
  const preferred = matches.find((p) => p.includes(`${path.sep}a7a5${path.sep}`));
  return preferred ?? matches[0];
}

function exportAbi(spec: ExportSpec) {
  const artifactPath = findArtifact(spec.artifact);
  if (!artifactPath) {
    console.warn(`[export-artifacts] skip ${spec.out}: artifact not found (${spec.artifact})`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {abi?: unknown};
  if (!raw.abi) {
    console.warn(`[export-artifacts] skip ${spec.out}: no abi field in ${artifactPath}`);
    return;
  }

  fs.mkdirSync(OUT, {recursive: true});
  const outPath = path.join(OUT, spec.out);
  fs.writeFileSync(outPath, `${JSON.stringify(raw.abi, null, 2)}\n`);
  console.log(`[export-artifacts] ${spec.out} ← ${path.relative(ROOT, artifactPath)}`);
}

const ABI_FILES_FOR_BACKEND = [
  'A7A5.json',
  'WA7A5.json',
  'ParaSwap.json',
  'PoolsFacade.json',
  'A7A5NativeOracle.json',
  'A7A5UsdtTwapOracle.json',
  'A7A5Paymaster.json',
  'SimpleA7A5Account.json',
  'erc20.min.json',
];

async function syncBackendContracts() {
  fs.mkdirSync(BACKEND_ABIS, {recursive: true});

  for (const file of ABI_FILES_FOR_BACKEND) {
    const from = path.join(OUT, file);
    if (!fs.existsSync(from)) {
      console.warn(`[export-artifacts] skip backend ${file}: not in packages/contracts`);
      continue;
    }
    fs.copyFileSync(from, path.join(BACKEND_ABIS, file));
  }

  try {
    const {ethereum} = await import('../../packages/contracts/src/addresses.ts');
    fs.writeFileSync(path.join(BACKEND_CONTRACTS, 'addresses.json'), `${JSON.stringify({ethereum}, null, 2)}\n`);
    console.log('[export-artifacts] backend/contracts/addresses.json');
  } catch (err) {
    console.warn('[export-artifacts] skip addresses.json:', err);
  }

  console.log('[export-artifacts] synced ABIs → backend/contracts/abis/');
}

async function main() {
  if (!fs.existsSync(ARTIFACTS)) {
    console.error('[export-artifacts] blockchain/artifacts missing — run `hardhat build` first');
    process.exit(1);
  }

  for (const spec of EXPORTS) exportAbi(spec);
  await syncBackendContracts();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
