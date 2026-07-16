import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider, Wallet, getAddress, isAddress, ZeroAddress} from 'ethers';
import {ADDRESSES} from '../common/addresses.js';
import {SEPOLIA_ADDRESSES} from '../common/addresses-sepolia.js';

type Target = 'mainnet' | 'sepolia';
type Parameters = Record<string, Record<string, unknown>>;

const target = process.argv[2] as Target | undefined;
if (target !== 'mainnet' && target !== 'sepolia') {
  throw new Error('Usage: pnpm predeploy:prepare <mainnet|sepolia>');
}
const deploymentTarget: Target = target;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'ignition', 'parameters', `${target}.json`);
const outputPath = path.join(root, '.ignition-parameters', `${target}.json`);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function rpcUrlFor(deploymentTarget: Target): string {
  if (deploymentTarget === 'sepolia') {
    return process.env.SEPOLIA_RPC_URL?.trim() || required('ALCHEMY_API_KEY').replace(/^(.+)$/, 'https://eth-sepolia.g.alchemy.com/v2/$1');
  }
  return (
    process.env.MAINNET_RPC_URL?.trim() ||
    process.env.ALCHEMY_RPC_URL?.trim() ||
    required('ALCHEMY_API_KEY').replace(/^(.+)$/, 'https://eth-mainnet.g.alchemy.com/v2/$1')
  );
}

async function requireContract(provider: JsonRpcProvider, label: string, address: string) {
  if (!isAddress(address) || address === ZeroAddress) throw new Error(`${label} is not a valid non-zero address`);
  if ((await provider.getCode(address)) === '0x') throw new Error(`${label} has no code at ${address}`);
}

async function main() {
  const rpcUrl = rpcUrlFor(deploymentTarget);
  const privateKey = required('DEPLOYER_PRIVATE_KEY');
  const provider = new JsonRpcProvider(rpcUrl);
  const expectedChainId = deploymentTarget === 'mainnet' ? 1n : BigInt(SEPOLIA_ADDRESSES.CHAIN_ID);
  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId) {
    throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${network.chainId}`);
  }

  const deployer = new Wallet(privateKey, provider);
  const balance = await provider.getBalance(deployer.address);
  if (balance === 0n) throw new Error(`deployer ${deployer.address} has no native balance`);

  const parameters = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as Parameters;
  if (deploymentTarget === 'mainnet') {
    const productionOwnerInput = required('PRODUCTION_OWNER');
    if (!isAddress(productionOwnerInput) || productionOwnerInput === ZeroAddress) {
      throw new Error('PRODUCTION_OWNER must be a valid non-zero address');
    }
    const productionOwner = getAddress(productionOwnerInput);

    await Promise.all([
      requireContract(provider, 'PRODUCTION_OWNER multisig', productionOwner),
      requireContract(provider, 'A7A5', ADDRESSES.A7A5),
      requireContract(provider, 'wA7A5', ADDRESSES.WA7A5),
      requireContract(provider, 'USDT', ADDRESSES.USDT),
      requireContract(provider, 'V2 A7A5/USDT pair', ADDRESSES.V2_PAIR_USDT_A7A5),
      requireContract(provider, 'V3 wA7A5/USDT pool', ADDRESSES.V3_POOL_USDT_WA7A5),
      requireContract(provider, 'SwapRouter02', ADDRESSES.SWAP_ROUTER_02),
      requireContract(provider, 'QuoterV2', ADDRESSES.QUOTER_V2),
      requireContract(provider, 'EntryPoint v0.8', ADDRESSES.ENTRYPOINT_V08),
      requireContract(provider, 'Chainlink USDT/ETH feed', ADDRESSES.CHAINLINK_USDT_ETH),
    ]);

    for (const moduleName of ['OracleStack', 'Paymasters', 'SwapStack']) {
      parameters[moduleName] = {...parameters[moduleName], productionOwner};
    }
  } else {
    await requireContract(provider, 'EntryPoint v0.8', SEPOLIA_ADDRESSES.ENTRYPOINT_V08);
    const latestBlock = await provider.getBlock('latest');
    if (!latestBlock) throw new Error('Sepolia RPC did not return the latest block');
    parameters.SepoliaMocks = {
      ...parameters.SepoliaMocks,
      feedUpdatedAt: String(latestBlock.timestamp),
    };
  }

  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, `${JSON.stringify(parameters, null, 2)}\n`, {mode: 0o600});
  console.log(`Prepared ${deploymentTarget} parameters at ${path.relative(root, outputPath)}`);
  console.log(`Validated chain ${network.chainId}; deployer ${deployer.address} has ${balance} wei`);
  if (deploymentTarget === 'mainnet') {
    console.log('Ownership transfers will nominate PRODUCTION_OWNER; the multisig must accept each transfer after deployment.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
