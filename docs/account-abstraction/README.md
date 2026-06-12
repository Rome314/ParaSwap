# A7A5 Account Abstraction

Smart-account stack for gasless (token-paid) swaps using ERC-4337 EntryPoint v0.8, WebAuthn passkeys, and ERC-20 paymasters (A7A5 or USDT).

## Components

| Layer | Contracts / modules |
|-------|---------------------|
| Account | `A7A5WebAuthnAccount` (OZ Account + WebAuthn), `A7A5AccountFactory` (CREATE2 clones) |
| Paymasters | `A7A5Paymaster`, `UsdtPaymaster` — both implement `ITokenPaymaster` |
| Oracles | `A7A5NativeOracle`, `UsdtNativeOracle` (Chainlink USDT/ETH + staleness guards) |
| Swap | Existing `PoolsFacade` / `ParaSwap` — invoked via ERC-7821 `execute` batch |

Legacy EOA path: `SimpleA7A5Account` remains for tests and migration.

## Docs

- [How it works](./how-it-works.md)
- [Local fork setup](./local-fork-setup.md)
- [Mainnet deployment](./mainnet-deployment.md)
- [Frontend integration](./frontend-integration.md)
- [Test flows](./test-flows.md)

## Quick commands

```bash
cd blockchain
npm run build
npm test                                    # unit tests (no fork)
MAINNET_FORK=1 ALCHEMY_API_KEY=… npm run test:fork:aa
npm run fork:demo                           # deploy + demo swap on fork
```
