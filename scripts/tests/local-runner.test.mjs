import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localEnvironment, runLocal } from '../hardhat-local.mjs';

test('local checks cannot inherit a fork, signing key, or remote network selection', () => {
  const base = {
    PATH: '/test/bin', MAINNET_FORK: '1', MAINNET_RPC_URL: 'https://example.invalid',
    ALCHEMY_API_KEY: 'test-only', DEPLOYER_PRIVATE_KEY: 'test-only',
    REQUIRE_FORK_TESTS: '1', FORK_BLOCK: '123', HARDHAT_NETWORK: 'mainnet',
    DOTENV_CONFIG_PATH: '/operator.env',
  };
  const env = localEnvironment(base);
  assert.equal(env.PATH, base.PATH);
  for (const key of Object.keys(base).filter(k => !['PATH', 'DOTENV_CONFIG_PATH'].includes(k))) {
    assert.equal(env[key], undefined, key);
  }
  assert.ok(env.DOTENV_CONFIG_PATH.endsWith('/scripts/empty.env'));
  assert.equal(base.MAINNET_FORK, '1', 'the caller environment remains unchanged');
});

test('local runner rejects deployment commands and remote network overrides before spawning', (t) => {
  t.mock.method(console, 'error', () => {});
  assert.equal(runLocal(['run', 'scripts/deploy-paymaster.ts']), 2);
  assert.equal(runLocal(['test', 'mocha', '--network', 'mainnet']), 2);
  assert.equal(runLocal(['test', 'mocha', '--network=mainnet']), 2);
});
