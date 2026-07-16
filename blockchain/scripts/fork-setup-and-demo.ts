// Deploys the full AA stack on a mainnet fork and runs A7A5-gas + USDT-gas demo swaps.
// Prints deployed addresses JSON for frontend .env configuration.
//
//   ALCHEMY_API_KEY=... npx hardhat run scripts/fork-setup-and-demo.ts
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';
import {
  ENTRYPOINT_ABI,
  approvalBatchCalls,
  buildErc7821BatchCalldata,
  buildErc7821ExecuteCalldata,
  buildUserOp,
  buildWebAuthnSignedUserOp,
  defaultApprovals,
  encodeInitializeWebAuthn,
  entryPointDomain,
  PACKED_USER_OP_TYPED_DATA_TYPES,
  userOpToTypedDataMessage,
} from '../common/erc4337.js';
import {signUserOpHashWebAuthn, testP256PublicKey} from '../test/A7A5WebAuthnAccount/webauthn-helpers.js';

const conn = await network.create('localhost');
const {ethers} = conn;

const TWAP_WINDOW = 60;
const MAX_STALENESS = 2 * 24 * 60 * 60;
const A7A5_FUNDING = 5_000_000_000n;
const A7A5_SWAP_IN = 1_000_000_000n;
const USDT_FUNDING = 500_000_000n;
const USDT_SWAP_IN = 100_000_000n;
const USDT_POKE = 1_000_000n;
const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);

const ERC20 = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];
const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];
const POOL_ABI = ['function increaseObservationCardinalityNext(uint16)'];

