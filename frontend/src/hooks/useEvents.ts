import { useQuery } from '@tanstack/react-query';
import { fetchRecentEvents } from '../lib/a7a5/api';
import type { Addresses } from '../config/addresses';

export function useEvents(chainId: number | undefined, addresses: Addresses | null) {
  return useQuery({
    queryKey: ['events', chainId],
    queryFn: () => fetchRecentEvents(chainId!, addresses!),
    enabled: false, // manual fetch only — call refetch() from the UI
  });
}
