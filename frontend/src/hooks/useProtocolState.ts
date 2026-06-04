import { useQuery } from '@tanstack/react-query';
import { fetchProtocolState } from '../lib/a7a5/api';
import { isSupportedChainId } from '../config/chains';
import type { Addresses } from '../config/addresses';

export function useProtocolState(
  chainId: number | undefined,
  addresses: Addresses | null,
  opts?: { refetchInterval?: number | false }
) {
  const enabled = isSupportedChainId(chainId) && !!addresses;

  return useQuery({
    queryKey: ['protocolState', chainId],
    queryFn: async () => {
      try {
        return await fetchProtocolState(chainId!, addresses!);
      } catch (e) {
        console.error('[useProtocolState] chainId', chainId, e);
        throw e;
      }
    },
    enabled: opts?.refetchInterval ? true : false,
    refetchInterval: opts?.refetchInterval ?? false,
    staleTime: 5_000,
  });
}
