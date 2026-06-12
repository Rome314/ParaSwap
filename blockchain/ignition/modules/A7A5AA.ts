import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import OracleStack from './OracleStack.js';
import Paymasters from './Paymasters.js';
import AccountSystem from './AccountSystem.js';
import SwapStack from './SwapStack.js';

export default buildModule('A7A5AA', (m) => {
  const oracle = m.useModule(OracleStack);
  const paymasters = m.useModule(Paymasters);
  const accounts = m.useModule(AccountSystem);
  const swap = m.useModule(SwapStack);

  return {...oracle, ...paymasters, ...accounts, ...swap};
});
