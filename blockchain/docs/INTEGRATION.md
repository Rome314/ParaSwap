# Integration Guide

Practical TypeScript/ethers.js snippets for the three most common integration flows.

All examples use `ethers` v6 and assume you have `provider` and `signer` available. Mainnet A7A5, wA7A5, and USDT all use **6 decimals**; still read `decimals()` instead of hard-coding units in reusable clients.

---

## 1. Quote before swap

`ParaSwap.quote()` is not a view function — it calls the V3 quoter internally, which simulates the swap. Always call it via `eth_call` / `callStatic`.

```typescript
import { ethers } from "ethers";
import ParaSwapABI from "./abis/ParaSwap.json";

const paraswap = new ethers.Contract(PARASWAP_ADDRESS, ParaSwapABI, provider);

const tokenIn  = USDT_ADDRESS;
const tokenOut = A7A5_ADDRESS;
const amountIn = ethers.parseUnits("100", 6); // 100 USDT (6 decimals)
const fee      = 3000; // 0.3 % V3 fee tier (ignored for facade-only routes)

// callStatic so no transaction is sent
const amountOut: bigint = await paraswap.quote.staticCall(
    tokenIn, tokenOut, amountIn, fee
);

console.log("Expected A7A5 out:", ethers.formatUnits(amountOut, 6));
```

For A7A5↔USDT routes the facade's `getBestQuoteA7A5PerUSDT` can also be used directly to see which strategy wins:

```typescript
import PoolsFacadeABI from "./abis/PoolsFacade.json";

const facade = new ethers.Contract(FACADE_ADDRESS, PoolsFacadeABI, provider);

const [amountOut, strategy] = await facade.getBestQuoteA7A5PerUSDT.staticCall(
    amountIn, 1 /* SIDE.SELL */
);

console.log("Best out:", amountOut, "Strategy:", strategy === 0n ? "DIRECT" : "MIXED");
```

The facade also has a generic dispatcher. Every generic swap call must include a minimum output:

```typescript
const quoted = await facade.getBestQuoteA7A5PerUSDT.staticCall(
    amountIn,
    0, // SIDE.BUY
);
const minOut = quoted[0] * 9950n / 10000n;

await facade.connect(signer).swap(
    USDT_ADDRESS,
    A7A5_ADDRESS,
    amountIn,
    minOut,
    Math.floor(Date.now() / 1000) + 300,
);
```

The custom-recipient overload is `swap(tokenIn, tokenOut, amountIn, amountOutMin, deadline, recipient)`. With ethers v6, use the full signature if overload inference is ambiguous.

---

## 2. Swap via ParaSwap

### Pre-approve

The caller must approve `ParaSwap` for at least `amountIn` of `tokenIn` before calling `swap()`. A7A5 is fee-on-transfer; the contract measures balance-deltas, so approve the full gross amount (not the post-tax amount).

```typescript
import ERC20ABI from "./abis/ERC20.json";

const usdt = new ethers.Contract(USDT_ADDRESS, ERC20ABI, signer);
await usdt.approve(PARASWAP_ADDRESS, amountIn);
```

USDT on Ethereum requires zeroing the allowance before setting another non-zero value. A frontend must send `approve(spender, 0)` and wait before the new approval when changing a non-zero allowance. `SafeERC20.forceApprove` is available to Solidity callers, not directly to browser code.

### Execute

```typescript
const paraswap = new ethers.Contract(PARASWAP_ADDRESS, ParaSwapABI, signer);

const deadline    = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
const slippage    = 50n; // 0.5 % in bps
const minOut      = amountOut * (10000n - slippage) / 10000n;

const tx = await paraswap.swap(
    tokenIn,
    tokenOut,
    amountIn,
    minOut,
    fee,
    deadline
);

const receipt = await tx.wait();
console.log("Swapped in block", receipt.blockNumber);
```

### Handling FOT on received A7A5

When `tokenOut` is A7A5, the `amountOut` returned by `swap()` is already the post-tax amount received by the caller — the contract accounts for the fee internally. You do **not** need to subtract the tax yourself.

When using `amountOut` from a prior `quote()` call to set `amountOutMin`, apply slippage against the quoted post-tax amount, not the gross amount.

FOT hop counts differ by route:

- Direct facade A7A5/USDT execution has one taxed A7A5 transfer.
- Facade MIXED execution has two taxed A7A5 transfers.
- Selling A7A5 through ParaSwap adds the trader-to-ParaSwap transfer before facade execution.
- Route 11 A7A5→wA7A5 taxes trader→ParaSwap and ParaSwap→wrapper; wA7A5→A7A5 taxes wrapper→ParaSwap and ParaSwap→recipient. `ParaSwap.quote()` models these same two transfers.

