# Frontend

Follow the root `AGENTS.md`. This package owns the browser application.

- Keep feature UI in `src/components/{wallet,swap,overview,utilities}/`; shared presentation
  belongs in `src/components/ui/`. Use existing features before creating new top-level folders.
- Hooks in `src/hooks/` coordinate React state and external data. Put chain adapters and
  transaction encoding in `src/lib/`; avoid copying those details into UI components.
- `src/lib/a7a5/` contains separate EVM and Tron adapters; `src/lib/aa/` contains passkey,
  UserOperation, and bundler code. Keep those network boundaries explicit.
- Chain configuration and addresses belong in `src/config/`. Keep EN/RU UI copy aligned
  in `src/i18n/`. Inspect both the selected UI network and the signing wallet network.
- Token math uses raw integer units until formatting. Arbitrary ERC-20 output tokens
  cannot be assumed to have six decimals. A quote is an estimate, not a receipt balance.
- Verify endpoint/proxy configuration and API response shapes when changing routing.
  A Vite development proxy does not establish that a production endpoint exists.
- For transaction changes, check recipient, chain, calldata, approvals, slippage, expiry,
  and errors. Cover account/network changes and stale asynchronous results where relevant.
- Do not hand-edit `dist/`, dependencies, or TypeScript build caches. Use package-local
  scripts after preflight; the existing build/test baseline is tracked in the project review.
- Wallet prompts, passkeys, TronLink, bundlers, and real swaps need separate acceptance
  evidence. Do not infer them from a successful TypeScript or Vite build.