let step = 0;
function logStep(message: string, detail?: string) {
  step += 1;
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[${step}] ${message}${suffix}`);
}

async function impersonate(addr: string) {
  const [deployer] = await ethers.getSigners();
  await (await deployer.sendTransaction({to: addr, value: ethers.parseEther('100')})).wait();
  // Hardhat node requires explicit impersonation; Ganache pre-unlocks addresses via
  // ganache-fork.cjs unlockedAccounts so the call is a no-op there (error silently ignored).
  try {
    await (ethers.provider as any).send('hardhat_impersonateAccount', [addr]);
  } catch {}
  return (ethers.provider as any).getSigner(addr);
}
async function fundFromWhale(token: string, whale: string, to: string, amount: bigint) {
  const holder = await impersonate(whale);
  await (await new ethers.Contract(token, ERC20, holder).transfer(to, amount)).wait();
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

async function main() {
  const net = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlockNumber();
  console.log(`\nFork setup: chainId=${net.chainId} block=${block}\n`);

  logStep('Loading signers');
  const [deployer, bundler] = await ethers.getSigners();
  const owner = await deployer.getAddress();
  logStep('Deployer ready', owner);

  logStep('Deploying PoolsFacade');
  const facade = await ethers.deployContract(
    'PoolsFacade',
    [
      ADDRESSES.WA7A5,
      ADDRESSES.A7A5,
      ADDRESSES.USDT,
      ADDRESSES.V2_PAIR_USDT_A7A5,
      ADDRESSES.SWAP_ROUTER_02,
      ADDRESSES.QUOTER_V2,
      ADDRESSES.V3_FEE_TIER,
      owner,
    ],
    deployer,
  );
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();
  logStep('PoolsFacade deployed', facadeAddr);

  logStep('Deploying ParaSwap');
  const paraSwap = await ethers.deployContract('ParaSwap', [facadeAddr, ADDRESSES.SWAP_ROUTER_02, owner]);
  await paraSwap.waitForDeployment();
  const paraSwapAddr = await paraSwap.getAddress();
  logStep('ParaSwap deployed', paraSwapAddr);

  logStep('Deploying A7A5UsdtTwapOracle');
  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.WA7A5, ADDRESSES.USDT, TWAP_WINDOW, owner]);
  await twap.waitForDeployment();
  logStep('TWAP oracle deployed', await twap.getAddress());

  logStep('Deploying A7A5NativeOracle');
  const a7a5Oracle = await ethers.deployContract('A7A5NativeOracle', [
    await twap.getAddress(),
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    owner,
  ]);
  await a7a5Oracle.waitForDeployment();
  logStep('A7A5 native oracle deployed', await a7a5Oracle.getAddress());

  logStep('Deploying UsdtNativeOracle');
  const usdtOracle = await ethers.deployContract('UsdtNativeOracle', [ADDRESSES.CHAINLINK_USDT_ETH, MAX_STALENESS, owner]);
  await usdtOracle.waitForDeployment();
  logStep('USDT native oracle deployed', await usdtOracle.getAddress());

  logStep('Warming TWAP oracle', `pool=${ADDRESSES.V3_POOL_USDT_WA7A5}`);
  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();
  await fundFromWhale(ADDRESSES.USDT, ADDRESSES.USDT_WHALE, owner, USDT_POKE * 10n);
  await (await new ethers.Contract(ADDRESSES.USDT, ERC20, deployer).approve(facadeAddr, USDT_POKE * 10n)).wait();
  for (let i = 0; i < 3; i++) {
    await (ethers.provider as any).send('evm_increaseTime', [45]);
    await (ethers.provider as any).send('evm_mine', []);
    await (await (facade as any).connect(deployer).swapWA7A5(USDT_POKE, 0, 0n, FAR_DEADLINE)).wait();
    logStep('TWAP poke swap', `${i + 1}/3`);
  }

  const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, ENTRYPOINT_ABI, deployer);

  logStep('Deploying A7A5Paymaster');
  const a7a5Paymaster = await ethers.deployContract('A7A5Paymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.A7A5,
    await a7a5Oracle.getAddress(),
    owner,
  ]);
  await a7a5Paymaster.waitForDeployment();
  await (await (a7a5Paymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (a7a5Paymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();
  logStep('A7A5 paymaster funded and staked', await a7a5Paymaster.getAddress());

  logStep('Deploying UsdtPaymaster');
  const usdtPaymaster = await ethers.deployContract('UsdtPaymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.USDT,
    await usdtOracle.getAddress(),
    owner,
  ]);
  await usdtPaymaster.waitForDeployment();
  await (await (usdtPaymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (usdtPaymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();
  logStep('USDT paymaster funded and staked', await usdtPaymaster.getAddress());

  logStep('Deploying A7A5WebAuthnAccount implementation');
  const accountImpl = await ethers.deployContract('A7A5WebAuthnAccount', [ADDRESSES.ENTRYPOINT_V08]);
  await accountImpl.waitForDeployment();
  logStep('Account implementation deployed', await accountImpl.getAddress());

  logStep('Deploying A7A5EIP7702Account delegate');
  const eip7702Delegate = await ethers.deployContract('A7A5EIP7702Account', [ADDRESSES.ENTRYPOINT_V08]);
  await eip7702Delegate.waitForDeployment();
  const eip7702DelegateAddr = await eip7702Delegate.getAddress();
  logStep('EIP-7702 delegate deployed', eip7702DelegateAddr);

  const a7a5PaymasterAddr = await a7a5Paymaster.getAddress();
  const usdtPaymasterAddr = await usdtPaymaster.getAddress();

  logStep('Deploying A7A5AccountFactory');
  const factory = await ethers.deployContract('A7A5AccountFactory', [
    await accountImpl.getAddress(),
    eip7702DelegateAddr,
    [facadeAddr, paraSwapAddr, a7a5PaymasterAddr, usdtPaymasterAddr],
  ]);
  await factory.waitForDeployment();
  logStep('Account factory deployed', await factory.getAddress());

  const accountApprovals = defaultApprovals({
    a7a5: ADDRESSES.A7A5,
    wa7a5: ADDRESSES.WA7A5,
    usdt: ADDRESSES.USDT,
    poolsFacade: facadeAddr,
    paraSwap: paraSwapAddr,
    a7a5Paymaster: a7a5PaymasterAddr,
    usdtPaymaster: usdtPaymasterAddr,
  });

  logStep('Creating WebAuthn smart account with creation-time approvals');
  const {qx, qy} = testP256PublicKey();
  const initCalldata = encodeInitializeWebAuthn(ethers as any, qx, qy);
  const accountAddr = await (factory as any).predictAddress(initCalldata);
  await (
    await (factory as any).cloneAndInitializeWithApprovals(
      initCalldata,
      accountApprovals.map((a) => [a.token, a.spender, a.amount]),
    )
  ).wait();
  logStep('WebAuthn account ready (approvals granted at creation)', accountAddr);

  logStep('Funding smart account from whales');
  await fundFromWhale(ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_FUNDING);
  await fundFromWhale(ADDRESSES.USDT, ADDRESSES.USDT_WHALE, accountAddr, USDT_FUNDING);
  logStep('Account funded', `A7A5=${A7A5_FUNDING} USDT=${USDT_FUNDING}`);

  const addresses = {
    entryPoint: ADDRESSES.ENTRYPOINT_V08,
    paraSwap: paraSwapAddr,
    poolsFacade: facadeAddr,
    a7a5Paymaster: a7a5PaymasterAddr,
    usdtPaymaster: usdtPaymasterAddr,
    accountFactory: await factory.getAddress(),
    accountImpl: await accountImpl.getAddress(),
    eip7702Delegate: eip7702DelegateAddr,
    webAuthnAccount: accountAddr,
    a7a5TwapOracle: await twap.getAddress(),
    a7a5NativeOracle: await a7a5Oracle.getAddress(),
    usdtNativeOracle: await usdtOracle.getAddress(),
  };

  logStep('Deployment complete');
  console.log('\n── Deployed AA stack ─────────────────────────────────');
  console.log(JSON.stringify(addresses, null, 2));

  logStep('Running A7A5-gas sponsored swap demo');
  const a7a5Op = await buildWebAuthnSignedUserOp(
    ethers as any,
    entryPoint as any,
    {
      sender: accountAddr,
      callData: buildSwapCallData(paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN),
      paymaster: addresses.a7a5Paymaster,
    },
    signUserOpHashWebAuthn,
  );
  await (entryPoint as any).connect(bundler).handleOps([a7a5Op], owner);
  logStep('A7A5-gas swap demo complete');

  logStep('Running USDT-gas sponsored swap demo');
  const usdtOp = await buildWebAuthnSignedUserOp(
    ethers as any,
    entryPoint as any,
    {
      sender: accountAddr,
      callData: buildSwapCallData(paraSwapAddr, ADDRESSES.USDT, ADDRESSES.A7A5, USDT_SWAP_IN),
      paymaster: addresses.usdtPaymaster,
    },
    signUserOpHashWebAuthn,
  );
  await (entryPoint as any).connect(bundler).handleOps([usdtOp], owner);
  logStep('USDT-gas swap demo complete');

  // ── EIP-7702 demo: delegate dev account #5, approve in the same type-4 tx, swap via paymaster ──
  logStep('EIP-7702 demo: delegating dev account #5');
  const DEV_MNEMONIC = 'test test test test test test test test test test test junk';
  const eoa = ethers.HDNodeWallet.fromPhrase(DEV_MNEMONIC, undefined, "m/44'/60'/0'/0/5").connect(ethers.provider);
  const approveCalldata = buildErc7821BatchCalldata(ethers as any, approvalBatchCalls(ethers as any, accountApprovals));
  // Self-sent type-4 tx consumes the current nonce; the authorization signs nonce + 1.
  const eoaNonce = await ethers.provider.getTransactionCount(eoa.address);
  const auth = await eoa.authorize({address: eip7702DelegateAddr, nonce: eoaNonce + 1});
  await (await eoa.sendTransaction({type: 4, to: eoa.address, data: approveCalldata, authorizationList: [auth]})).wait();
  logStep('EOA delegated + approvals granted in one type-4 tx', eoa.address);

  logStep('Funding EIP-7702 account from whale');
  await fundFromWhale(ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, eoa.address, A7A5_FUNDING);

  logStep('Running EIP-7702 A7A5-gas sponsored swap demo (typed-data signature)');
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const eip7702Op = await buildUserOp(ethers as any, entryPoint as any, {
    sender: eoa.address,
    callData: buildSwapCallData(paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN),
    paymaster: a7a5PaymasterAddr,
  });
  eip7702Op[8] = await eoa.signTypedData(
    entryPointDomain(ADDRESSES.ENTRYPOINT_V08, chainId),
    PACKED_USER_OP_TYPED_DATA_TYPES as any,
    userOpToTypedDataMessage(eip7702Op),
  );
  await (entryPoint as any).connect(bundler).handleOps([eip7702Op], owner);
  logStep('EIP-7702 sponsored swap demo complete');
  console.log(`\nDone — ${step} steps\n`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
