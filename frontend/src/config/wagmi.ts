import { http, createConfig } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { env } from './env';
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS, chainRpcURL } from './chains';

const connectors = [
  injected(),
  ...(env.walletConnectProjectId
    ? [walletConnect({ projectId: env.walletConnectProjectId, showQrModal: true })]
    : []),
];

export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAIN_IDS.map((id) => SUPPORTED_CHAINS[id].chain) as unknown as Parameters<
    typeof createConfig
  >[0]['chains'],
  connectors,
  transports: Object.fromEntries(SUPPORTED_CHAIN_IDS.map((id) => [id, http(chainRpcURL(id))])),
});
