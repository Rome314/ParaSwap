/**
 * JSON ABI arrays for all contracts in blockchain/contracts/.
 * Also includes A7A5 + WA7A5 token ABIs (external contracts referenced by the protocol).
 *
 * Mainnet token addresses (from blockchain/common/addresses.ts):
 */
export const MAINNET_A7A5 = '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9';
export const MAINNET_WA7A5 = '0xF442fF10b8deF89514560A66C0AD28777094636a';
export const MAINNET_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
export const MAINNET_V2_PAIR_USDT_A7A5 = '0x14D7AAB5b4bca6a02E52aC22520B033bF35F4091';
export const MAINNET_V3_POOL_USDT_WA7A5 = '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9';
export const MAINNET_CHAINLINK_USDT_ETH = '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46';
export const MAINNET_ENTRYPOINT_V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';

// ─── Type helpers ─────────────────────────────────────────────────────────────

export interface AbiParam {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiParam[];
}

export interface AbiFunction {
  type: 'function';
  name: string;
  inputs: AbiParam[];
  outputs?: AbiParam[];
  stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
}

export type Abi = AbiFunction[];

// ─── A7A5 token (external ERC-20 with FOT and admin) ─────────────────────────

export const A7A5_ABI: Abi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLiquidity', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'basisPointsRate', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'isBlackListed', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  // Write functions
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
];

// ─── WA7A5 token (ERC-20 wrapper with wrap/unwrap) ───────────────────────────

