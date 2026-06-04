import { isTronChain, isSupportedChainId } from '../../config/chains';
import type { SupportedEVMChainId } from '../../config/chains';
import type { Addresses } from '../../config/addresses';
import { EvmA7A5Adapter } from './evm';
import { TronA7A5Adapter } from './tron';

export type { A7A5Adapter } from './types';
export {
  fetchTronAccount, type TronAccountData,
  fetchTrc20Balance, fetchTrc20Paused, fetchTrc20TotalSupply,
  fetchTrc20AddressQuery, type Trc20AddressQueryResult,
  fetchTrc20Allowance,
} from './tron';
export { fetchRecentEvents } from './events';

export function getA7A5Adapter(chainId: SupportedEVMChainId, addresses: Addresses): import('./types').A7A5Adapter {
  if (isTronChain(chainId)) {
    return new TronA7A5Adapter(chainId, addresses.A7A5.A7A5);
  }
  return new EvmA7A5Adapter(chainId, addresses);
}

// Backward-compat wrappers — existing hooks use these signatures unchanged

export function fetchBalances(user: string, chainId: number, addresses: Addresses) {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}`);
  return getA7A5Adapter(chainId, addresses).fetchBalances(user);
}

export function fetchProtocolState(chainId: number, addresses: Addresses) {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}`);
  return getA7A5Adapter(chainId, addresses).fetchProtocolState();
}

export function fetchAddressQuery(target: string, chainId: number, addresses: Addresses) {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}`);
  return getA7A5Adapter(chainId, addresses).fetchAddressQuery(target);
}

export function fetchRoles(chainId: number, addresses: Addresses) {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}`);
  return getA7A5Adapter(chainId, addresses).fetchRoles();
}

export function fetchEthAllowance(owner: string, spender: string, chainId: number, addresses: Addresses) {
  if (!isSupportedChainId(chainId)) throw new Error(`Unsupported chain ${chainId}`);
  return getA7A5Adapter(chainId, addresses).fetchAllowance(owner, spender);
}
