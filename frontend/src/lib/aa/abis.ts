export const ENTRYPOINT_EXTENDED_ABI = [
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function getUserOpHash((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes) userOp) view returns (bytes32)',
  'function handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[] ops, address beneficiary)',
  'function balanceOf(address account) view returns (uint256)',
  'function depositTo(address account) payable',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
  'event Deposited(address indexed account, uint256 totalDeposit)',
] as const;

export const PAYMASTER_ABI = [
  'function getDeposit() view returns (uint256)',
  'function entryPointBalance() view returns (uint256)',
  'function paused() view returns (bool)',
  'function oracle() view returns (address)',
  'function token() view returns (address)',
  'event OracleUpdated(address indexed oldOracle, address indexed newOracle)',
  'event TokenPayment(address indexed account, uint256 amount)',
] as const;

export const A7A5_NATIVE_ORACLE_ABI = [
  'function tokenPrice() view returns (uint256 price, uint48 validUntil)',
  'function tokenPriceData() view returns (uint256 price, uint48 validUntil)',
  'function maxStaleness() view returns (uint256)',
  'function A7A5_USDT() view returns (address)',
  'function USDT_ETH() view returns (address)',
  'event MaxStalenessUpdated(uint256 oldMaxStaleness, uint256 newMaxStaleness)',
] as const;

export const USDT_NATIVE_ORACLE_ABI = [
  'function tokenPrice() view returns (uint256 price, uint48 validUntil)',
  'function tokenPriceData() view returns (uint256 price, uint48 validUntil)',
  'function maxStaleness() view returns (uint256)',
  'function USDT_ETH() view returns (address)',
  'event UsdtMaxStalenessUpdated(uint256 oldMaxStaleness, uint256 newMaxStaleness)',
] as const;

export const TWAP_ORACLE_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function twapWindow() view returns (uint32)',
  'function POOL() view returns (address)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
] as const;

export const CHAINLINK_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
] as const;

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
] as const;

export const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
] as const;

export const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
  'function quote(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) returns (uint256 amountOut)',
] as const;

// SIDE: 0 = BUY (USDT in), 1 = SELL (A7A5/wA7A5 in). Quote functions are non-view
// (V3 quoter writes) — call them via eth_call / staticCall.
export const POOLS_FACADE_ABI = [
  'function swapA7A5(uint256 amountIn, uint8 side, uint256 amountOutMin, uint256 deadline) returns (uint256 amountOut)',
  'function swapWA7A5(uint256 amountIn, uint8 side, uint256 amountOutMin, uint256 deadline) returns (uint256 amountOut)',
  'function swapA7A5AtBestQuote(uint256 amountIn, uint8 side, uint256 amountOutMin, uint256 deadline) returns (uint256 amountOut)',
  'function getBestQuoteA7A5PerUSDT(uint256 amountIn, uint8 side) returns (uint256 amountOut, uint8 strategy)',
  'function quoteA7A5PerUSDT(uint256 amountIn, uint8 side) view returns (uint256 amountOut)',
  'function quoteWA7A5PerUSDT(uint256 amountIn, uint8 side) returns (uint256 amountOut)',
  'function getA7A5EffectiveOutput(uint256 amountIn) view returns (uint256)',
  'function allowanceUSDT(address owner) view returns (uint256)',
  'function allowanceA7A5(address owner) view returns (uint256)',
  'function allowanceWA7A5(address owner) view returns (uint256)',
] as const;
