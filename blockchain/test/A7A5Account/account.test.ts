import {expect} from 'chai';
import {conn, ethers, loadFixture, deployAccountFixture} from './fixtures.js';
import {ERC7821_BATCH_MODE, buildErc7821ExecuteCalldata} from '../../common/erc4337.js';

describe('A7A5Account (unit)', function () {
  this.timeout(60_000);

  // ── Constructor / Initialization ────────────────────────────────────────────

  describe('initialization', function () {
    it('implementation is locked — bare impl reverts on initialize', async function () {
      const {impl} = await loadFixture(deployAccountFixture);
      const randomAddr = ethers.Wallet.createRandom().address;
      await expect((impl as any).initialize(randomAddr)).to.be.revertedWithCustomError(impl, 'InvalidInitialization');
    });

    it('initialize sets owner correctly', async function () {
      const {account, ownerWallet} = await loadFixture(deployAccountFixture);
      expect(await (account as any).owner()).to.equal(ownerWallet.address);
    });

    it('initialize reverts for zero address owner', async function () {
      const {factory} = await loadFixture(deployAccountFixture);
      // The proxy constructor delegatecalls initialize(address(0)) which reverts.
      await expect((factory as any).deployAccount(ethers.ZeroAddress)).to.be.revert(ethers);
    });

    it('initialize reverts when called twice on a proxy', async function () {
      const {account, ownerWallet} = await loadFixture(deployAccountFixture);
      await expect((account as any).initialize(ownerWallet.address)).to.be.revertedWithCustomError(account, 'InvalidInitialization');
    });

    it('initializeApprovals sets ERC-20 allowances', async function () {
      const {account, accountAddr, mockEP} = await loadFixture(deployAccountFixture);
      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      const spender = ethers.Wallet.createRandom().address;

      // initializeApprovals slot is already consumed by factory — we need a fresh proxy to test it.
      // Test via a direct deployAccountWithApprovals scenario instead (factory-v2.test.ts covers that).
      // Here we just confirm the slot is sealed (reinitializer(2) consumed).
      await expect((account as any).initializeApprovals([[tokenAddr, spender, 1n]])).to.be.revertedWithCustomError(account, 'InvalidInitialization');
    });
  });

  // ── validateUserOp / Signature ──────────────────────────────────────────────

  describe('validateUserOp / signature', function () {
    it('rejects calls from non-EntryPoint', async function () {
      const {account, deployer} = await loadFixture(deployAccountFixture);
      const op = {
        sender: ethers.ZeroAddress,
        nonce: 0n,
        initCode: '0x',
        callData: '0x',
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: '0x',
        signature: '0x',
      };
      await expect((account as any).connect(deployer).validateUserOp(op, ethers.ZeroHash, 0n)).to.be.revertedWithCustomError(
        account,
        'AccountUnauthorized',
      );
    });

    it('returns SIG_VALIDATION_SUCCESS (0) for a valid personal_sign signature', async function () {
      const {mockEP, accountAddr, ownerWallet} = await loadFixture(deployAccountFixture);
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test-hash'));
      const sig = await ownerWallet.signMessage(ethers.getBytes(userOpHash));
      const result: bigint = await (mockEP as any).callValidate.staticCall(accountAddr, userOpHash, 0n, sig);
      expect(result).to.equal(0n);
    });

    it('returns SIG_VALIDATION_FAILED (1) for wrong signer', async function () {
      const {mockEP, accountAddr} = await loadFixture(deployAccountFixture);
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test-hash'));
      const wrongSigner = ethers.Wallet.createRandom();
      const sig = await wrongSigner.signMessage(ethers.getBytes(userOpHash));
      const result: bigint = await (mockEP as any).callValidate.staticCall(accountAddr, userOpHash, 0n, sig);
      expect(result).to.equal(1n);
    });

    it('returns SIG_VALIDATION_FAILED (1) for malformed signature', async function () {
      const {mockEP, accountAddr} = await loadFixture(deployAccountFixture);
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test-hash'));
      const result: bigint = await (mockEP as any).callValidate.staticCall(accountAddr, userOpHash, 0n, '0xdeadbeef');
      expect(result).to.equal(1n);
    });

    it('sends missingAccountFunds ETH to EntryPoint', async function () {
      const {mockEP, mockEPAddr, accountAddr, deployer, ownerWallet} = await loadFixture(deployAccountFixture);
      // Fund the account proxy with 1 ETH.
      await deployer.sendTransaction({to: accountAddr, value: ethers.parseEther('1')});

      const epBalBefore = await ethers.provider.getBalance(mockEPAddr);
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const sig = await ownerWallet.signMessage(ethers.getBytes(userOpHash));
      const missingFunds = ethers.parseEther('0.1');
      await (mockEP as any).callValidate(accountAddr, userOpHash, missingFunds, sig);
      const epBalAfter = await ethers.provider.getBalance(mockEPAddr);
      expect(epBalAfter - epBalBefore).to.equal(missingFunds);
    });
  });

  // ── ERC-7821 Batch Execution ────────────────────────────────────────────────

  describe('ERC-7821 batch execution', function () {
    it('EntryPoint (mockEP impersonated) can execute a batch', async function () {
      const {account, accountAddr, mockEPAddr, deployer} = await loadFixture(deployAccountFixture);
      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();

      const spender = ethers.Wallet.createRandom().address;
      const approveData = token.interface.encodeFunctionData('approve', [spender, 999n]);

      const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address target, uint256 value, bytes callData)[]'],
        [[[tokenAddr, 0n, approveData]]],
      );
      const ep = await ethers.getImpersonatedSigner(mockEPAddr);
      await deployer.sendTransaction({to: mockEPAddr, value: ethers.parseEther('0.1')});
      await (await (account as any).connect(ep).execute(ERC7821_BATCH_MODE, executionData, {gasLimit: 300_000})).wait();
      expect(await token.allowance(accountAddr, spender)).to.equal(999n);
    });

    it('owner can execute a batch directly', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      // Fund ownerWallet with ETH for gas.
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      const spender = ethers.Wallet.createRandom().address;
      const approveData = token.interface.encodeFunctionData('approve', [spender, 42n]);

      const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address target, uint256 value, bytes callData)[]'],
        [[[tokenAddr, 0n, approveData]]],
      );
      await (await (account as any).connect(ownerWallet).execute(ERC7821_BATCH_MODE, executionData, {gasLimit: 300_000})).wait();
      expect(await token.allowance(accountAddr, spender)).to.equal(42n);
    });

    it('stranger cannot execute', async function () {
      const {account, stranger} = await loadFixture(deployAccountFixture);
      const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address target, uint256 value, bytes callData)[]'],
        [[[ethers.ZeroAddress, 0n, '0x']]],
      );
      await expect((account as any).connect(stranger).execute(ERC7821_BATCH_MODE, executionData)).to.be.revertedWithCustomError(
        account,
        'AccountUnauthorized',
      );
    });

    it('inner call revert is bubbled up', async function () {
      const {account, mockEPAddr, deployer} = await loadFixture(deployAccountFixture);
      const target = await ethers.deployContract('RevertingTarget');
      await target.waitForDeployment();

      const failData = target.interface.encodeFunctionData('fail');
      const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(address target, uint256 value, bytes callData)[]'],
        [[[await target.getAddress(), 0n, failData]]],
      );
      const ep = await ethers.getImpersonatedSigner(mockEPAddr);
      await deployer.sendTransaction({to: mockEPAddr, value: ethers.parseEther('0.1')});
      await expect((account as any).connect(ep).execute(ERC7821_BATCH_MODE, executionData, {gasLimit: 300_000})).to.be.revertedWith('target failed');
    });
  });

  // ── Approval Management ─────────────────────────────────────────────────────

  describe('approval management', function () {
    it('setApproval grants allowance — owner only', async function () {
      const {account, accountAddr, ownerWallet, deployer, stranger} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      const spender = ethers.Wallet.createRandom().address;

      await (await (account as any).connect(ownerWallet).setApproval(tokenAddr, spender, ethers.MaxUint256)).wait();
      expect(await token.allowance(accountAddr, spender)).to.equal(ethers.MaxUint256);
    });

    it('setApproval with amount=0 revokes allowance', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      const spender = ethers.Wallet.createRandom().address;

      await (await (account as any).connect(ownerWallet).setApproval(tokenAddr, spender, ethers.MaxUint256)).wait();
      await (await (account as any).connect(ownerWallet).setApproval(tokenAddr, spender, 0n)).wait();
      expect(await token.allowance(accountAddr, spender)).to.equal(0n);
    });

    it('setApproval reverts for non-owner', async function () {
      const {account, stranger} = await loadFixture(deployAccountFixture);
      const tokenAddr = ethers.Wallet.createRandom().address;
      await expect((account as any).connect(stranger).setApproval(tokenAddr, ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(
        account,
        'A7A5Account__NotOwner',
      );
    });

    it('setApprovals (batch) sets multiple allowances', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const tokenA = await ethers.deployContract('MockERC20');
      await tokenA.waitForDeployment();
      const tokenB = await ethers.deployContract('MockERC20');
      await tokenB.waitForDeployment();
      const spender = ethers.Wallet.createRandom().address;

      await (
        await (account as any).connect(ownerWallet).setApprovals([
          [await tokenA.getAddress(), spender, 100n],
          [await tokenB.getAddress(), spender, 200n],
        ])
      ).wait();
      expect(await tokenA.allowance(accountAddr, spender)).to.equal(100n);
      expect(await tokenB.allowance(accountAddr, spender)).to.equal(200n);
    });
  });

  // ── Withdrawal Functions ────────────────────────────────────────────────────

  describe('withdrawal functions', function () {
    it('withdrawToken sends ERC-20 to owner', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      await (await token.mint(accountAddr, 500n)).wait();

      const ownerBefore = await token.balanceOf(ownerWallet.address);
      await (await (account as any).connect(ownerWallet).withdrawToken(await token.getAddress(), 300n)).wait();
      expect(await token.balanceOf(ownerWallet.address)).to.equal(ownerBefore + 300n);
      expect(await token.balanceOf(accountAddr)).to.equal(200n);
    });

    it('withdrawTokenAll drains full ERC-20 balance', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const token = await ethers.deployContract('MockERC20');
      await token.waitForDeployment();
      await (await token.mint(accountAddr, 1000n)).wait();

      await (await (account as any).connect(ownerWallet).withdrawTokenAll(await token.getAddress())).wait();
      expect(await token.balanceOf(accountAddr)).to.equal(0n);
      expect(await token.balanceOf(ownerWallet.address)).to.equal(1000n);
    });

    it('withdrawNative sends ETH to owner', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.5')});
      await deployer.sendTransaction({to: accountAddr, value: ethers.parseEther('1')});

      const ownerBefore = await ethers.provider.getBalance(ownerWallet.address);
      const tx = await (account as any).connect(ownerWallet).withdrawNative(ethers.parseEther('0.5'));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(ownerWallet.address);
      expect(ownerAfter).to.be.closeTo(ownerBefore + ethers.parseEther('0.5') - gasCost, ethers.parseEther('0.001'));
    });

    it('withdrawNativeAll drains all ETH', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.5')});
      await deployer.sendTransaction({to: accountAddr, value: ethers.parseEther('1')});

      await (await (account as any).connect(ownerWallet).withdrawNativeAll()).wait();
      expect(await ethers.provider.getBalance(accountAddr)).to.equal(0n);
    });

    it('withdrawNative reverts when owner cannot receive ETH', async function () {
      const {deployer, mockEPAddr} = await loadFixture(deployAccountFixture);

      // Deploy NonPayableReceiver as the owner of a fresh account.
      const nonPayable = await ethers.deployContract('NonPayableReceiver');
      await nonPayable.waitForDeployment();
      const nonPayableAddr = await nonPayable.getAddress();

      const impl = await ethers.deployContract('A7A5Account', [mockEPAddr]);
      await impl.waitForDeployment();
      const factory2 = await ethers.deployContract('A7A5AccountFactoryV2', [await impl.getAddress(), []]);
      await factory2.waitForDeployment();
      await (factory2 as any).deployAccount(nonPayableAddr);
      const targetAddr: string = await (factory2 as any).predictAddress(nonPayableAddr);
      await deployer.sendTransaction({to: targetAddr, value: ethers.parseEther('0.5')});
      const targetAccount = await ethers.getContractAt('A7A5Account', targetAddr);

      // Impersonate the NonPayableReceiver as the owner, fund for gas via setBalance.
      await conn.networkHelpers.setBalance(nonPayableAddr, ethers.parseEther('0.1'));
      const npSigner = await ethers.getImpersonatedSigner(nonPayableAddr);
      await expect(
        (targetAccount as any).connect(npSigner).withdrawNative(ethers.parseEther('0.1'), {gasLimit: 100_000}),
      ).to.be.revertedWithCustomError(targetAccount, 'A7A5Account__WithdrawFailed');
    });

    it('withdrawal reverts for non-owner', async function () {
      const {account, stranger} = await loadFixture(deployAccountFixture);
      const tokenAddr = ethers.Wallet.createRandom().address;
      await expect((account as any).connect(stranger).withdrawToken(tokenAddr, 1n)).to.be.revertedWithCustomError(account, 'A7A5Account__NotOwner');
    });

    it('withdrawERC721 sends NFT to owner', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const nft = await ethers.deployContract('MockERC721');
      await nft.waitForDeployment();
      await (await nft.mint(accountAddr, 1n)).wait();
      expect(await nft.ownerOf(1n)).to.equal(accountAddr);

      await (await (account as any).connect(ownerWallet).withdrawERC721(await nft.getAddress(), 1n)).wait();
      expect(await nft.ownerOf(1n)).to.equal(ownerWallet.address);
    });

    it('withdrawERC1155 sends tokens to owner', async function () {
      const {account, accountAddr, ownerWallet, deployer} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const nft = await ethers.deployContract('MockERC1155');
      await nft.waitForDeployment();
      await (await nft.mint(accountAddr, 7n, 50n)).wait();

      await (await (account as any).connect(ownerWallet).withdrawERC1155(await nft.getAddress(), 7n, 30n, '0x')).wait();
      expect(await nft.balanceOf(ownerWallet.address, 7n)).to.equal(30n);
      expect(await nft.balanceOf(accountAddr, 7n)).to.equal(20n);
    });
  });

  // ── UUPS Upgrade ────────────────────────────────────────────────────────────

  describe('UUPS upgrade', function () {
    it('owner can upgrade to a new implementation', async function () {
      const {account, accountAddr, ownerWallet, deployer, mockEPAddr} = await loadFixture(deployAccountFixture);
      await deployer.sendTransaction({to: ownerWallet.address, value: ethers.parseEther('0.1')});

      const newImpl = await ethers.deployContract('A7A5Account', [mockEPAddr]);
      await newImpl.waitForDeployment();
      const newImplAddr = await newImpl.getAddress();

      // upgradeToAndCall with empty data.
      await (await (account as any).connect(ownerWallet).upgradeToAndCall(newImplAddr, '0x')).wait();

      // Owner survives the upgrade.
      expect(await (account as any).owner()).to.equal(ownerWallet.address);
    });

    it('non-owner reverts on upgradeToAndCall', async function () {
      const {account, stranger, mockEPAddr} = await loadFixture(deployAccountFixture);
      const newImpl = await ethers.deployContract('A7A5Account', [mockEPAddr]);
      await newImpl.waitForDeployment();
      await expect((account as any).connect(stranger).upgradeToAndCall(await newImpl.getAddress(), '0x')).to.be.revertedWithCustomError(
        account,
        'A7A5Account__NotOwner',
      );
    });
  });

  // ── NFT Holding ─────────────────────────────────────────────────────────────

  describe('NFT holding', function () {
    it('can receive ERC-721 via safeTransferFrom', async function () {
      const {deployer, accountAddr} = await loadFixture(deployAccountFixture);
      const nft = await ethers.deployContract('MockERC721');
      await nft.waitForDeployment();
      await (await nft.mint(deployer.address, 99n)).wait();
      await (await nft['safeTransferFrom(address,address,uint256)'](deployer.address, accountAddr, 99n)).wait();
      expect(await nft.ownerOf(99n)).to.equal(accountAddr);
    });

    it('can receive ERC-1155 via safeTransferFrom', async function () {
      const {deployer, accountAddr} = await loadFixture(deployAccountFixture);
      const nft = await ethers.deployContract('MockERC1155');
      await nft.waitForDeployment();
      await (await nft.mint(deployer.address, 3n, 100n)).wait();
      await (await nft['safeTransferFrom(address,address,uint256,uint256,bytes)'](deployer.address, accountAddr, 3n, 50n, '0x')).wait();
      expect(await nft.balanceOf(accountAddr, 3n)).to.equal(50n);
    });
  });
});
