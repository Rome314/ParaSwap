/**
 * Build an abi-encoded WebAuthn assertion for OpenZeppelin SignerWebAuthn / WebAuthn.verify.
 * Used in fork tests where a real browser authenticator is unavailable.
 */
import {createHash} from 'node:crypto';
import {p256} from '@noble/curves/p256';
import {AbiCoder, getBytes, hexlify} from 'ethers';

/** Fixed P-256 test key (do not use in production). */
export const TEST_P256_PRIVATE_KEY = BigInt('0x1');

export function testP256PublicKey(): {qx: string; qy: string} {
  const pub = p256.getPublicKey(TEST_P256_PRIVATE_KEY, false);
  const qx = `0x${Buffer.from(pub.slice(1, 33)).toString('hex')}`;
  const qy = `0x${Buffer.from(pub.slice(33, 65)).toString('hex')}`;
  return {qx, qy};
}

/** secp256r1 curve order N (P-256). */
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_HALF_N = P256_N / 2n;

function normalizeLowS(s: bigint): bigint {
  return s > P256_HALF_N ? P256_N - s : s;
}

function base64Url(data: Uint8Array): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Minimal authenticatorData: zero rpIdHash + UP|UV flags + zero counter. */
function buildAuthenticatorData(): Uint8Array {
  const data = new Uint8Array(37);
  data[32] = 0x05; // UP | UV
  return data;
}

/**
 * Encode a WebAuthn assertion that validates `challenge` with the test P-256 key.
 * `challenge` is typically the 32-byte EntryPoint userOpHash.
 */
export function encodeWebAuthnAssertion(challenge: Uint8Array, privateKey = TEST_P256_PRIVATE_KEY): string {
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${base64Url(challenge)}","origin":"https://localhost"}`;
  const typeIndex = clientDataJSON.indexOf('"type"');
  const challengeIndex = clientDataJSON.indexOf('"challenge"');

  const authenticatorData = buildAuthenticatorData();
  const clientHash = createHash('sha256').update(clientDataJSON).digest();
  const message = createHash('sha256')
    .update(Buffer.concat([Buffer.from(authenticatorData), clientHash]))
    .digest();

  const sig = p256.sign(message, privateKey);
  const r = `0x${sig.r.toString(16).padStart(64, '0')}`;
  const sNorm = normalizeLowS(sig.s);
  const s = `0x${sNorm.toString(16).padStart(64, '0')}`;

  return AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes', 'string'],
    [r, s, challengeIndex, typeIndex, hexlify(authenticatorData), clientDataJSON],
  );
}

/** Sign a userOpHash and return the packed WebAuthn signature bytes. */
export function signUserOpHashWebAuthn(userOpHash: string, privateKey = TEST_P256_PRIVATE_KEY): string {
  return encodeWebAuthnAssertion(getBytes(userOpHash), privateKey);
}
