import { useQuery } from '@tanstack/react-query';
import { fetchRoles } from '../lib/a7a5/api';
import type { Addresses } from '../config/addresses';

export function useRoles(chainId: number | undefined, addresses: Addresses | null) {
  return useQuery({
    queryKey: ['roles', chainId],
    queryFn: () => fetchRoles(chainId!, addresses!),
    enabled: !!chainId && !!addresses,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
