import { Interface } from 'ethers';


export const ERC20_ABI = [
  'function transfer(address to, uint256 value) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const;

export const WA7A5_ABI = [
  ...ERC20_ABI,
  'function wrap(uint256 amount) returns (uint256)',
  'function unwrap(uint256 shares) returns (uint256)',
  'function getA7A5BywA7A5(uint256 wA7A5Amount) view returns (uint256)',
  'function getwA7A5ByA7A5(uint256 amount) view returns (uint256)',
  'function A7A5PerToken() view returns (uint256)',
  'function tokensPerA7A5() view returns (uint256)',
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
] as const;

// ---------- ABIs ----------

const A7A5_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function sharesOf(address) view returns (uint256)',
  'function basisPointsRate() view returns (uint256)',
  'function paused() view returns (bool)',
  'function isBlackListed(address) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function totalLiquidity() view returns (uint256)',
  'function owner() view returns (address)',
  'function compliance() view returns (address)',
  'function accountant() view returns (address)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

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
];


export const MULTICALL3_IFACE = new Interface([
    'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
  ]);
  
  export const A7A5_IFACE = new Interface(A7A5_ABI);
  export const ERC20_IFACE = new Interface(ERC20_ABI);
  export const WA7A5_IFACE = new Interface(WA7A5_ABI as unknown as string[]);
  