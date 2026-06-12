import {Address, BigInt, Bytes} from '@graphprotocol/graph-ts';
import {
  BasisPointsRateUpdated,
  Blacklisted,
  Burn,
  DeBlacklisted,
  DestroyedBlackFunds,
  Issue,
  Paused,
  TotalLiquidityUpdated,
  Transfer,
  Unpaused,
} from '../generated/A7A5/A7A5';
import {A7A5Event, Token} from '../generated/schema';

const TOKEN_ID = 'a7a5';

function token(): Token {
  let t = Token.load(TOKEN_ID);
  if (t == null) {
    t = new Token(TOKEN_ID);
    t.symbol = 'A7A5';
    t.address = Address.fromString('0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9');
    t.paused = false;
    t.basisPointsRate = BigInt.zero();
    t.save();
  }
  return t as Token;
}

function saveEvent(
  id: string,
  eventType: string,
  user: Bytes | null,
  amount: BigInt | null,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  txHash: Bytes
): void {
  const e = new A7A5Event(id);
  e.token = TOKEN_ID;
  e.eventType = eventType;
  e.user = user;
  e.amount = amount;
  e.blockNumber = blockNumber;
  e.blockTimestamp = blockTimestamp;
  e.transactionHash = txHash;
  e.save();
}

export function handleIssue(event: Issue): void {
  token();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'Issue',
    event.params.user,
    event.params.amount,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleBurn(event: Burn): void {
  token();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'Burn',
    event.params.user,
    event.params.amount,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleBlacklisted(event: Blacklisted): void {
  token();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'Blacklisted',
    event.params.token,
    null,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleDeBlacklisted(event: DeBlacklisted): void {
  token();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'DeBlacklisted',
    event.params.token,
    null,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleDestroyedBlackFunds(event: DestroyedBlackFunds): void {
  token();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'DestroyedBlackFunds',
    event.params.user,
    event.params.amount,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleTotalLiquidityUpdated(event: TotalLiquidityUpdated): void {
  const t = token();
  t.totalLiquidity = event.params.newTotalLiquidity;
  t.save();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'TotalLiquidityUpdated',
    null,
    event.params.newTotalLiquidity,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handlePaused(event: Paused): void {
  const t = token();
  t.paused = true;
  t.save();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'Paused',
    null,
    null,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleUnpaused(event: Unpaused): void {
  const t = token();
  t.paused = false;
  t.save();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'Unpaused',
    null,
    null,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleBasisPointsRateUpdated(event: BasisPointsRateUpdated): void {
  const t = token();
  t.basisPointsRate = event.params.newBasisPointsRate;
  t.save();
  saveEvent(
    event.transaction.hash.toHexString() + '-' + event.logIndex.toString(),
    'BasisPointsRateUpdated',
    null,
    event.params.newBasisPointsRate,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
}

export function handleA7A5Transfer(event: Transfer): void {
  token();
  // Transfer indexing for A7A5 is optional in v0 — protocol events are primary.
}
