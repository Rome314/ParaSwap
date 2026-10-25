import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function localEnvironment(base = process.env) {
  const env = { ...base, DOTENV_CONFIG_PATH: fileURLToPath(new URL('./empty.env', import.meta.url)) };
  for (const key of [
    'MAINNET_FORK', 'REQUIRE_FORK_TESTS', 'FORK_BLOCK', 'MAINNET_RPC_URL',
    'ALCHEMY_RPC_URL', 'ALCHEMY_API_KEY', 'SEPOLIA_RPC_URL', 'DEPLOYER_PRIVATE_KEY',
    'ETHERSCAN_API_KEY', 'HARDHAT_NETWORK',
  ]) delete env[key];
  return env;
}

export function runLocal(args) {
  if (!['build', 'test'].includes(args[0])) {
    console.error('Local Hardhat runner accepts only build or test. Use explicit commands for other operations.');
    return 2;
  }
  if (args.some(arg => arg === '--network' || arg.startsWith('--network='))) {
    console.error('The local runner does not accept a network override.');
    return 2;
  }
  const result = spawnSync('npm', ['exec', '-w', 'para-swap-contracts', '--no', '--', 'hardhat', ...args], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: localEnvironment(),
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runLocal(process.argv.slice(2));
}
