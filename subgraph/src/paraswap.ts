import {Swapped} from '../generated/ParaSwap/ParaSwap';
import {ParaSwapSwap} from '../generated/schema';

export function handleSwapped(event: Swapped): void {
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  const swap = new ParaSwapSwap(id);
  swap.tokenIn = event.params.tokenIn;
  swap.tokenOut = event.params.tokenOut;
  swap.amountIn = event.params.amountIn;
  swap.amountOut = event.params.amountOut;
  swap.recipient = event.params.recipient;
  swap.blockNumber = event.block.number;
  swap.blockTimestamp = event.block.timestamp;
  swap.transactionHash = event.transaction.hash;
  swap.save();
}
