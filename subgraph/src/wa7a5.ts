import {Address, BigInt, Bytes} from '@graphprotocol/graph-ts';
import {Transfer} from '../generated/WA7A5/WA7A5';
import {Token, Transfer as TransferEntity} from '../generated/schema';

const TOKEN_ID = 'wa7a5';
const ZERO = Address.fromString('0x0000000000000000000000000000000000000000');

function token(): Token {
  let t = Token.load(TOKEN_ID);
  if (t == null) {
    t = new Token(TOKEN_ID);
    t.symbol = 'wA7A5';
    t.address = Address.fromString('0xF442fF10b8deF89514560A66C0AD28777094636a');
    t.save();
  }
  return t as Token;
}

export function handleWA7A5Transfer(event: Transfer): void {
  token();
  const id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  const e = new TransferEntity(id);
  e.token = TOKEN_ID;
  e.from = event.params.from;
  e.to = event.params.to;
  e.value = event.params.value;
  e.isWrap = event.params.from.equals(ZERO);
  e.isUnwrap = event.params.to.equals(ZERO);
  e.blockNumber = event.block.number;
  e.blockTimestamp = event.block.timestamp;
  e.transactionHash = event.transaction.hash;
  e.save();
}
