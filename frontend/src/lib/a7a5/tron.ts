import { tron } from 'wagmi/chains';
import { getAddresses } from '../../config/addresses';
import { chainRpcURL } from '../../config/chains';
import type {
  BalancesResponse,
  ProtocolState,
  AddressQueryResult,
  RolesResponse,
} from '../../types/api';
import type { A7A5Adapter } from './types';

// ---------- Standalone helpers (kept for backward compat with useTronBalances hook) ----------

export interface TronAccountData {
  trx: string;       // TRX balance in sun (1 TRX = 1_000_000 sun)
  a7a5Trc20: string; // A7A5 TRC-20 raw balance (6 decimals)
}

export async function fetchTronAccount(tronAddress: string): Promise<TronAccountData> {
  const tw = window.tronWeb;
  if (!tw) throw new Error('TronWeb not available');
  const a7a5Address = getAddresses(tron.id).A7A5.A7A5;
  if (!a7a5Address) throw new Error('TRON A7A5 address not configured');

  const [accountInfo, balResult] = await Promise.all([
    tw.trx.getAccount(tronAddress),
    tw.transactionBuilder.triggerConstantContract(
      a7a5Address,
      'balanceOf(address)',
      {},
      [{ type: 'address', value: tronAddress }],
      tronAddress
    ),
  ]);

  const trx = String(accountInfo?.balance ?? 0);
  const balHex = balResult?.constant_result?.[0];
  return { trx, a7a5Trc20: balHex ? BigInt('0x' + balHex).toString() : '0' };
}

// ---------- Backward-compat standalone TRON functions (address resolved from config) ----------

export interface Trc20AddressQueryResult {
  balance: string;
  blacklisted: boolean;
}

function _getTronA7A5Address(): string {
  const addr = getAddresses(tron.id).A7A5.A7A5;
  if (!addr) throw new Error('TRON A7A5 address not configured');
  return addr;
}

export async function fetchTrc20Balance(tronAddress: string): Promise<string> {
  const tw = window.tronWeb;
  if (!tw) throw new Error('TronWeb not available');
  const result = await tw.transactionBuilder.triggerConstantContract(
    _getTronA7A5Address(),
    'balanceOf(address)',
    {},
    [{ type: 'address', value: tronAddress }],
    tronAddress
  );
  const hex = result?.constant_result?.[0];
  return hex ? BigInt('0x' + hex).toString() : '0';
}

export async function fetchTrc20Paused(): Promise<boolean> {
  const hex = await _triggerRead(_getTronA7A5Address(), 'paused()', []);
  return hex ? BigInt('0x' + hex) !== 0n : false;
}

export async function fetchTrc20TotalSupply(): Promise<string> {
  const hex = await _triggerRead(_getTronA7A5Address(), 'totalSupply()', []);
  return hex ? BigInt('0x' + hex).toString() : '0';
}

export async function fetchTrc20AddressQuery(tronAddress: string): Promise<Trc20AddressQueryResult> {
  const tw = window.tronWeb;
  if (!tw) throw new Error('TronWeb not available');
  const addr = _getTronA7A5Address();
  const [balResult, blResult] = await Promise.all([
    tw.transactionBuilder.triggerConstantContract(addr, 'balanceOf(address)', {}, [{ type: 'address', value: tronAddress }], tronAddress),
    tw.transactionBuilder.triggerConstantContract(addr, 'isBlackListed(address)', {}, [{ type: 'address', value: tronAddress }], tronAddress),
  ]);
  const balHex = balResult?.constant_result?.[0];
  const blHex = blResult?.constant_result?.[0];
  return {
    balance: balHex ? BigInt('0x' + balHex).toString() : '0',
    blacklisted: blHex ? BigInt('0x' + blHex) !== 0n : false,
  };
}

export async function fetchTrc20Allowance(owner: string, spender: string): Promise<string> {
  const tw = window.tronWeb;
  if (!tw) throw new Error('TronLink not connected');
  const result = await tw.transactionBuilder.triggerConstantContract(
    _getTronA7A5Address(),
    'allowance(address,address)',
    {},
    [{ type: 'address', value: owner }, { type: 'address', value: spender }],
    owner
  );
  const hex: string | undefined = result?.constant_result?.[0];
  return hex ? BigInt('0x' + hex).toString() : '0';
}

// ---------- Internal TRON read helper (TronWeb with TronGrid fallback) ----------