export const WA7A5_ABI: Abi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'A7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'A7A5PerToken', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tokensPerA7A5', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getwA7A5ByA7A5', inputs: [{ name: 'a7a5Amount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getA7A5BywA7A5', inputs: [{ name: 'wA7A5Amount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  // Write functions
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'wrap', inputs: [{ name: 'a7a5Amount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unwrap', inputs: [{ name: 'wA7A5Amount', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
];

// ─── ParaSwap ─────────────────────────────────────────────────────────────────

export const PARASWAP_ABI: Abi = [
  { type: 'function', name: 'A7A5_TOKEN', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'WA7A5_TOKEN', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT_TOKEN', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'FACADE', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'QUOTER', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'V3_ROUTER', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  // Write functions
  {
    type: 'function', name: 'swap',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'fee', type: 'uint24' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'quote',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
];

// ─── PoolsFacade ──────────────────────────────────────────────────────────────

export const POOLS_FACADE_ABI: Abi = [
  { type: 'function', name: 'A7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'WA7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'deployer', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'v2Pair', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'v3Router', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'v3Quoter', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'wa7a5UsdtV3Fee', inputs: [], outputs: [{ name: '', type: 'uint24' }], stateMutability: 'view' },
  { type: 'function', name: 'v2A7A5IsToken0', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  {
    type: 'function', name: 'allowanceA7A5',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowanceUSDT',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowanceWA7A5',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'getA7A5EffectiveOutput',
    inputs: [{ name: 'amountIn', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'quoteA7A5PerUSDT',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write / nonpayable (use eth_call for quotes):
  {
    type: 'function', name: 'quoteWA7A5PerUSDT',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'getBestQuoteA7A5PerUSDT',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' }],
    outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'strategy', type: 'uint8' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'swapA7A5',
    inputs: [
      { name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' },
      { name: 'amountOutMin', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'swapWA7A5',
    inputs: [
      { name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' },
      { name: 'amountOutMin', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'swapA7A5AtBestQuote',
    inputs: [
      { name: 'amountIn', type: 'uint256' }, { name: 'side', type: 'uint8' },
      { name: 'amountOutMin', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
];

// ─── A7A5NativeOracle ─────────────────────────────────────────────────────────

export const A7A5_NATIVE_ORACLE_ABI: Abi = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'A7A5_USDT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT_ETH', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'NUMERATOR', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_MAX_STALENESS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxStaleness', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'tokenPrice',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'tokenPriceData',
    inputs: [],
    outputs: [{ name: 'price', type: 'uint256' }, { name: 'validUntil', type: 'uint48' }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'setMaxStaleness', inputs: [{ name: 'newMaxStaleness', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

// ─── A7A5UsdtTwapOracle ───────────────────────────────────────────────────────

export const A7A5_USDT_TWAP_ORACLE_ABI: Abi = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'POOL', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'WA7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_TWAP_WINDOW', inputs: [], outputs: [{ name: '', type: 'uint32' }], stateMutability: 'view' },
  { type: 'function', name: 'twapWindow', inputs: [], outputs: [{ name: '', type: 'uint32' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'pure' },
  { type: 'function', name: 'description', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'pure' },
  { type: 'function', name: 'latestAnswer', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' }, { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  { type: 'function', name: 'setTwapWindow', inputs: [{ name: 'newWindow', type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

// ─── A7A5UsdtV2Oracle ─────────────────────────────────────────────────────────

export const A7A5_USDT_V2_ORACLE_ABI: Abi = [
  { type: 'function', name: 'A7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'PAIR', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'pure' },
  { type: 'function', name: 'description', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'pure' },
  { type: 'function', name: 'latestAnswer', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' }, { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
];

// ─── UsdtNativeOracle ─────────────────────────────────────────────────────────

export const USDT_NATIVE_ORACLE_ABI: Abi = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT_ETH', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'NUMERATOR', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_MAX_STALENESS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'maxStaleness', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'tokenPrice',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'tokenPriceData',
    inputs: [],
    outputs: [{ name: 'price', type: 'uint256' }, { name: 'validUntil', type: 'uint48' }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'setMaxStaleness', inputs: [{ name: 'newMaxStaleness', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

// ─── A7A5Paymaster ────────────────────────────────────────────────────────────

export const A7A5_PAYMASTER_ABI: Abi = [
  { type: 'function', name: 'entryPoint', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'gasToken', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'oracle', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'A7A5', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setOracle', inputs: [{ name: 'newOracle', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'withdrawAddress', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addStake', inputs: [{ name: 'unstakeDelaySec', type: 'uint32' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'unlockStake', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawStake', inputs: [{ name: 'withdrawAddress', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawTokens', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

// ─── UsdtPaymaster ────────────────────────────────────────────────────────────

export const USDT_PAYMASTER_ABI: Abi = [
  { type: 'function', name: 'entryPoint', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pendingOwner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'gasToken', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'oracle', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'USDT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setOracle', inputs: [{ name: 'newOracle', type: 'address' }, ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'withdrawAddress', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addStake', inputs: [{ name: 'unstakeDelaySec', type: 'uint32' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'unlockStake', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawStake', inputs: [{ name: 'withdrawAddress', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawTokens', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

// ─── A7A5AccountFactory ───────────────────────────────────────────────────────

export const A7A5_ACCOUNT_FACTORY_ABI: Abi = [
  { type: 'function', name: 'getImplementation', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  {
    type: 'function', name: 'predictAddress',
    inputs: [{ name: 'callData', type: 'bytes' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'cloneAndInitialize',
    inputs: [{ name: 'callData', type: 'bytes' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
  },
];

// ─── A7A5WebAuthnAccount ──────────────────────────────────────────────────────

export const A7A5_WEBAUTHN_ACCOUNT_ABI: Abi = [
  { type: 'function', name: 'entryPoint', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  {
    type: 'function', name: 'getNonce',
    inputs: [{ name: 'key', type: 'uint192' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'signer',
    inputs: [],
    outputs: [{ name: 'qx', type: 'bytes32' }, { name: 'qy', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'initializeWebAuthn',
    inputs: [{ name: 'qx', type: 'bytes32' }, { name: 'qy', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'execute',
    inputs: [{ name: 'mode', type: 'bytes32' }, { name: 'executionData', type: 'bytes' }],
    outputs: [],
    stateMutability: 'payable',
  },
];

// ─── SimpleA7A5Account ────────────────────────────────────────────────────────

export const SIMPLE_A7A5_ACCOUNT_ABI: Abi = [
  { type: 'function', name: 'ENTRY_POINT', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  {
    type: 'function', name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'nonpayable',
  },
];
