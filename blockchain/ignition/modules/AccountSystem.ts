import {buildModule} from '@nomicfoundation/hardhat-ignition/modules';
import {ADDRESSES} from '../../common/addresses.js';

export default buildModule('AccountSystem', (m) => {
  const entryPoint = m.getParameter('entryPoint', ADDRESSES.ENTRYPOINT_V08);

  const accountImpl = m.contract('A7A5WebAuthnAccount', [entryPoint]);
  const accountFactory = m.contract('A7A5AccountFactory', [accountImpl]);

  return {accountImpl, accountFactory};
});
