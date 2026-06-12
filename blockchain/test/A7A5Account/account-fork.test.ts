import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {
  buildInitCodeECDSA,
  buildInitCodeECDSAWithApprovals,
  buildSignedUserOp,
  buildErc7821ExecuteCalldata,
  defaultApprovals,
  ENTRYPOINT_ABI,
} from '../../common/erc4337.js';
import {forkReady, fundFromWhale} from '../helpers.js';
import {conn, ethers, loadFixture, A7A5_SWAP_IN, FAR_DEADLINE} from '../Paymaster/consts.js';
import {deployAAStackFixture} from '../Integration/fixtures.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const run = forkReady(ADDRESSES.ENTRYPOINT_V08, ADDRESSES.A7A5, ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.CHAINLINK_USDT_ETH);

const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];

function a7a5(p: any) { return IA7A5__factory.connect(ADDRESSES.A7A5, p); }
function usdt(p: any) { return IA7A5__factory.connect(ADDRESSES.USDT, p); }

function buildSwapCallData(paraSwapAddr: string, tokenIn: string, tokenOut: string, amountIn: bigint): string {
  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    tokenIn, tokenOut, amountIn, 0n, ADDRESSES.V3_FEE_TIER, FAR_DEADLINE,
  ]);
  return buildErc7821ExecuteCalldata(ethers as any, paraSwapAddr, 0n, swapData);
}

/** Deploy the full AA stack + ECDSA account impl + factoryV2 + funded counterfactual account. */
async function deployEcdsaStackFixture() {
  const base = await deployAAStackFixture();
  const {deployer, deployerAddr, facadeAddr, paraSwapAddr, a7a5PaymasterAddr, usdtPaymasterAddr, entryPoint} = base;

  const ecdsaImpl = await ethers.deployContract('A7A5Account', [ADDRESSES.ENTRYPOINT_V08]);
  await ecdsaImpl.waitForDeployment();

  const ecdsaFactory = await ethers.deployContract('A7A5AccountFactoryV2', [
    await ecdsaImpl.getAddress(),
    [facadeAddr, paraSwapAddr, a7a5PaymasterAddr, usdtPaymasterAddr],
  ]);
  await ecdsaFactory.waitForDeployment();
  const ecdsaFactoryAddr = await ecdsaFactory.getAddress();

  const ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  const approvals = defaultApprovals({
    a7a5: ADDRESSES.A7A5, wa7a5: ADDRESSES.WA7A5, usdt: ADDRESSES.USDT,
    poolsFacade: facadeAddr, paraSwap: paraSwapAddr,
    a7a5Paymaster: a7a5PaymasterAddr, usdtPaymaster: usdtPaymasterAddr,
  });

  const ecdsaAccountAddr: string = await (ecdsaFactory as any).predictAddress(ownerWallet.address);
  await (ecdsaFactory as any).deployAccountWithApprovals(
    ownerWallet.address,
    approvals.map((a) => [a.token, a.spender, a.amount]),
  );
  const ecdsaAccount = await ethers.getContractAt('A7A5Account', ecdsaAccountAddr);

  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, ecdsaAccountAddr, 5_000_000_000n);
  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, ecdsaAccountAddr, 500_000_000n);

  return {...base, ecdsaImpl, ecdsaFactory, ecdsaFactoryAddr, ecdsaAccount, ecdsaAccountAddr, ownerWallet, approvals};
}

