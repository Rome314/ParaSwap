import {expect} from 'chai';
import {ethers, loadFixture, deployFactoryV2Fixture} from './fixtures.js';

describe('A7A5AccountFactoryV2', function () {
  this.timeout(60_000);

  it('getImplementation returns the impl address', async function () {
    const {factory, implAddr} = await loadFixture(deployFactoryV2Fixture);
    expect(await (factory as any).getImplementation()).to.equal(implAddr);
  });

  it('isAllowedSpender reflects the constructor whitelist', async function () {
    const {factory, spenderA, spenderB, unlisted} = await loadFixture(deployFactoryV2Fixture);
    expect(await (factory as any).isAllowedSpender(spenderA)).to.equal(true);
    expect(await (factory as any).isAllowedSpender(spenderB)).to.equal(true);
    expect(await (factory as any).isAllowedSpender(unlisted)).to.equal(false);
  });

  it('predictAddress is stable for the same owner', async function () {
    const {factory, ownerWallet} = await loadFixture(deployFactoryV2Fixture);
    const a: string = await (factory as any).predictAddress(ownerWallet.address);
    const b: string = await (factory as any).predictAddress(ownerWallet.address);
    expect(a).to.equal(b);
    expect(a).to.not.equal(ethers.ZeroAddress);
  });

  it('deployAccount deploys proxy at predicted address', async function () {
    const {factory, ownerWallet} = await loadFixture(deployFactoryV2Fixture);
    const predicted: string = await (factory as any).predictAddress(ownerWallet.address);
    expect(await ethers.provider.getCode(predicted)).to.equal('0x');

    await (factory as any).deployAccount(ownerWallet.address);
    expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');

    const account = await ethers.getContractAt('A7A5Account', predicted);
    expect(await (account as any).owner()).to.equal(ownerWallet.address);
  });

  it('deployAccount is idempotent — returns same address if proxy already exists', async function () {
    const {factory, ownerWallet} = await loadFixture(deployFactoryV2Fixture);
    const predicted: string = await (factory as any).predictAddress(ownerWallet.address);

    await (factory as any).deployAccount(ownerWallet.address);
    // Second call should not revert and should return the same address.
    await (factory as any).deployAccount(ownerWallet.address);
    expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');
  });

  it('deployAccountWithApprovals grants creation-time allowances', async function () {
    const {factory, ownerWallet, tokenAAddr, tokenBAddr, spenderA, spenderB} =
      await loadFixture(deployFactoryV2Fixture);
    const predicted: string = await (factory as any).predictAddress(ownerWallet.address);

    await (factory as any).deployAccountWithApprovals(ownerWallet.address, [
      [tokenAAddr, spenderA, 500n],
      [tokenBAddr, spenderB, ethers.MaxUint256],
    ]);

    const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
    const tokenA = new ethers.Contract(tokenAAddr, erc20Abi, ethers.provider);
    const tokenB = new ethers.Contract(tokenBAddr, erc20Abi, ethers.provider);
    expect(await tokenA.allowance(predicted, spenderA)).to.equal(500n);
    expect(await tokenB.allowance(predicted, spenderB)).to.equal(ethers.MaxUint256);
  });

  it('reverts for a spender outside the whitelist', async function () {
    const {factory, ownerWallet, tokenAAddr, unlisted} = await loadFixture(deployFactoryV2Fixture);
    await expect(
      (factory as any).deployAccountWithApprovals(ownerWallet.address, [[tokenAAddr, unlisted, 1n]]),
    ).to.be.revertedWithCustomError(factory, 'A7A5AccountFactoryV2__SpenderNotAllowed');
  });

  it('initializeApprovals cannot be replayed after factory seals it', async function () {
    const {factory, ownerWallet, tokenAAddr, spenderA} = await loadFixture(deployFactoryV2Fixture);
    await (factory as any).deployAccountWithApprovals(ownerWallet.address, [[tokenAAddr, spenderA, 1n]]);
    const predicted: string = await (factory as any).predictAddress(ownerWallet.address);
    const account = await ethers.getContractAt('A7A5Account', predicted);

    await expect(
      (account as any).initializeApprovals([[tokenAAddr, spenderA, 2n]]),
    ).to.be.revertedWithCustomError(account, 'InvalidInitialization');
  });

  it('two different owners get different counterfactual addresses', async function () {
    const {factory} = await loadFixture(deployFactoryV2Fixture);
    const ownerA = ethers.Wallet.createRandom().address;
    const ownerB = ethers.Wallet.createRandom().address;
    const addrA: string = await (factory as any).predictAddress(ownerA);
    const addrB: string = await (factory as any).predictAddress(ownerB);
    expect(addrA).to.not.equal(addrB);
  });

  it('reverts if impl has no code', async function () {
    await expect(
      ethers.deployContract('A7A5AccountFactoryV2', [ethers.Wallet.createRandom().address, []]),
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory('A7A5AccountFactoryV2'),
      'A7A5AccountFactoryV2__InvalidImplementation',
    );
  });
});
