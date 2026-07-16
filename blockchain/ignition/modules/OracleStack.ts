import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';

const DEFAULT_TWAP_WINDOW = 30 * 60;
const DEFAULT_MAX_STALENESS = 24 * 60 * 60;

export default buildModule('OracleStack', (m) => {
  const deployer = m.getAccount(0);
  const productionOwner = m.getParameter('productionOwner');
  const wa7a5 = m.getParameter('wa7a5', ADDRESSES.WA7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const v3Pool = m.getParameter('v3PoolUsdtWa7a5', ADDRESSES.V3_POOL_USDT_WA7A5);
  const chainlinkUsdtEth = m.getParameter('chainlinkUsdtEth', ADDRESSES.CHAINLINK_USDT_ETH);
  const twapWindow = m.getParameter('twapWindow', DEFAULT_TWAP_WINDOW);
  const maxStaleness = m.getParameter('maxStaleness', DEFAULT_MAX_STALENESS);

  const twap = m.contract('A7A5UsdtTwapOracle', [v3Pool, wa7a5, usdt, twapWindow, deployer]);
  const a7a5NativeOracle = m.contract('A7A5NativeOracle', [twap, chainlinkUsdtEth, wa7a5, maxStaleness, deployer]);
  const usdtNativeOracle = m.contract('UsdtNativeOracle', [chainlinkUsdtEth, maxStaleness, deployer]);

  m.call(twap, 'transferOwnership', [productionOwner], {id: 'TransferTwapOwnership'});
  m.call(a7a5NativeOracle, 'transferOwnership', [productionOwner], {id: 'TransferA7A5OracleOwnership'});
  m.call(usdtNativeOracle, 'transferOwnership', [productionOwner], {id: 'TransferUsdtOracleOwnership'});

  return {twap, a7a5NativeOracle, usdtNativeOracle};
});
