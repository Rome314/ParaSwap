import erc20Min from './erc20.min.json' with { type: 'json' };
import A7A5Json from './A7A5.json' with { type: 'json' };
import WA7A5Json from './WA7A5.json' with { type: 'json' };
import ParaSwapJson from './ParaSwap.json' with { type: 'json' };
import PoolsFacadeJson from './PoolsFacade.json' with { type: 'json' };
import A7A5NativeOracleJson from './A7A5NativeOracle.json' with { type: 'json' };
import A7A5UsdtTwapOracleJson from './A7A5UsdtTwapOracle.json' with { type: 'json' };
import A7A5PaymasterJson from './A7A5Paymaster.json' with { type: 'json' };
import SimpleA7A5AccountJson from './SimpleA7A5Account.json' with { type: 'json' };

/** JSON ABI fragments — populated by `npm run build:contracts`. */
export type JsonAbi = ReadonlyArray<Record<string, unknown>>;

export const ERC20_ABI = erc20Min as JsonAbi;
export const A7A5_ABI = A7A5Json as JsonAbi;
export const WA7A5_ABI = WA7A5Json as JsonAbi;
export const PARASWAP_ABI = ParaSwapJson as JsonAbi;
export const POOLS_FACADE_ABI = PoolsFacadeJson as JsonAbi;
export const A7A5_NATIVE_ORACLE_ABI = A7A5NativeOracleJson as JsonAbi;
export const A7A5_USDT_TWAP_ORACLE_ABI = A7A5UsdtTwapOracleJson as JsonAbi;
export const A7A5_PAYMASTER_ABI = A7A5PaymasterJson as JsonAbi;
export const SIMPLE_A7A5_ACCOUNT_ABI = SimpleA7A5AccountJson as JsonAbi;

/** A7A5 protocol events for log indexing (subset used by frontend event feed). */
export const A7A5_EVENTS_ABI = [
  'event Issue(address indexed user, uint256 amount)',
  'event Burn(address indexed user, uint256 amount)',
  'event Blacklisted(address indexed token)',
  'event DeBlacklisted(address indexed token)',
  'event DestroyedBlackFunds(address indexed user, uint256 amount)',
  'event TotalLiquidityUpdated(uint256 oldTotalLiquidity, uint256 newTotalLiquidity)',
  'event Paused()',
  'event Unpaused()',
  'event BasisPointsRateUpdated(uint256 newBasisPointsRate)',
] as const;

export const abis = {
  ERC20: ERC20_ABI,
  A7A5: A7A5_ABI,
  WA7A5: WA7A5_ABI,
  ParaSwap: PARASWAP_ABI,
  PoolsFacade: POOLS_FACADE_ABI,
  A7A5NativeOracle: A7A5_NATIVE_ORACLE_ABI,
  A7A5UsdtTwapOracle: A7A5_USDT_TWAP_ORACLE_ABI,
  A7A5Paymaster: A7A5_PAYMASTER_ABI,
  SimpleA7A5Account: SIMPLE_A7A5_ACCOUNT_ABI,
} as const;
