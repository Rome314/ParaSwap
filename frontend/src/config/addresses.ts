import {
  getProtocolAddresses,
  TRC20_A7A5_ADDRESS,
  type ProtocolAddresses,
} from '@para-swap/contracts';
import type { SupportedEVMChainId } from './chains';

export { TRC20_A7A5_ADDRESS };
export type Addresses = ProtocolAddresses;

export function getAddresses(chainId: SupportedEVMChainId): Addresses {
  const addresses = getProtocolAddresses(chainId);
  if (!addresses) {
    throw new Error(`Addresses not configured for chain ${chainId}`);
  }
  return addresses;
}
