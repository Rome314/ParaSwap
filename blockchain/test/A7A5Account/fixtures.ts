import {conn, ethers, loadFixture} from '../Paymaster/consts.js';
export {conn};
import {ECDSA_ACCOUNT_FACTORY_V2_ABI, defaultApprovals} from '../../common/erc4337.js';
import {ADDRESSES} from '../../common/addresses.js';

export {ethers, loadFixture};

/** Deploy a MockEntryPoint + A7A5Account impl + A7A5AccountFactoryV2 (no whitelist). */
export async function deployAccountFixture() {
  const [deployer, stranger] = await ethers.getSigners();

  const mockEP = await ethers.deployContract('MockEntryPoint');
  await mockEP.waitForDeployment();
  const mockEPAddr = await mockEP.getAddress();

  const impl = await ethers.deployContract('A7A5Account', [mockEPAddr]);
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();

  // Random standalone owner wallet (not a hardhat signer) so tests can sign messages.
  const ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);

  const factory = await ethers.deployContract('A7A5AccountFactoryV2', [implAddr, []]);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  const accountAddr: string = await (factory as any).predictAddress(ownerWallet.address);
  await (factory as any).deployAccount(ownerWallet.address);

  const account = await ethers.getContractAt('A7A5Account', accountAddr);

  return {deployer, stranger, mockEP, mockEPAddr, impl, implAddr, factory, factoryAddr, ownerWallet, account, accountAddr};
}

/** Deploy factory with whitelisted spenders and two MockERC20 tokens. */
export async function deployFactoryV2Fixture() {
  const [deployer] = await ethers.getSigners();

  const mockEP = await ethers.deployContract('MockEntryPoint');
  await mockEP.waitForDeployment();
  const mockEPAddr = await mockEP.getAddress();

  const impl = await ethers.deployContract('A7A5Account', [mockEPAddr]);
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();

  const tokenA = await ethers.deployContract('MockERC20');
  await tokenA.waitForDeployment();
  const tokenAAddr = await tokenA.getAddress();

  const tokenB = await ethers.deployContract('MockERC20');
  await tokenB.waitForDeployment();
  const tokenBAddr = await tokenB.getAddress();

  const spenderA = ethers.Wallet.createRandom().address;
  const spenderB = ethers.Wallet.createRandom().address;
  const unlisted = ethers.Wallet.createRandom().address;

  const factory = await ethers.deployContract('A7A5AccountFactoryV2', [implAddr, [spenderA, spenderB]]);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  const ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);

  return {deployer, impl, implAddr, factory, factoryAddr, tokenAAddr, tokenBAddr, spenderA, spenderB, unlisted, ownerWallet};
}