Do not manually subtract another fee from the returned/quoted output. Do not reuse a quote after the on-chain `basisPointsRate` changes.

### Multi-hop MEV guidance

For routes bridged through USDT, intermediate swaps use a zero local minimum. `amountOutMin` protects the recipient's final balance delta and the entire transaction reverts atomically if that final minimum is missed. It does **not** independently constrain the intermediate USDT fill.

Use a fresh quote from the same RPC context, a short deadline (typically 1–5 minutes rather than 20), an explicit user-approved final slippage bound, and private transaction submission for valuable trades. A loose final minimum can still permit an adverse intermediate execution.

### Listening for the swap event

```typescript
const filter = paraswap.filters.Swapped(tokenIn, tokenOut);

paraswap.on(filter, (tokenIn, tokenOut, amountIn, amountOut, recipient) => {
    console.log(`Swapped: ${amountIn} ${tokenIn} → ${amountOut} ${tokenOut}`);
});
```

The facade emits recipient-aware events:

```typescript
facade.on(
    facade.filters.A7A5Swapped(user, recipient),
    (user, recipient, side, strategy, amountIn, amountOut) => {
        // amountOut is the recipient's measured output
    },
);
```

---

## 3. Deploy a WebAuthn account via the factory

### Compute the counterfactual address

The account address is deterministic: same credentials → same address, regardless of approvals.

```typescript
import A7A5AccountFactoryABI from "./abis/A7A5AccountFactory.json";
import A7A5WebAuthnAccountABI from "./abis/A7A5WebAuthnAccount.json";

const factory = new ethers.Contract(FACTORY_ADDRESS, A7A5AccountFactoryABI, signer);

// WebAuthn P-256 public key coordinates (bytes32 each)
const qx = "0xabc..."; // 32-byte hex
const qy = "0xdef...";

const iface = new ethers.Interface(A7A5WebAuthnAccountABI);
const callData = iface.encodeFunctionData("initializeWebAuthn", [qx, qy]);

const predictedAddress: string = await factory.predictAddress(callData);
console.log("Account will be at:", predictedAddress);
```

### Deploy with creation-time approvals

Creation-time approvals let the user pre-authorize trusted spenders (e.g. ParaSwap) in the same deployment transaction. Spenders must be in the factory whitelist (`isAllowedSpender`).

```typescript
const isAllowed = await factory.isAllowedSpender(PARASWAP_ADDRESS);
if (!isAllowed) throw new Error("ParaSwap is not a whitelisted spender");

const approvals = [
    { token: USDT_ADDRESS,  spender: PARASWAP_ADDRESS, amount: ethers.MaxUint256 },
    { token: A7A5_ADDRESS,  spender: PARASWAP_ADDRESS, amount: ethers.MaxUint256 },
];

const tx = await factory.cloneAndInitializeWithApprovals(callData, approvals);
const receipt = await tx.wait();

console.log("Account deployed at:", predictedAddress);
```

If the account is already deployed (e.g. the user previously deployed it on Sepolia and is now on mainnet), `cloneAndInitializeWithApprovals` returns the existing address without re-deploying or re-approving.

An existing account does not receive the supplied creation-time approvals again. Manage later approvals through the account's authorized execution path.

### Deploy without approvals

```typescript
const tx = await factory.cloneAndInitialize(callData);
await tx.wait();
```

### Checking EIP-7702 delegate address

For EOAs that want to delegate to the EIP-7702 account:

```typescript
const delegateAddress = await factory.getEip7702Implementation();
// Sign an authorization for 0xef0100 || delegateAddress with the EOA's key
```

---

## 4. Deploy an ECDSA/UUPS account

The separate `A7A5AccountFactoryV2` deploys an ERC-1967 proxy owned by an ECDSA address. Its counterfactual address is derived from the owner, not WebAuthn calldata.

```typescript
import A7A5AccountFactoryV2ABI from "./abis/A7A5AccountFactoryV2.json";

const factoryV2 = new ethers.Contract(
    ECDSA_FACTORY_ADDRESS,
    A7A5AccountFactoryV2ABI,
    signer,
);

const owner = await signer.getAddress();
const predicted = await factoryV2.predictAddress(owner);
await (await factoryV2.deployAccountWithApprovals(owner, approvals)).wait();
```

The spender whitelist is immutable at factory deployment. The account owner controls later approvals and UUPS upgrades. Do not confuse this factory with `A7A5AccountFactory`, which deploys non-upgradeable WebAuthn clones and publishes the EIP-7702 delegate.