async function _triggerRead(
  a7a5Address: string,
  selector: string,
  args: { type: string; value: string }[],
  caller = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
): Promise<string | undefined> {
  const endpoint = `${chainRpcURL(tron.id)}/wallet/triggerconstantcontract`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      owner_address: caller,
      contract_address: a7a5Address,
      function_selector: selector,
      parameter: args.map((a) => a.value.replace(/^0x/, '').padStart(64, '0')).join(''),
      visible: true,
    }),
  });
  if (!res.ok) throw new Error(`Tron RPC ${res.status}`);
  const json = await res.json();
  return json?.constant_result?.[0];
}

// ---------- TronA7A5Adapter ----------

export class TronA7A5Adapter implements A7A5Adapter {
  readonly chainId: number;
  readonly supportsWA7A5 = false as const;
  private readonly a7a5Address: string;

  constructor(chainId: number, a7a5Address: string) {
    if (!a7a5Address) throw new Error(`TRON A7A5 address not configured for chain ${chainId}`);
    this.chainId = chainId;
    this.a7a5Address = a7a5Address;
  }

  async fetchBalances(user: string): Promise<BalancesResponse> {
    const tw = window.tronWeb;
    if (!tw) throw new Error('TronWeb not available');

    const addr = this.a7a5Address;
    const [accountInfo, balResult, blResult, pausedHex] = await Promise.all([
      tw.trx.getAccount(user),
      tw.transactionBuilder.triggerConstantContract(addr, 'balanceOf(address)', {}, [{ type: 'address', value: user }], user),
      tw.transactionBuilder.triggerConstantContract(addr, 'isBlackListed(address)', {}, [{ type: 'address', value: user }], user),
      _triggerRead(addr, 'paused()', []),
    ]);

    const balHex = balResult?.constant_result?.[0];
    const blHex = blResult?.constant_result?.[0];

    return {
      user,
      eth: String(accountInfo?.balance ?? 0),
      tokens: [
        { symbol: 'A7A5', address: addr, balance: balHex ? BigInt('0x' + balHex).toString() : '0' },
      ],
      a7a5State: {
        basisPointsRate: '0',
        paused: pausedHex ? BigInt('0x' + pausedHex) !== 0n : false,
        userBlacklisted: blHex ? BigInt('0x' + blHex) !== 0n : false,
        userShares: '0',
      },
    };
  }

  async fetchProtocolState(): Promise<ProtocolState> {
    const addr = this.a7a5Address;
    const [liquidityHex, sharesHex, bprHex, pausedHex] = await Promise.all([
      _triggerRead(addr, 'totalLiquidity()', []),
      _triggerRead(addr, 'totalShares()', []),
      _triggerRead(addr, 'basisPointsRate()', []),
      _triggerRead(addr, 'paused()', []),
    ]);

    return {
      totalLiquidity:  liquidityHex ? BigInt('0x' + liquidityHex).toString() : '0',
      totalShares:     sharesHex ? BigInt('0x' + sharesHex).toString() : '0',
      basisPointsRate: bprHex    ? BigInt('0x' + bprHex).toString()    : '0',
      paused: pausedHex ? BigInt('0x' + pausedHex) !== 0n : false,
    };
  }

  async fetchAddressQuery(target: string): Promise<AddressQueryResult> {
    const tw = window.tronWeb;
    if (!tw) throw new Error('TronWeb not available');

    const addr = this.a7a5Address;
    const [balResult, blResult] = await Promise.all([
      tw.transactionBuilder.triggerConstantContract(addr, 'balanceOf(address)', {}, [{ type: 'address', value: target }], target),
      tw.transactionBuilder.triggerConstantContract(addr, 'isBlackListed(address)', {}, [{ type: 'address', value: target }], target),
    ]);

    const balHex = balResult?.constant_result?.[0];
    const blHex = blResult?.constant_result?.[0];
    return {
      balance: balHex ? BigInt('0x' + balHex).toString() : '0',
      shares: '0',
      blacklisted: blHex ? BigInt('0x' + blHex) !== 0n : false,
    };
  }

  fetchRoles(): Promise<RolesResponse> {
    const zero = '0x0000000000000000000000000000000000000000';
    return Promise.resolve({ owner: zero, compliance: zero, accountant: zero });
  }

  async fetchAllowance(owner: string, spender: string): Promise<string> {
    const tw = window.tronWeb;
    if (!tw) throw new Error('TronLink not connected');
    const result = await tw.transactionBuilder.triggerConstantContract(
      this.a7a5Address,
      'allowance(address,address)',
      {},
      [{ type: 'address', value: owner }, { type: 'address', value: spender }],
      owner
    );
    const hex: string | undefined = result?.constant_result?.[0];
    return hex ? BigInt('0x' + hex).toString() : '0';
  }
}
