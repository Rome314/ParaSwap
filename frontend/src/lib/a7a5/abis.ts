import { Interface } from 'ethers';
import {
  A7A5_ABI,
  A7A5_EVENTS_ABI,
  ERC20_ABI,
  WA7A5_ABI,
} from '@para-swap/contracts';

export { A7A5_EVENTS_ABI, ERC20_ABI, WA7A5_ABI };

export const MULTICALL3_IFACE = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
]);

export const A7A5_IFACE = new Interface(A7A5_ABI as unknown as string[]);
export const ERC20_IFACE = new Interface(ERC20_ABI as unknown as string[]);
export const WA7A5_IFACE = new Interface(WA7A5_ABI as unknown as string[]);
