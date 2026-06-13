// Fund a smart account with A7A5, USDT, and ETH from fork whales.
//
//   SMART_ACCOUNT=0x... npm run fund:smart-account
//
// Optional env overrides:
//   A7A5_AMOUNT  – raw token units (default 1_000_000_000 = 1 000 A7A5 at 6 dec)
//   USDT_AMOUNT  – raw token units (default 100_000_000  = 100 USDT at 6 dec)
//   ETH_AMOUNT   – ether string    (default "1")
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';

const conn = await network.create('localhost');
const {ethers} = conn;

const ERC20 = ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'];

async function impersonate(addr: string) {
  const [deployer] = await ethers.getSigners();
  await (await deployer.sendTransaction({to: addr, value: ethers.parseEther('1')})).wait();
  try {
    await (ethers.provider as any).send('hardhat_impersonateAccount', [addr]);
  } catch {}
  return (ethers.provider as any).getSigner(addr);
}

async function balances(label: string, addr: string) {
  const eth = await ethers.provider.getBalance(addr);
  const a7a5 = new ethers.Contract(ADDRESSES.A7A5, ERC20, ethers.provider);
  const usdt = new ethers.Contract(ADDRESSES.USDT, ERC20, ethers.provider);
  const a7a5Bal = await a7a5.balanceOf(addr);
  const usdtBal = await usdt.balanceOf(addr);
  console.log(`\n[${label}]`);
  console.log(`  ETH  : ${ethers.formatEther(eth)}`);
  console.log(`  A7A5 : ${a7a5Bal.toString()} (raw)`);
  console.log(`  USDT : ${usdtBal.toString()} (raw)`);
}

async function main() {
  const accountAddr = process.env.SMART_ACCOUNT?.trim();
  if (!accountAddr || !accountAddr.startsWith('0x')) {
    console.error('Usage: SMART_ACCOUNT=0x... npm run fund:smart-account');
    process.exit(1);
  }

  const A7A5_AMOUNT = BigInt(process.env.A7A5_AMOUNT ?? '1000000000');
  const USDT_AMOUNT = BigInt(process.env.USDT_AMOUNT ?? '100000000');
  const ETH_AMOUNT = ethers.parseEther(process.env.ETH_AMOUNT ?? '1');

  const net = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlockNumber();
  console.log(`Fork: chainId=${net.chainId} block=${block}`);
  console.log(`Target account: ${accountAddr}`);

  await balances('before', accountAddr);

  // Fund A7A5 from whale
  const a7a5Whale = await impersonate(ADDRESSES.A7A5_WHALE);
  await (await new ethers.Contract(ADDRESSES.A7A5, ERC20, a7a5Whale).transfer(accountAddr, A7A5_AMOUNT)).wait();
  console.log(`\n[+] Transferred ${A7A5_AMOUNT} raw A7A5`);

  // Fund USDT from whale
  const usdtWhale = await impersonate(ADDRESSES.USDT_WHALE);
  await (await new ethers.Contract(ADDRESSES.USDT, ERC20, usdtWhale).transfer(accountAddr, USDT_AMOUNT)).wait();
  console.log(`[+] Transferred ${USDT_AMOUNT} raw USDT`);

  // Fund ETH from deployer
  const [deployer] = await ethers.getSigners();
  await (await deployer.sendTransaction({to: accountAddr, value: ETH_AMOUNT})).wait();
  console.log(`[+] Sent ${ethers.formatEther(ETH_AMOUNT)} ETH`);

  await balances('after', accountAddr);
}

await main();
