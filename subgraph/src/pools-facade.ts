import {A7A5Swapped, WA7A5Swapped} from '../generated/PoolsFacade/PoolsFacade';
import {PoolsFacadeSwap} from '../generated/schema';

export function handleA7A5Swapped(event: A7A5Swapped): void {
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  const swap = new PoolsFacadeSwap(id);
  swap.path = 'A7A5';
  swap.user = event.params.user;
  swap.side = event.params.side;
  swap.strategy = event.params.strategy;
  swap.amountIn = event.params.amountIn;
  swap.amountOut = event.params.amountOut;
  swap.blockNumber = event.block.number;
  swap.blockTimestamp = event.block.timestamp;
  swap.transactionHash = event.transaction.hash;
  swap.save();
}

export function handleWA7A5Swapped(event: WA7A5Swapped): void {
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  const swap = new PoolsFacadeSwap(id);
  swap.path = 'WA7A5';
  swap.user = event.params.user;
  swap.side = event.params.side;
  swap.strategy = null;
  swap.amountIn = event.params.amountIn;
  swap.amountOut = event.params.amountOut;
  swap.blockNumber = event.block.number;
  swap.blockTimestamp = event.block.timestamp;
  swap.transactionHash = event.transaction.hash;
  swap.save();
}
