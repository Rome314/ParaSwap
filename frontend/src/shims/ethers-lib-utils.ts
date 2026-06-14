// Shim for @uniswap packages that import from ethers v5's `ethers/lib/utils` subpath.
// Provides the same named exports via ethers v6.
import { AbiCoder, isAddress } from 'ethers';

export { isAddress };
export const defaultAbiCoder = AbiCoder.defaultAbiCoder();
