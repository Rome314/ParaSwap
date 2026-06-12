import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';
import SepoliaPaymasters from './SepoliaPaymasters.js';

/**
 * Sepolia account system: SwapStack is omitted (no A7A5 liquidity), so the factory's
 * creation-time approval whitelist only contains the two paymasters.
 */
export default buildModule('SepoliaAccountSystem', (m) => {
  const entryPoint = m.getParameter('entryPoint', ADDRESSES.ENTRYPOINT_V08);

  const {a7a5Paymaster, usdtPaymaster} = m.useModule(SepoliaPaymasters);

  // WebAuthn + EIP-7702 account system
  const accountImpl = m.contract('A7A5WebAuthnAccount', [entryPoint]);
  const eip7702Delegate = m.contract('A7A5EIP7702Account', [entryPoint]);
  const accountFactory = m.contract('A7A5AccountFactory', [
    accountImpl,
    eip7702Delegate,
    [a7a5Paymaster, usdtPaymaster],
  ]);

  // ECDSA UUPS account system (whitelist: paymasters only on Sepolia)
  const ecdsaAccountImpl = m.contract('A7A5Account', [entryPoint]);
  const ecdsaAccountFactory = m.contract('A7A5AccountFactoryV2', [
    ecdsaAccountImpl,
    [a7a5Paymaster, usdtPaymaster],
  ]);

  return {accountImpl, eip7702Delegate, accountFactory, ecdsaAccountImpl, ecdsaAccountFactory};
});
