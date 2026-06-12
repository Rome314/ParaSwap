import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {
  approvalBatchCalls,
  buildErc7821BatchCalldata,
  buildErc7821ExecuteCalldata,
  buildUserOp,
  entryPointDomain,
  PACKED_USER_OP_TYPED_DATA_TYPES,
  userOpToTypedDataMessage,
  type PackedUserOp,
} from '../../common/erc4337.js';
import {forkReady, fundFromWhale} from '../helpers.js';
import {conn, ethers, loadFixture, A7A5_SWAP_IN, FAR_DEADLINE, networkHelpers} from '../Paymaster/consts.js';
import {deployAAStackFixture} from './fixtures.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];

const ENTRYPOINT_DOMAIN = entryPointDomain(ADDRESSES.ENTRYPOINT_V08, 1);
const PACKED_USER_OP_TYPES = PACKED_USER_OP_TYPED_DATA_TYPES;

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

/** Delegate a fresh funded EOA to the fixture's delegate and run the approval batch atomically. */
async function delegateEoa(f: Awaited<ReturnType<typeof deployAAStackFixture>>) {
  const eoa = ethers.Wallet.createRandom().connect(ethers.provider);
  await networkHelpers.setBalance(eoa.address, ethers.parseEther('10'));

  const approveCalldata = buildErc7821BatchCalldata(
    ethers as any,
    approvalBatchCalls(ethers as any, f.accountApprovals),
  );

  // Self-sent type-4: the tx consumes the current nonce, the authorization signs nonce + 1.
  const txNonce = await ethers.provider.getTransactionCount(eoa.address);
  const auth = await eoa.authorize({address: f.eip7702DelegateAddr, nonce: txNonce + 1});
  await (
    await eoa.sendTransaction({type: 4, to: eoa.address, data: approveCalldata, authorizationList: [auth]})
  ).wait();

  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, eoa.address, 5_000_000_000n);
  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, eoa.address, 500_000_000n);

  return eoa;
}

async function buildTypedDataSignedUserOp(
  f: Awaited<ReturnType<typeof deployAAStackFixture>>,
  eoa: Awaited<ReturnType<typeof delegateEoa>>,
  callData: string,
  paymaster: string,
): Promise<PackedUserOp> {
  const op = await buildUserOp(ethers as any, f.entryPoint as any, {
    sender: eoa.address,
    callData,
    paymaster,
  });
  // Sanity: the typed-data digest must equal the EntryPoint's userOpHash.
  const typedHash = ethers.TypedDataEncoder.hash(
    ENTRYPOINT_DOMAIN,
    PACKED_USER_OP_TYPES,
    userOpToTypedDataMessage(op),
  );
  expect(typedHash).to.equal(await (f.entryPoint as any).getUserOpHash(op));
  op[8] = await eoa.signTypedData(ENTRYPOINT_DOMAIN, PACKED_USER_OP_TYPES, userOpToTypedDataMessage(op));
  return op;
}

const run = forkReady(ADDRESSES.A7A5, ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.ENTRYPOINT_V08);

(run ? describe : describe.skip)('EIP-7702 integration swap', function () {
  this.timeout(180_000);

  it('delegation + approval batch ride one type-4 transaction', async function () {
    const f = await loadFixture(deployAAStackFixture);
    const eoa = await delegateEoa(f);

    const code = await ethers.provider.getCode(eoa.address);
    expect(code.toLowerCase()).to.equal(`0xef0100${f.eip7702DelegateAddr.slice(2).toLowerCase()}`);

    for (const approval of f.accountApprovals) {
      const token = IA7A5__factory.connect(approval.token, ethers.provider);
      expect(await token.allowance(eoa.address, approval.spender)).to.equal(approval.amount);
    }
  });

  it('typed-data digest matches EntryPoint.getUserOpHash (wallet-signing assumption)', async function () {
    const f = await loadFixture(deployAAStackFixture);
    const eoa = await delegateEoa(f);
    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN);
    // buildTypedDataSignedUserOp asserts the hash equality internally.
    await buildTypedDataSignedUserOp(f, eoa, callData, f.a7a5PaymasterAddr);
  });

  it('A7A5 → USDT swap as UserOp with A7A5 paymaster gas, signed via typed data', async function () {
    const f = await loadFixture(deployAAStackFixture);
    const eoa = await delegateEoa(f);

    const usdtBefore = await usdt(ethers.provider).balanceOf(eoa.address);
    const a7a5Before = await a7a5(ethers.provider).balanceOf(eoa.address);
    const ethBefore = await ethers.provider.getBalance(eoa.address);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN);
    const op = await buildTypedDataSignedUserOp(f, eoa, callData, f.a7a5PaymasterAddr);
    await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

    expect(await usdt(ethers.provider).balanceOf(eoa.address)).to.be.greaterThan(usdtBefore);
    expect(await a7a5(ethers.provider).balanceOf(eoa.address)).to.be.lessThan(a7a5Before);
    expect(await ethers.provider.getBalance(eoa.address)).to.equal(ethBefore);
  });

  it('USDT → A7A5 swap as UserOp with USDT paymaster gas', async function () {
    const f = await loadFixture(deployAAStackFixture);
    const eoa = await delegateEoa(f);

    const usdtIn = 100_000_000n; // 100 USDT
    const a7a5Before = await a7a5(ethers.provider).balanceOf(eoa.address);
    const usdtBefore = await usdt(ethers.provider).balanceOf(eoa.address);
    const ethBefore = await ethers.provider.getBalance(eoa.address);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.USDT, ADDRESSES.A7A5, usdtIn);
    const op = await buildTypedDataSignedUserOp(f, eoa, callData, f.usdtPaymasterAddr);
    await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

    expect(await a7a5(ethers.provider).balanceOf(eoa.address)).to.be.greaterThan(a7a5Before);
    expect(await usdt(ethers.provider).balanceOf(eoa.address)).to.be.lessThan(usdtBefore);
    expect(await ethers.provider.getBalance(eoa.address)).to.equal(ethBefore);
  });

  it('A7A5 → USDT swap as a direct type-2 self-call, gas paid in ETH by the EOA', async function () {
    const f = await loadFixture(deployAAStackFixture);
    const eoa = await delegateEoa(f);

    const usdtBefore = await usdt(ethers.provider).balanceOf(eoa.address);
    const ethBefore = await ethers.provider.getBalance(eoa.address);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN);
    await (await eoa.sendTransaction({to: eoa.address, data: callData})).wait();

    expect(await usdt(ethers.provider).balanceOf(eoa.address)).to.be.greaterThan(usdtBefore);
    expect(await ethers.provider.getBalance(eoa.address)).to.be.lessThan(ethBefore);
  });
});
