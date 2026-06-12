import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {SEPOLIA_ADDRESSES} from '../../common/addresses-sepolia.js';
import SepoliaOracleStack from './SepoliaOracleStack.js';

export default buildModule('SepoliaPaymasters', (m) => {
  const owner = m.getAccount(0);
  const entryPoint = m.getParameter('entryPoint', SEPOLIA_ADDRESSES.ENTRYPOINT_V08);
  const depositWei = m.getParameter('depositWei', 1_000_000_000_000_000_000n);
  const stakeWei = m.getParameter('stakeWei', 500_000_000_000_000_000n);

  const {a7a5, usdt, a7a5NativeOracle, usdtNativeOracle} = m.useModule(SepoliaOracleStack);

  const a7a5Paymaster = m.contract('A7A5Paymaster', [entryPoint, a7a5, a7a5NativeOracle, owner]);
  const usdtPaymaster = m.contract('UsdtPaymaster', [entryPoint, usdt, usdtNativeOracle, owner]);

  m.call(a7a5Paymaster, 'deposit', [], {value: depositWei});
  m.call(a7a5Paymaster, 'addStake', [86_400], {value: stakeWei});
  m.call(usdtPaymaster, 'deposit', [], {value: depositWei});
  m.call(usdtPaymaster, 'addStake', [86_400], {value: stakeWei});

  return {a7a5Paymaster, usdtPaymaster, a7a5NativeOracle, usdtNativeOracle};
});
