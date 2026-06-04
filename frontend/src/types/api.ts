export type TokenBalance = {
  symbol: string;
  address: string;
  balance: string;
};

export type A7A5State = {
  basisPointsRate: string;
  paused: boolean;
  userBlacklisted: boolean;
  userShares: string;
};

export type BalancesResponse = {
  user: string;
  eth: string;
  tokens: TokenBalance[];
  a7a5State: A7A5State;
};

// Protocol-level state — no user address required
export type ProtocolState = {
  totalLiquidity: string; // raw bigint string; totalSupply() = _totalLiquidity
  totalShares: string; // raw bigint string; totalShares() = _totalSupply
  basisPointsRate: string;
  paused: boolean;
  a7a5PerWa7a5?: string; // raw bigint: A7A5 amount for 1e6 wA7A5 (A7A5PerToken)
  wa7a5PerA7a5?: string; // raw bigint: wA7A5 amount for 1e6 A7A5 (tokensPerA7A5)
};

// Result of querying an arbitrary address on-chain
export type AddressQueryResult = {
  balance: string; // raw bigint string
  shares: string; // raw bigint string
  blacklisted: boolean;
};

// On-chain role addresses (owner, compliance, accountant)
export type RolesResponse = {
  owner: string;
  compliance: string;
  accountant: string;
};

// A decoded non-transfer contract event
export type ContractEvent = {
  name: string;
  args: Record<string, string>;
  blockNumber: number;
  txHash: string;
  timestamp?: number;
};

export type TaggedEvent = ContractEvent & { chainId: number };
