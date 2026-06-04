import { useQuery } from '@tanstack/react-query';
import { fetchBalances } from '../lib/a7a5/api';
import type { Addresses } from '../config/addresses';

export function useBalances(
  user: string | undefined,
  chainId: number | undefined,
  addresses: Addresses | null
) {
  return useQuery({
    queryKey: ['balances', user, chainId],
    queryFn: () => fetchBalances(user!, chainId!, addresses!),
    enabled: !!user && !!chainId && !!addresses,
    refetchInterval: 5_000,
  });
}
