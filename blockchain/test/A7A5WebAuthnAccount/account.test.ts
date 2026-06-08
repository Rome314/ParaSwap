import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildErc7821ExecuteCalldata, encodeInitializeWebAuthn} from '../../common/erc4337.js';
import {conn, ethers, networkHelpers} from '../Paymaster/consts.js';
import {encodeWebAuthnAssertion, signUserOpHashWebAuthn, testP256PublicKey} from './webauthn-helpers.js';

describe('A7A5WebAuthnAccount (unit)', function () {
  this.timeout(60_000);

  async function deployAccount() {
    const [deployer] = await ethers.getSigners();
    const mockEP = await ethers.deployContract('MockEntryPoint');
    await mockEP.waitForDeployment();
    const mockEPAddr = await mockEP.getAddress();

    const impl = await ethers.deployContract('A7A5WebAuthnAccount', [mockEPAddr]);
    await impl.waitForDeployment();
    const implAddr = await impl.getAddress();

    const factory = await ethers.deployContract('A7A5AccountFactory', [implAddr]);
    await factory.waitForDeployment();

    const {qx, qy} = testP256PublicKey();
    const initCalldata = encodeInitializeWebAuthn(ethers as any, qx, qy);
    const accountAddr: string = await (factory as any).predictAddress(initCalldata);
    await (factory as any).cloneAndInitialize(initCalldata);
    const account = await ethers.getContractAt('A7A5WebAuthnAccount', accountAddr);

    return {deployer, mockEP, mockEPAddr, account, accountAddr, qx, qy, initCalldata, factory};
  }

  it('initializeWebAuthn sets the P-256 public key on the clone', async function () {
    const {account, qx, qy} = await deployAccount();
    const [rx, ry] = await (account as any).signer();
    expect(rx).to.equal(qx);
    expect(ry).to.equal(qy);
  });

  it('reverts when initializeWebAuthn is called twice', async function () {
    const {account, qx, qy} = await deployAccount();
    await expect((account as any).initializeWebAuthn(qx, qy)).to.be.revert(ethers);
  });

  it('validateUserOp rejects calls from non-EntryPoint', async function () {
    const {account, deployer} = await deployAccount();
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

  it('accepts a valid WebAuthn signature over the userOpHash via MockEntryPoint', async function () {
    const {account, accountAddr, mockEP} = await deployAccount();

    const target = await ethers.deployContract('RevertingTarget');
    await target.waitForDeployment();
    const inner = target.interface.encodeFunctionData('fail');
    const callData = buildErc7821ExecuteCalldata(ethers as any, await target.getAddress(), 0n, inner);

    const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test-user-op-hash'));
    const sig = signUserOpHashWebAuthn(userOpHash);

    const validationData: bigint = await (mockEP as any).callValidate.staticCall(accountAddr, userOpHash, 0n, sig);
    expect(validationData).to.equal(0n);
  });

  it('rejects an invalid WebAuthn signature', async function () {
    const {account, accountAddr, mockEP} = await deployAccount();
    const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('bad-sig'));
    const validationData: bigint = await (mockEP as any).callValidate.staticCall(accountAddr, userOpHash, 0n, '0xdeadbeef');
    expect(validationData).to.equal(1n);
  });
});
