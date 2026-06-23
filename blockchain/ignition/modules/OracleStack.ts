import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';

const TWAP_WINDOW = 300; // 5 minutes — minimum manipulation-resistant window
const MAX_STALENESS = 2 * 24 * 60 * 60;
// 1 000 A7A5 base units (6 decimals) — minimum V2 reserve to return a valid price.
const MIN_RESERVE_A7A5 = '1000000000';

export default buildModule('OracleStack', (m) => {
  const owner = m.getAccount(0);
  const wa7a5 = m.getParameter('wa7a5', ADDRESSES.WA7A5);
  const a7a5 = m.getParameter('a7a5', ADDRESSES.A7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const v3Pool = m.getParameter('v3PoolUsdtWa7a5', ADDRESSES.V3_POOL_USDT_WA7A5);
  const v2Pair = m.getParameter('v2PairUsdtA7a5', ADDRESSES.V2_PAIR_USDT_A7A5);
  const chainlinkUsdtEth = m.getParameter('chainlinkUsdtEth', ADDRESSES.CHAINLINK_USDT_ETH);
  const minReserveA7A5 = m.getParameter('minReserveA7A5', MIN_RESERVE_A7A5);

  const twap = m.contract('A7A5UsdtTwapOracle', [v3Pool, wa7a5, usdt, TWAP_WINDOW, owner]);
  const v2Oracle = m.contract('A7A5UsdtV2Oracle', [v2Pair, a7a5, usdt, minReserveA7A5]);
  const a7a5NativeOracle = m.contract('A7A5NativeOracle', [twap, chainlinkUsdtEth, wa7a5, MAX_STALENESS, owner]);
  const usdtNativeOracle = m.contract('UsdtNativeOracle', [chainlinkUsdtEth, MAX_STALENESS, owner]);

  return {twap, v2Oracle, a7a5NativeOracle, usdtNativeOracle};
});
