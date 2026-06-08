import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildInitCode, buildWebAuthnSignedUserOp, encodeInitializeWebAuthn} from '../../common/erc4337.js';
import {forkReady, fundFromWhale} from '../helpers.js';
import {signUserOpHashWebAuthn, testP256PublicKey} from './webauthn-helpers.js';
import {conn, ethers, loadFixture, networkHelpers} from '../Paymaster/consts.js';

const run = forkReady(ADDRESSES.ENTRYPOINT_V08);

(run ? describe : describe.skip)('A7A5WebAuthnAccount fork E2E', function () {
  this.timeout(120_000);

  async function factoryFixture() {
    const [deployer, bundler] = await ethers.getSigners();
    const impl = await ethers.deployContract('A7A5WebAuthnAccount', [ADDRESSES.ENTRYPOINT_V08]);
    await impl.waitForDeployment();
    const factory = await ethers.deployContract('A7A5AccountFactory', [await impl.getAddress()]);
    await factory.waitForDeployment();
    const factoryAddr = await factory.getAddress();
    const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, (await import('../../common/erc4337.js')).ENTRYPOINT_ABI, deployer);
    return {deployer, bundler, factory, factoryAddr, entryPoint};
  }

  it('deploys counterfactual account via initCode UserOp (nonce 0)', async function () {
    const {factory, factoryAddr, entryPoint, bundler, deployer} = await loadFixture(factoryFixture);
    const {qx, qy} = testP256PublicKey();
    const initCalldata = encodeInitializeWebAuthn(ethers as any, qx, qy);
    const predicted: string = await (factory as any).predictAddress(initCalldata);
    const initCode = buildInitCode(ethers as any, factoryAddr, initCalldata);

    await networkHelpers.setBalance(predicted, ethers.parseEther('0.1'));
    await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, predicted, 1_000_000_000n);

    const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [800_000n, 500_000n]);
    const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [1_000_000_000n, 2_000_000_000n]);

    const op = await buildWebAuthnSignedUserOp(
      ethers as any,
      entryPoint as any,
      {
        sender: predicted,
        callData: '0x',
        initCode,
        nonce: 0n,
        verificationGasLimit: 800_000n,
        callGasLimit: 100_000n,
      },
      signUserOpHashWebAuthn,
    );

    const tx = await (entryPoint as any).connect(bundler).handleOps([op], await deployer.getAddress());
    // const receipt = await tx.wait();

    expect(await ethers.provider.getCode(predicted)).to.not.equal('0x');
    const account = await ethers.getContractAt('A7A5WebAuthnAccount', predicted);
    const [rx, ry] = await (account as any).signer();
    expect(rx).to.equal(qx);
    expect(ry).to.equal(qy);
  });
});
