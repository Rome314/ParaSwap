import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';

const TWAP_WINDOW = 60;
const MAX_STALENESS = 2 * 24 * 60 * 60;

export default buildModule('OracleStack', (m) => {
  const owner = m.getAccount(0);
  const wa7a5 = m.getParameter('wa7a5', ADDRESSES.WA7A5);
  const a7a5 = m.getParameter('a7a5', ADDRESSES.A7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const v3Pool = m.getParameter('v3PoolUsdtWa7a5', ADDRESSES.V3_POOL_USDT_WA7A5);
  const chainlinkUsdtEth = m.getParameter('chainlinkUsdtEth', ADDRESSES.CHAINLINK_USDT_ETH);

  const twap = m.contract('A7A5UsdtTwapOracle', [v3Pool, wa7a5, usdt, TWAP_WINDOW, owner]);
  const a7a5NativeOracle = m.contract('A7A5NativeOracle', [twap, chainlinkUsdtEth, wa7a5, MAX_STALENESS, owner]);
  const usdtNativeOracle = m.contract('UsdtNativeOracle', [chainlinkUsdtEth, MAX_STALENESS, owner]);

  return {twap, a7a5NativeOracle, usdtNativeOracle};
});
