interface TronLinkProvider {
  request(args: { method: 'tron_requestAccounts' }): Promise<{ code: number; message: string }>;
}

interface TronConstantResult {
  constant_result?: string[];
}

interface TronAccountInfo {
  balance?: number;
  trc20?: Array<Record<string, string>>;
}

interface TronTransactionBuilder {
  triggerConstantContract(
    contractAddress: string,
    functionSelector: string,
    options: object,
    parameters: Array<{ type: string; value: unknown }>,
    issuerAddress: string
  ): Promise<TronConstantResult>;
}

interface TronTrx {
  getAccount(address: string): Promise<TronAccountInfo>;
}

interface TronWeb {
  defaultAddress: { base58: string | false; hex: string | false };
  ready: boolean;
  transactionBuilder: TronTransactionBuilder;
  trx: TronTrx;
}

interface Window {
  tronWeb?: TronWeb;
  tronLink?: TronLinkProvider;
}
