import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';

export default buildModule('SwapStack', (m) => {
  const wa7a5 = m.getParameter('wa7a5', ADDRESSES.WA7A5);
  const a7a5 = m.getParameter('a7a5', ADDRESSES.A7A5);
  const usdt = m.getParameter('usdt', ADDRESSES.USDT);
  const v2Pair = m.getParameter('v2PairUsdtA7a5', ADDRESSES.V2_PAIR_USDT_A7A5);
  const swapRouter = m.getParameter('swapRouter02', ADDRESSES.SWAP_ROUTER_02);
  const quoter = m.getParameter('quoterV2', ADDRESSES.QUOTER_V2);
  const feeTier = m.getParameter('v3FeeTier', ADDRESSES.V3_FEE_TIER);
  const owner = m.getParameter('swapOwner');

  const facade = m.contract('PoolsFacade', [wa7a5, a7a5, usdt, v2Pair, swapRouter, quoter, feeTier, owner]);
  const paraSwap = m.contract('ParaSwap', [facade, swapRouter, owner]);

  return {facade, paraSwap};
});
