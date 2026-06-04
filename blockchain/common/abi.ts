export const ERC20_TRANSFER_ABI = ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'];

// ── minimal ABIs ──────────────────────────────────────────────────────────────
export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
export const WA7A5_ABI = [
  ...ERC20_ABI,
  'function wrap(uint256) returns (uint256)',
  'function getwA7A5ByA7A5(uint256) view returns (uint256)',
  'function getA7A5BywA7A5(uint256) view returns (uint256)',
];
export const A7A5_FEES_ABI = ['function basisPointsRate() view returns (uint256)', 'function FEE_PRECISION() view returns (uint256)'];
export const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

export const V4_QUOTER_ABI = [
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns (uint256 amountOut, uint256 gasEstimate)',
];
