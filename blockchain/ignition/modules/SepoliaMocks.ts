import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';

/**
 * Testnet stand-ins for A7A5, USDT, wA7A5/USDT V3 pool, and Chainlink USDT/ETH.
 * Used by SepoliaOracleStack — not suitable for production pricing.
 */
export default buildModule('SepoliaMocks', (m) => {
  const a7a5 = m.contract('MockToken', [6], {id: 'MockA7A5'});
  const usdt = m.contract('MockToken', [6], {id: 'MockUsdt'});
  const wa7a5Ratio = m.getParameter('wa7a5Ratio', '1000000');
  const wa7a5 = m.contract('MockWA7A5', [a7a5, wa7a5Ratio, 6], {id: 'MockWA7A5'});
  const pool = m.contract('MockPool', [wa7a5, usdt], {id: 'MockV3Pool'});

  // ~1/2500 ETH per USDT (18 decimals) — same order of magnitude as mainnet feed.
  const ethPerUsdt = m.getParameter('ethPerUsdt', '400000000000000');
  const feedUpdatedAt = m.getParameter('feedUpdatedAt', '1704067200');
  const usdtEthFeed = m.contract('MockChainlinkFeed', [ethPerUsdt, feedUpdatedAt, 18], {id: 'MockUsdtEthFeed'});

  return {a7a5, usdt, wa7a5, pool, usdtEthFeed};
});
