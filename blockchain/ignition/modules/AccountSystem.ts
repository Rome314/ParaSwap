import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';
import Paymasters from './Paymasters.js';
import SwapStack from './SwapStack.js';

export default buildModule('AccountSystem', (m) => {
  const entryPoint = m.getParameter('entryPoint', ADDRESSES.ENTRYPOINT_V08);

  const {a7a5Paymaster, usdtPaymaster} = m.useModule(Paymasters);
  const {facade, paraSwap} = m.useModule(SwapStack);

  // WebAuthn + EIP-7702 account system
  const accountImpl = m.contract('A7A5WebAuthnAccount', [entryPoint]);
  const eip7702Delegate = m.contract('A7A5EIP7702Account', [entryPoint]);
  const accountFactory = m.contract('A7A5AccountFactory', [accountImpl, eip7702Delegate, [facade, paraSwap, a7a5Paymaster, usdtPaymaster]]);

  // ECDSA UUPS account system
  const ecdsaAccountImpl = m.contract('A7A5Account', [entryPoint]);
  const ecdsaAccountFactory = m.contract('A7A5AccountFactoryV2', [ecdsaAccountImpl, [facade, paraSwap, a7a5Paymaster, usdtPaymaster]]);

  return {accountImpl, eip7702Delegate, accountFactory, ecdsaAccountImpl, ecdsaAccountFactory};
});
