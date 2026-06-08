# Test flows

## Unit (no fork)

| File | Covers |
|------|--------|
| `test/A7A5AccountFactory/factory.test.ts` | predictAddress, cloneAndInitialize |
| `test/A7A5WebAuthnAccount/account.test.ts` | init, validateUserOp, WebAuthn sig via MockEntryPoint |
| `test/UsdtPaymaster/paymaster.test.ts` | constructor guards, oracle setter, pause |
| `test/Paymaster/paymaster.test.ts` | A7A5 paymaster unit + fork (existing) |

Run:

```bash
cd blockchain
npm test -- --grep "A7A5AccountFactory|A7A5WebAuthnAccount \\(unit\\)|UsdtPaymaster \\(unit"
```

## Fork

Requires `MAINNET_FORK=1` and `ALCHEMY_API_KEY`.

| File | Covers |
|------|--------|
| `test/A7A5WebAuthnAccount/account-fork.test.ts` | Counterfactual deploy via initCode |
| `test/Paymaster/paymaster.test.ts` | End-to-end A7A5 gas swap |
| `test/Integration/aa-swap.test.ts` | A7A5 + USDT paymaster swap paths |

```bash
npm run test:fork:aa
```

## Helpers

- `test/A7A5WebAuthnAccount/webauthn-helpers.ts` — fixed P-256 test key, assertion encoding (`@noble/curves`)
- `test/Integration/fixtures.ts` — `deployAAStackFixture`, ERC-7821 approvals via impersonated EntryPoint
- `blockchain/common/erc4337.ts` — shared `buildInitCode`, `buildWebAuthnSignedUserOp`, `selectPaymaster`

## CI recommendation

- Default CI: unit tests only (fast, no Alchemy).
- Nightly / manual: fork suite with secret `ALCHEMY_API_KEY`.
