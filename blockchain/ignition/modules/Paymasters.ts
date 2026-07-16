import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';
import OracleStack from './OracleStack.js';

export default buildModule('Paymasters', (m) => {
  const deployer = m.getAccount(0);
  const productionOwner = m.getParameter('productionOwner');
  const entryPoint = m.getParameter('entryPoint', ADDRESSES.ENTRYPOINT_V08);
  const a7a5 = m.getParameter('a7a5', ADDRESSES.A7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const depositWei = m.getParameter('depositWei', 5_000_000_000_000_000_000n);
  const stakeWei = m.getParameter('stakeWei', 1_000_000_000_000_000_000n);

  const {a7a5NativeOracle, usdtNativeOracle} = m.useModule(OracleStack);

  const a7a5Paymaster = m.contract('A7A5Paymaster', [entryPoint, a7a5, a7a5NativeOracle, deployer]);
  const usdtPaymaster = m.contract('UsdtPaymaster', [entryPoint, usdt, usdtNativeOracle, deployer]);

  const a7a5Deposit = m.call(a7a5Paymaster, 'deposit', [], {value: depositWei});
  const a7a5Stake = m.call(a7a5Paymaster, 'addStake', [86_400], {value: stakeWei});
  const usdtDeposit = m.call(usdtPaymaster, 'deposit', [], {value: depositWei});
  const usdtStake = m.call(usdtPaymaster, 'addStake', [86_400], {value: stakeWei});

  m.call(a7a5Paymaster, 'transferOwnership', [productionOwner], {
    id: 'TransferA7A5PaymasterOwnership',
    after: [a7a5Deposit, a7a5Stake],
  });
  m.call(usdtPaymaster, 'transferOwnership', [productionOwner], {
    id: 'TransferUsdtPaymasterOwnership',
    after: [usdtDeposit, usdtStake],
  });

  return {a7a5Paymaster, usdtPaymaster, a7a5NativeOracle, usdtNativeOracle};
});
