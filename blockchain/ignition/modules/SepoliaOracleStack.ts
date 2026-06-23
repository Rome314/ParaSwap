import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import SepoliaMocks from './SepoliaMocks.js';

const DEFAULT_MAX_STALENESS = 2 * 24 * 60 * 60;

export default buildModule('SepoliaOracleStack', (m) => {
  const owner = m.getAccount(0);
  const twapWindow = m.getParameter('twapWindow', 300);
  const maxStaleness = m.getParameter('maxStaleness', String(DEFAULT_MAX_STALENESS));
  const twapCumulativeOlder = m.getParameter('twapCumulativeOlder', '-276324');
  const twapCumulativeNewer = m.getParameter('twapCumulativeNewer', '0');

  const {a7a5, usdt, wa7a5, pool, usdtEthFeed} = m.useModule(SepoliaMocks);

  m.call(pool, 'setCumulatives', [twapCumulativeOlder, twapCumulativeNewer]);

  const twap = m.contract('A7A5UsdtTwapOracle', [pool, wa7a5, usdt, twapWindow, owner]);
  const a7a5NativeOracle = m.contract('A7A5NativeOracle', [twap, usdtEthFeed, wa7a5, maxStaleness, owner]);
  const usdtNativeOracle = m.contract('UsdtNativeOracle', [usdtEthFeed, maxStaleness, owner]);

  return {a7a5, usdt, wa7a5, pool, usdtEthFeed, twap, a7a5NativeOracle, usdtNativeOracle};
});
