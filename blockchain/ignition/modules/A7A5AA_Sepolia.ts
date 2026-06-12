import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import SepoliaOracleStack from './SepoliaOracleStack.js';
import SepoliaPaymasters from './SepoliaPaymasters.js';
import SepoliaAccountSystem from './SepoliaAccountSystem.js';

/**
 * Sepolia AA stack: mock-backed oracles + ERC-20 paymasters + WebAuthn factory.
 * SwapStack (PoolsFacade / ParaSwap) is omitted — no A7A5 liquidity on Sepolia.
 */
export default buildModule('A7A5AA_Sepolia', (m) => {
  const oracle = m.useModule(SepoliaOracleStack);
  const paymasters = m.useModule(SepoliaPaymasters);
  const accounts = m.useModule(SepoliaAccountSystem);

  return {...oracle, ...paymasters, ...accounts};
});
