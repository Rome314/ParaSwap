# Frontend integration

Passkey + AA utilities live under `frontend/src/lib/aa/`.

## Environment

Copy root `.env.example` → `frontend/.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `VITE_ENTRYPOINT_V08` | EntryPoint address |
| `VITE_ACCOUNT_FACTORY` | `A7A5AccountFactory` |
| `VITE_A7A5_PAYMASTER` | A7A5 gas paymaster |
| `VITE_USDT_PAYMASTER` | USDT gas paymaster |
| `VITE_POOLS_FACADE` | Swap target for sponsored ops |
| `VITE_BUNDLER_URL` | JSON-RPC bundler endpoint |
| `VITE_PASSKEY_QX` / `VITE_PASSKEY_QY` | Optional; usually set in localStorage after registration |

## Modules

- `config.ts` — env wiring, `selectPaymaster` equivalent
- `passkey.ts` — `@simplewebauthn/browser` register + sign
- `userOp.ts` — initCode, ERC-7821 execute, packed UserOp builder
- `bundler.ts` — `eth_sendUserOperation` / gas estimation

## Hooks

- `usePasskeyAccount` — create passkey, predict address, sign userOp hashes
- `useSponsoredSwap` — build + sign + submit swap UserOp with A7A5 or USDT paymaster

## UI

Wallet tab **Passkey** renders `PasskeyWallet.tsx` (create passkey, show counterfactual address, display last UserOp hash).

## Typical swap sequence

1. User registers passkey → `(qx, qy)` stored.
2. Fund smart account with A7A5/USDT and approve paymaster + PoolsFacade (via first UserOp batch or pre-fund script).
3. Build `callData = execute(ERC7821_BATCH, [PoolsFacade.swap…])`.
4. If account not deployed, set `initCode = buildInitCode(factory, initializeWebAuthn(qx,qy))`.
5. Attach WebAuthn signature over `entryPoint.getUserOpHash(op)`.
6. POST to bundler; wait for inclusion.

## Dependencies

```bash
cd frontend
npm install @simplewebauthn/browser
```
