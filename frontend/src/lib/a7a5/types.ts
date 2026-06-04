import type {
  BalancesResponse,
  ProtocolState,
  AddressQueryResult,
  RolesResponse,
} from '../../types/api';

export interface A7A5Adapter {
  readonly chainId: number;
  readonly supportsWA7A5: boolean;
  fetchBalances(user: string): Promise<BalancesResponse>;
  fetchProtocolState(): Promise<ProtocolState>;
  fetchAddressQuery(target: string): Promise<AddressQueryResult>;
  fetchRoles(): Promise<RolesResponse>;
  fetchAllowance(owner: string, spender: string): Promise<string>;
}
