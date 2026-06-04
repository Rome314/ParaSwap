# Permit2 — Approval Model

The prototype uses Uniswap's [Permit2](https://github.com/Uniswap/permit2) as the allowance layer between users and the Universal Router. The model is two-step:

1. **`token.approve(Permit2, MAX)`** — one-time per token. Pays gas. Required because A7A5 does not implement `ERC20Permit`.
2. **`Permit2.approve(token, UniversalRouter, MAX_UINT160, expiry)`** — one-time per spender. Sets the on-chain Permit2 allowance Universal Router consumes during each swap. Has an expiration; we default to 30 days.

Subsequent swaps consume the Permit2 allowance without any extra approval — the Universal Router pulls tokens from the user via `Permit2.transferFrom`.

## Why not direct `approve(UniversalRouter, MAX)`?

Universal Router doesn't accept direct token allowances. Every ERC20 path goes through Permit2; the router calls `Permit2.permitTransferFrom` or relies on the standing allowance set in step 2.

## wA7A5 alternative

wA7A5 implements `ERC20Permit`, so step 1 can be replaced by an EIP-2612 `permit` signature instead of a tx. We currently leave it as a plain `approve` to keep the UI uniform; revisit when adding signature-only flows.

## Notes for A7A5 specifically

- A7A5 is fee-on-transfer (currently 0 bps). Routing API selects a FoT-safe V2 path when `basisPointsRate > 0`. Verify via the Hardhat fork test (`contracts/test/v2-fot-swap.test.ts`).
- A7A5 has `pause` and `blacklist`. The `/balances` endpoint returns both flags so the UI can gate before the user even gets to the swap step.
- A7A5's `transferFrom` decrements allowance in liquidity units while moving shares — the Permit2 → Universal Router → V2/V3 router chain still works because it operates on liquidity units throughout. Confirmed by the wrap/unwrap and V2 FoT fork tests.

## Tightening for V1

- Replace standing Permit2 allowances with single-permit signatures (the Permit2 "Permit" object) for each swap, eliminating step 2 entirely.
- Add a "revoke approval" button calling `Permit2.approve(token, UniversalRouter, 0, 0)`.
