import { useAccount } from 'wagmi';
import { isSupportedChainId, SUPPORTED_CHAINS, type SupportedEVMChainId } from '../config/chains';
import { getAddresses, type Addresses } from '../config/addresses';

type ChainOk = {
  supported: true;
  chainId: SupportedEVMChainId;
  chainName: string;
  addresses: Addresses;
};

type ChainUnsupported = {
  supported: false;
  chainId: number | undefined;
  chainName: null;
  addresses: null;
};

export type ChainState = ChainOk | ChainUnsupported;

export function useConnectedChain(): ChainState {
  const { chainId } = useAccount();

  if (isSupportedChainId(chainId)) {
    return {
      supported: true,
      chainId,
      chainName: SUPPORTED_CHAINS[chainId].chain.name,
      addresses: getAddresses(chainId),
    };
  }

  return { supported: false, chainId, chainName: null, addresses: null };
}

export function useChain(chainId : number): ChainState {

  if (isSupportedChainId(chainId)) {
    return {
      supported: true,
      chainId,
      chainName: SUPPORTED_CHAINS[chainId].chain.name,
      addresses: getAddresses(chainId),
    };
  }

  return { supported: false, chainId, chainName: null, addresses: null };
}

