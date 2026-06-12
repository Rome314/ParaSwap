import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildErc7821ExecuteCalldata, buildWebAuthnSignedUserOp} from '../../common/erc4337.js';
import {forkReady} from '../helpers.js';
import {signUserOpHashWebAuthn} from '../A7A5WebAuthnAccount/webauthn-helpers.js';
import {conn, ethers, loadFixture, A7A5_SWAP_IN, FAR_DEADLINE} from '../Paymaster/consts.js';
import {deployAAStackFixture} from './fixtures.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];

function a7a5(provider: any) {
  return IA7A5__factory.connect(ADDRESSES.A7A5, provider);
}
function usdt(provider: any) {
  return IA7A5__factory.connect(ADDRESSES.USDT, provider);
}

function buildSwapCallData(paraSwapAddr: string, tokenIn: string, tokenOut: string, amountIn: bigint): string {
  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    tokenIn,
    tokenOut,
    amountIn,
    0n,
    ADDRESSES.V3_FEE_TIER,
    FAR_DEADLINE,
  ]);
  return buildErc7821ExecuteCalldata(ethers as any, paraSwapAddr, 0n, swapData);
}

const run = forkReady(ADDRESSES.A7A5, ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.ENTRYPOINT_V08);

(run ? describe : describe.skip)('AA integration swap', function () {
  this.timeout(180_000);

  it('A7A5 → USDT swap with A7A5 paymaster gas', async function () {
    const f = await loadFixture(deployAAStackFixture);

    const accUsdtBefore = await usdt(ethers.provider).balanceOf(f.accountAddr);
    const accA7A5Before = await a7a5(ethers.provider).balanceOf(f.accountAddr);
    const accEthBefore = await ethers.provider.getBalance(f.accountAddr);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN);
    const op = await buildWebAuthnSignedUserOp(ethers as any, f.entryPoint as any, {
      sender: f.accountAddr,
      callData,
      paymaster: f.a7a5PaymasterAddr,
    }, signUserOpHashWebAuthn);

    await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

    expect(await usdt(ethers.provider).balanceOf(f.accountAddr)).to.be.greaterThan(accUsdtBefore);
    expect(await a7a5(ethers.provider).balanceOf(f.accountAddr)).to.be.lessThan(accA7A5Before);
    expect(await ethers.provider.getBalance(f.accountAddr)).to.equal(accEthBefore);
  });

  it('USDT → A7A5 swap with USDT paymaster gas', async function () {
    const f = await loadFixture(deployAAStackFixture);

    const usdtIn = 100_000_000n; // 100 USDT
    const accA7A5Before = await a7a5(ethers.provider).balanceOf(f.accountAddr);
    const accUsdtBefore = await usdt(ethers.provider).balanceOf(f.accountAddr);
    const accEthBefore = await ethers.provider.getBalance(f.accountAddr);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.USDT, ADDRESSES.A7A5, usdtIn);
    const op = await buildWebAuthnSignedUserOp(ethers as any, f.entryPoint as any, {
      sender: f.accountAddr,
      callData,
      paymaster: f.usdtPaymasterAddr,
    }, signUserOpHashWebAuthn);

    await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

    expect(await a7a5(ethers.provider).balanceOf(f.accountAddr)).to.be.greaterThan(accA7A5Before);
    expect(await usdt(ethers.provider).balanceOf(f.accountAddr)).to.be.lessThan(accUsdtBefore);
    expect(await ethers.provider.getBalance(f.accountAddr)).to.equal(accEthBefore);
  });
});