(run ? describe : describe.skip)('A7A5Account fork E2E', function () {
  this.timeout(180_000);

  it('deploys counterfactual ECDSA account via initCode UserOp', async function () {
    const {deployer, ecdsaFactory, ecdsaFactoryAddr, entryPoint} = await loadFixture(deployEcdsaStackFixture);
    const [, bundler] = await ethers.getSigners();

    const freshOwner = ethers.Wallet.createRandom().connect(ethers.provider);
    const predicted: string = await (ecdsaFactory as any).predictAddress(freshOwner.address);
    const initCode = buildInitCodeECDSA(ethers as any, ecdsaFactoryAddr, freshOwner.address);

    // Fund the counterfactual address for gas.
    await conn.networkHelpers.setBalance(predicted, ethers.parseEther('0.2'));
    await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, predicted, 1_000_000_000n);

    const op = await buildSignedUserOp(
      ethers as any,
      entryPoint as any,
      freshOwner,
      {
        sender: predicted,
        callData: '0x',
        initCode,
        nonce: 0n,
        verificationGasLimit: 1_000_000n,
        callGasLimit: 200_000n,
      },
    );

    await (entryPoint as any).connect(bundler).handleOps([op], await deployer.getAddress());

    expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');
    const account = await ethers.getContractAt('A7A5Account', predicted);
    expect(await (account as any).owner()).to.equal(freshOwner.address);
  });

  it('A7A5 → USDT swap with A7A5 paymaster gas (ECDSA-signed)', async function () {
    const f = await loadFixture(deployEcdsaStackFixture);
    const {entryPoint, deployer, a7a5PaymasterAddr, ecdsaAccountAddr, ownerWallet} = f;
    const [, bundler] = await ethers.getSigners();

    const accUsdtBefore = await usdt(ethers.provider).balanceOf(ecdsaAccountAddr);
    const accA7A5Before = await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr);
    const accEthBefore = await ethers.provider.getBalance(ecdsaAccountAddr);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN);
    const op = await buildSignedUserOp(ethers as any, entryPoint as any, ownerWallet, {
      sender: ecdsaAccountAddr,
      callData,
      paymaster: a7a5PaymasterAddr,
    });

    await (entryPoint as any).connect(bundler).handleOps([op], await deployer.getAddress());

    expect(await usdt(ethers.provider).balanceOf(ecdsaAccountAddr)).to.be.greaterThan(accUsdtBefore);
    expect(await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr)).to.be.lessThan(accA7A5Before);
    expect(await ethers.provider.getBalance(ecdsaAccountAddr)).to.equal(accEthBefore);
  });

  it('USDT → A7A5 swap with USDT paymaster gas (ECDSA-signed)', async function () {
    const f = await loadFixture(deployEcdsaStackFixture);
    const {entryPoint, deployer, usdtPaymasterAddr, ecdsaAccountAddr, ownerWallet} = f;
    const [, bundler] = await ethers.getSigners();

    const usdtIn = 100_000_000n; // 100 USDT
    const accA7A5Before = await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr);
    const accUsdtBefore = await usdt(ethers.provider).balanceOf(ecdsaAccountAddr);
    const accEthBefore = await ethers.provider.getBalance(ecdsaAccountAddr);

    const callData = buildSwapCallData(f.paraSwapAddr, ADDRESSES.USDT, ADDRESSES.A7A5, usdtIn);
    const op = await buildSignedUserOp(ethers as any, entryPoint as any, ownerWallet, {
      sender: ecdsaAccountAddr,
      callData,
      paymaster: usdtPaymasterAddr,
    });

    await (entryPoint as any).connect(bundler).handleOps([op], await deployer.getAddress());

    expect(await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr)).to.be.greaterThan(accA7A5Before);
    expect(await usdt(ethers.provider).balanceOf(ecdsaAccountAddr)).to.be.lessThan(accUsdtBefore);
    expect(await ethers.provider.getBalance(ecdsaAccountAddr)).to.equal(accEthBefore);
  });

  it('owner can withdraw tokens directly (no bundler needed)', async function () {
    const f = await loadFixture(deployEcdsaStackFixture);
    const {ecdsaAccount, ecdsaAccountAddr, ownerWallet, deployer} = f;

    await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});
    const a7a5BalBefore = await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr);
    expect(a7a5BalBefore).to.be.greaterThan(0n);

    await (ecdsaAccount as any).connect(ownerWallet).withdrawTokenAll(ADDRESSES.A7A5);
    // A7A5 is FOT — up to 1 wei dust may remain due to integer rounding in the fee deduction.
    expect(await a7a5(ethers.provider).balanceOf(ecdsaAccountAddr)).to.be.lessThanOrEqual(1n);
    expect(await a7a5(ethers.provider).balanceOf(ownerWallet.address)).to.be.greaterThan(0n);
  });

  it('owner can upgrade proxy and storage is preserved', async function () {
    const f = await loadFixture(deployEcdsaStackFixture);
    const {ecdsaAccount, ecdsaAccountAddr, ownerWallet, deployer} = f;

    await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

    const newImpl = await ethers.deployContract('A7A5Account', [ADDRESSES.ENTRYPOINT_V08]);
    await newImpl.waitForDeployment();
    const newImplAddr = await newImpl.getAddress();

    await (ecdsaAccount as any).connect(ownerWallet).upgradeToAndCall(newImplAddr, '0x');

    // Owner is preserved across the upgrade.
    expect(await (ecdsaAccount as any).owner()).to.equal(ownerWallet.address);
    // Account still at the same address.
    expect(await ethers.provider.getCode(ecdsaAccountAddr)).to.not.equal('0x');
  });
});
