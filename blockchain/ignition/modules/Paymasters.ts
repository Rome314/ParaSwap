import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';
import OracleStack from './OracleStack.js';

export default buildModule('Paymasters', (m) => {
  const owner = m.getAccount(0);
  const entryPoint = m.getParameter('entryPoint', ADDRESSES.ENTRYPOINT_V08);
  const a7a5 = m.getParameter('a7a5', ADDRESSES.A7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const depositWei = m.getParameter('depositWei', 5_000_000_000_000_000_000n);
  const stakeWei = m.getParameter('stakeWei', 1_000_000_000_000_000_000n);

  const {a7a5NativeOracle, usdtNativeOracle} = m.useModule(OracleStack);

  const a7a5Paymaster = m.contract('A7A5Paymaster', [entryPoint, a7a5, a7a5NativeOracle, owner]);
  const usdtPaymaster = m.contract('UsdtPaymaster', [entryPoint, usdt, usdtNativeOracle, owner]);

  m.call(a7a5Paymaster, 'deposit', [], {value: depositWei});
  m.call(a7a5Paymaster, 'addStake', [86_400], {value: stakeWei});
  m.call(usdtPaymaster, 'deposit', [], {value: depositWei});
  m.call(usdtPaymaster, 'addStake', [86_400], {value: stakeWei});

  return {a7a5Paymaster, usdtPaymaster, a7a5NativeOracle, usdtNativeOracle};
});
