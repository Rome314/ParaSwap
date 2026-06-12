import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';
import {IWA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IWA7A5__factory.js';
import {ADDRESSES} from '../../common/addresses.js';
import type {Signer, TransactionReceipt} from 'ethers';
import {ethers} from './consts.js';

// ── helpers ───────────────────────────────────────────────────────────────────

export function tokens(trader?: Signer) {
  const prov = trader ?? ethers.provider;
  return {
    usdt: IA7A5__factory.connect(ADDRESSES.USDT, prov),
    usdc: IA7A5__factory.connect(ADDRESSES.USDC, prov),
    weth: IA7A5__factory.connect(ADDRESSES.WETH, prov),
    a7a5: IA7A5__factory.connect(ADDRESSES.A7A5, prov),
    // Use the IA7A5.sol IWA7A5 factory which extends IERC20 and includes balanceOf
    wa7a5: IWA7A5__factory.connect(ADDRESSES.WA7A5, prov),
  };
}

export function gasReport(receipt: TransactionReceipt, ethUsd: number): string {
  const wei = receipt.gasUsed * receipt.gasPrice;
  const eth = Number(ethers.formatEther(wei));
  return `${wei} wei  (${ethers.formatEther(wei)} ETH  $${(eth * ethUsd).toFixed(2)})`;
}

export async function fetchEthPrice(): Promise<number> {
  // Chainlink USDT/ETH feed — returns ETH-per-USDT, 18 decimals.
  // ETH price in USD ≈ 1 / answer_in_1_unit = 1e18 / answer
  const feed = new ethers.Contract(
    ADDRESSES.CHAINLINK_USDT_ETH,
    ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'],
    ethers.provider,
  );
  const [, answer] = await feed.latestRoundData();
  return 1e18 / Number(answer);
}
