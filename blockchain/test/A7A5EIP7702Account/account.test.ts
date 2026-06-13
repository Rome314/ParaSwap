import {expect} from 'chai';

import {ERC7821_BATCH_MODE} from '../../common/erc4337.js';
import {conn, ethers, networkHelpers} from '../Paymaster/consts.js';

const DELEGATION_PREFIX = '0xef0100';

describe('A7A5EIP7702Account (unit)', function () {
  this.timeout(60_000);

  async function deployAndDelegate() {
    const [deployer] = await ethers.getSigners();
    const mockEP = await ethers.deployContract('MockEntryPoint');
    await mockEP.waitForDeployment();
    const mockEPAddr = await mockEP.getAddress();

    const delegate = await ethers.deployContract('A7A5EIP7702Account', [mockEPAddr]);
    await delegate.waitForDeployment();
    const delegateAddr = await delegate.getAddress();

    const token = await ethers.deployContract('MockERC20');
    await token.waitForDeployment();
    const tokenAddr = await token.getAddress();

    // Fresh EOA so the delegation nonce is deterministic; funded for gas.
    const eoa = ethers.Wallet.createRandom().connect(ethers.provider);
    await networkHelpers.setBalance(eoa.address, ethers.parseEther('10'));

    // Self-sent type-4 tx: the tx consumes the current nonce, so the authorization
    // must be signed over nonce + 1.
    const txNonce = await ethers.provider.getTransactionCount(eoa.address);
    const auth = await eoa.authorize({address: delegateAddr, nonce: txNonce + 1});
    await (await eoa.sendTransaction({type: 4, to: eoa.address, authorizationList: [auth]})).wait();

    const account = await ethers.getContractAt('A7A5EIP7702Account', eoa.address);

    return {deployer, mockEP, mockEPAddr, delegate, delegateAddr, account, eoa, token, tokenAddr};
  }

  it('writes the EIP-7702 delegation designator to the EOA', async function () {
    const {eoa, delegateAddr} = await deployAndDelegate();
    const code = await ethers.provider.getCode(eoa.address);
    expect(code.toLowerCase()).to.equal(DELEGATION_PREFIX + delegateAddr.slice(2).toLowerCase());
  });

  it('exposes the pinned EntryPoint through the delegated EOA', async function () {
    const {account, mockEPAddr} = await deployAndDelegate();
    expect(await (account as any).entryPoint()).to.equal(mockEPAddr);
  });

  it('validateUserOp accepts a raw ECDSA signature by the EOA key', async function () {
    const {mockEP, account, eoa} = await deployAndDelegate();
    const userOpHash = ethers.id('test-user-op');
    const sig = eoa.signingKey.sign(userOpHash).serialized;
    const result = await (mockEP as any).callValidate.staticCall(await account.getAddress(), userOpHash, 0n, sig);
    expect(result).to.equal(0n); // SIG_VALIDATION_SUCCESS
  });

  it('validateUserOp rejects a signature by another key', async function () {
    const {mockEP, account} = await deployAndDelegate();
    const userOpHash = ethers.id('test-user-op');
    const stranger = ethers.Wallet.createRandom();
    const sig = stranger.signingKey.sign(userOpHash).serialized;
    const result = await (mockEP as any).callValidate.staticCall(await account.getAddress(), userOpHash, 0n, sig);
    expect(result).to.equal(1n); // SIG_VALIDATION_FAILED
  });

  it('the EOA can self-call execute (ERC-7821 batch)', async function () {
    const {account, eoa, tokenAddr} = await deployAndDelegate();
    const spender = ethers.Wallet.createRandom().address;
    const approveData = new ethers.Interface(['function approve(address spender, uint256 amount) returns (bool)']).encodeFunctionData('approve', [
      spender,
      777n,
    ]);
    const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(address target, uint256 value, bytes callData)[]'],
      [[[tokenAddr, 0n, approveData]]],
    );
    await (await (account.connect(eoa) as any).execute(ERC7821_BATCH_MODE, executionData)).wait();

    const token = new ethers.Contract(tokenAddr, ['function allowance(address owner, address spender) view returns (uint256)'], ethers.provider);
    expect(await token.allowance(eoa.address, spender)).to.equal(777n);
  });

  it('execute reverts for callers other than the EOA or EntryPoint', async function () {
    const {account, deployer, tokenAddr} = await deployAndDelegate();
    const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(address target, uint256 value, bytes callData)[]'],
      [[[tokenAddr, 0n, '0x']]],
    );
    await expect((account.connect(deployer) as any).execute(ERC7821_BATCH_MODE, executionData)).to.be.revertedWithCustomError(
      account,
      'AccountUnauthorized',
    );
  });
});
