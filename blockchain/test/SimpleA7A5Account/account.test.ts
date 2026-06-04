import {expect} from 'chai';
import {network} from 'hardhat';

const conn = await network.create('hardhat');
const {ethers, networkHelpers} = conn;

// ── helpers ───────────────────────────────────────────────────────────────────

const ZERO = '0x0000000000000000000000000000000000000000';

async function deploy() {
  const [deployer] = await ethers.getSigners();
  const ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);

  const mockEP = await ethers.deployContract('MockEntryPoint');
  await mockEP.waitForDeployment();
  const mockEPAddr = await mockEP.getAddress();

  const account = await ethers.deployContract('SimpleA7A5Account', [mockEPAddr, ownerWallet.address]);
  await account.waitForDeployment();
  const accountAddr = await account.getAddress();

  return {deployer, ownerWallet, mockEP, mockEPAddr, account, accountAddr};
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SimpleA7A5Account', function () {
  // Line 30: constructor reverts on zero address
  describe('constructor', function () {
    it('reverts when entryPoint is the zero address', async function () {
      await expect(ethers.deployContract('SimpleA7A5Account', [ZERO, ethers.Wallet.createRandom().address])).to.be
        .reverted;
    });

    it('reverts when owner is the zero address', async function () {
      const ep = await ethers.deployContract('MockEntryPoint');
      await ep.waitForDeployment();
      await expect(ethers.deployContract('SimpleA7A5Account', [await ep.getAddress(), ZERO])).to.be.reverted;
    });
  });

  // Line 41: validateUserOp reverts when called from non-EntryPoint
  describe('validateUserOp', function () {
    it('reverts when called from non-EntryPoint', async function () {
      const {account, deployer} = await deploy();
      const op = {
        sender: ZERO,
        nonce: 0n,
        initCode: '0x',
        callData: '0x',
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: '0x',
        signature: '0x',
      };
      await expect(
        (account as any).connect(deployer).validateUserOp(op, ethers.ZeroHash, 0n),
      ).to.be.revertedWithCustomError(account, 'SimpleA7A5Account__NotEntryPoint');
    });

    // Lines 50-51: missingAccountFunds top-up path
    it('sends missingAccountFunds ETH to the EntryPoint when nonzero', async function () {
      const {ownerWallet, mockEP, mockEPAddr, account, accountAddr} = await deploy();

      // Fund account with ETH so it can top-up the EntryPoint.
      await networkHelpers.setBalance(accountAddr, ethers.parseEther('1'));

      const missingFunds = ethers.parseEther('0.1');
      const userOpHash = ethers.ZeroHash;
      // Sign so ECDSA.recover doesn't revert; result being owner or not doesn't matter here.
      const sig = await ownerWallet.signMessage(ethers.getBytes(userOpHash));

      const epBefore = await ethers.provider.getBalance(mockEPAddr);
      await (mockEP as any).callValidate(accountAddr, userOpHash, missingFunds, sig);
      const epAfter = await ethers.provider.getBalance(mockEPAddr);

      expect(epAfter - epBefore).to.equal(missingFunds);
    });
  });

  // Line 57: execute reverts when called from a stranger
  describe('execute', function () {
    it('reverts when caller is neither owner nor EntryPoint', async function () {
      const {account, deployer} = await deploy();
      const stranger = ethers.Wallet.createRandom().connect(ethers.provider);
      await networkHelpers.setBalance(await stranger.getAddress(), ethers.parseEther('1'));

      await expect(
        (account as any).connect(stranger).execute(await deployer.getAddress(), 0n, '0x'),
      ).to.be.revertedWithCustomError(account, 'SimpleA7A5Account__NotOwnerOrEntryPoint');
    });

    // Lines 60-61: assembly revert when the target call fails
    it('propagates the revert reason from a failing target call', async function () {
      const {ownerWallet, account, accountAddr} = await deploy();
      await networkHelpers.setBalance(accountAddr, ethers.parseEther('1'));

      const target = await ethers.deployContract('RevertingTarget');
      await target.waitForDeployment();
      const failData = target.interface.encodeFunctionData('fail');

      await expect(
        (account as any).connect(ownerWallet).execute(await target.getAddress(), 0n, failData),
      ).to.be.revertedWith('target failed');
    });

    it('emits Executed on success', async function () {
      const {ownerWallet, account} = await deploy();
      const target = await ethers.deployContract('RevertingTarget');
      await target.waitForDeployment();
      const targetAddr = await target.getAddress();

      await expect((account as any).connect(ownerWallet).execute(targetAddr, 0n, '0x')).to.emit(account, 'Executed');
    });
  });
});
