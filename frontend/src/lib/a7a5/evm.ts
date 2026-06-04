import type { Addresses } from '../../config/addresses';
import type {
  BalancesResponse,
  ProtocolState,
  AddressQueryResult,
  RolesResponse,
  TokenBalance,
} from '../../types/api';
import { getProvider, makeDecoder, multicall } from './helpers';
import { A7A5_IFACE, ERC20_IFACE, WA7A5_IFACE } from './abis';
import type { A7A5Adapter } from './types';

type Call = { target: string; allowFailure: boolean; callData: string };

export class EvmA7A5Adapter implements A7A5Adapter {
  readonly chainId: number;
  readonly supportsWA7A5: boolean;
  private readonly addr: Addresses;

  constructor(chainId: number, addresses: Addresses) {
    if (!addresses.A7A5.A7A5) throw new Error(`A7A5 address not configured for chain ${chainId}`);
    if (!addresses.MULTICALL3) throw new Error(`Multicall3 address not configured for chain ${chainId}`);
    this.chainId = chainId;
    this.addr = addresses;
    this.supportsWA7A5 = !!addresses.A7A5.WA7A5;
  }

  async fetchBalances(user: string): Promise<BalancesResponse> {
    const { A7A5: { A7A5: a7a5, WA7A5: wa7a5 }, USDT: usdt, MULTICALL3: mc } = this.addr;
    const p = getProvider(this.chainId);

    const calls: Call[] = [
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('balanceOf', [user]) }, // 0
    ];

    const wa7a5Idx = wa7a5 ? calls.length : -1;
    if (wa7a5) {
      calls.push({ target: wa7a5, allowFailure: true, callData: ERC20_IFACE.encodeFunctionData('balanceOf', [user]) });
    }

    const usdtIdx = calls.length;
    calls.push({ target: usdt, allowFailure: true, callData: ERC20_IFACE.encodeFunctionData('balanceOf', [user]) });

    const bprIdx = calls.length;
    calls.push({ target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('basisPointsRate') });

    const pausedIdx = calls.length;
    calls.push({ target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('paused') });

    const blIdx = calls.length;
    calls.push({ target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('isBlackListed', [user]) });

    const sharesIdx = calls.length;
    calls.push({ target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('sharesOf', [user]) });

    const [results, ethBal] = await Promise.all([multicall(p, mc, calls), p.getBalance(user)]);
    const dec = makeDecoder(results);

    const tokens: TokenBalance[] = [
      { symbol: 'A7A5', address: a7a5, balance: (dec(A7A5_IFACE, 'balanceOf', 0) ?? 0n).toString() },
    ];
    if (wa7a5 && wa7a5Idx !== -1) {
      tokens.push({ symbol: 'wA7A5', address: wa7a5, balance: (dec(ERC20_IFACE, 'balanceOf', wa7a5Idx) ?? 0n).toString() });
    }
    tokens.push({ symbol: 'USDT', address: usdt, balance: (dec(ERC20_IFACE, 'balanceOf', usdtIdx) ?? 0n).toString() });

    return {
      user,
      eth: ethBal.toString(),
      tokens,
      a7a5State: {
        basisPointsRate: (dec(A7A5_IFACE, 'basisPointsRate', bprIdx) ?? 0n).toString(),
        paused: Boolean(dec(A7A5_IFACE, 'paused', pausedIdx)),
        userBlacklisted: Boolean(dec(A7A5_IFACE, 'isBlackListed', blIdx)),
        userShares: (dec(A7A5_IFACE, 'sharesOf', sharesIdx) ?? 0n).toString(),
      },
    };
  }

  async fetchProtocolState(): Promise<ProtocolState> {
    const { A7A5: { A7A5: a7a5, WA7A5: wa7a5 }, MULTICALL3: mc } = this.addr;
    const p = getProvider(this.chainId);

    const calls: Call[] = [
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('totalLiquidity') }, // 0
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('totalSupply') },    // 1
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('basisPointsRate') }, // 2
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('paused') },         // 3
    ];

    const a7a5PerWa7a5Idx = wa7a5 ? calls.length : -1;
    const wa7a5PerA7a5Idx = wa7a5 ? calls.length + 1 : -1;
    if (wa7a5) {
      calls.push({ target: wa7a5, allowFailure: true, callData: WA7A5_IFACE.encodeFunctionData('A7A5PerToken') });
      calls.push({ target: wa7a5, allowFailure: true, callData: WA7A5_IFACE.encodeFunctionData('tokensPerA7A5') });
    }

    const results = await multicall(p, mc, calls);
    const dec = makeDecoder(results);
    return {
      totalLiquidity: (dec(A7A5_IFACE, 'totalLiquidity', 0) ?? 0n).toString(),
      totalShares: (dec(A7A5_IFACE, 'totalSupply', 1) ?? 0n).toString(),
      basisPointsRate: (dec(A7A5_IFACE, 'basisPointsRate', 2) ?? 0n).toString(),
      paused: Boolean(dec(A7A5_IFACE, 'paused', 3)),
      ...(wa7a5 && a7a5PerWa7a5Idx !== -1 && {
        a7a5PerWa7a5: (dec(WA7A5_IFACE, 'A7A5PerToken', a7a5PerWa7a5Idx) ?? 0n).toString(),
        wa7a5PerA7a5: (dec(WA7A5_IFACE, 'tokensPerA7A5', wa7a5PerA7a5Idx) ?? 0n).toString(),
      }),
    };
  }

  async fetchAddressQuery(target: string): Promise<AddressQueryResult> {
    const { A7A5: { A7A5: a7a5 }, MULTICALL3: mc } = this.addr;
    const p = getProvider(this.chainId);

    const results = await multicall(p, mc, [
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('balanceOf', [target]) },    // 0
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('sharesOf', [target]) },     // 1
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('isBlackListed', [target]) }, // 2
    ]);

    const dec = makeDecoder(results);
    return {
      balance: (dec(A7A5_IFACE, 'balanceOf', 0) ?? 0n).toString(),
      shares: (dec(A7A5_IFACE, 'sharesOf', 1) ?? 0n).toString(),
      blacklisted: Boolean(dec(A7A5_IFACE, 'isBlackListed', 2)),
    };
  }

  async fetchRoles(): Promise<RolesResponse> {
    const { A7A5: { A7A5: a7a5 }, MULTICALL3: mc } = this.addr;
    const p = getProvider(this.chainId);

    const results = await multicall(p, mc, [
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('owner') },      // 0
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('compliance') }, // 1
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('accountant') }, // 2
    ]);

    const dec = makeDecoder(results);
    const zero = '0x0000000000000000000000000000000000000000';
    return {
      owner: (dec(A7A5_IFACE, 'owner', 0) as string | null) ?? zero,
      compliance: (dec(A7A5_IFACE, 'compliance', 1) as string | null) ?? zero,
      accountant: (dec(A7A5_IFACE, 'accountant', 2) as string | null) ?? zero,
    };
  }

  async fetchAllowance(owner: string, spender: string): Promise<string> {
    const { A7A5: { A7A5: a7a5 }, MULTICALL3: mc } = this.addr;
    const p = getProvider(this.chainId);

    const results = await multicall(p, mc, [
      { target: a7a5, allowFailure: true, callData: A7A5_IFACE.encodeFunctionData('allowance', [owner, spender]) },
    ]);
    const dec = makeDecoder(results);
    return (dec(A7A5_IFACE, 'allowance', 0) ?? 0n).toString();
  }
}
