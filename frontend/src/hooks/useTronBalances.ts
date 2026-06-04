import { useQuery } from '@tanstack/react-query';
import { fetchTronAccount, type TronAccountData } from '../lib/a7a5/api';

export function useTronBalances(address: string | null) {
  return useQuery<TronAccountData>({
    queryKey: ['tronBalances', address],
    queryFn: () => fetchTronAccount(address!),
    enabled: !!address,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
