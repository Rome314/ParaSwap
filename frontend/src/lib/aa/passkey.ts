import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { AbiCoder, hexlify } from 'ethers';

export interface PasskeyCoords {
  qx: string;
  qy: string;
}

const RP_NAME = 'A7A5 Swap';
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_HALF_N = P256_N / 2n;

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return `0x${Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Uint8Array.from(atob(padded + pad), (c) => c.charCodeAt(0));
}

function normalizeLowS(s: bigint): bigint {
  return s > P256_HALF_N ? P256_N - s : s;
}

/** Parse DER-encoded ECDSA signature (WebAuthn) into r and s. */
function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error('Invalid DER signature');
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error('Invalid DER r tag');
  const rLen = der[offset + 1];
  const r = BigInt(bytesToHex(der.slice(offset + 2, offset + 2 + rLen)));
  offset += 2 + rLen;
  if (der[offset] !== 0x02) throw new Error('Invalid DER s tag');
  const sLen = der[offset + 1];
  const s = BigInt(bytesToHex(der.slice(offset + 2, offset + 2 + sLen)));
  return { r, s };
}

/** Extract uncompressed P-256 public key (qx, qy) from COSE / SPKI bytes. */
export function parseP256PublicKeyFromSpki(spki: ArrayBufferLike): PasskeyCoords {
  const u8 = new Uint8Array(spki);
  const start = u8.length - 65;
  if (start < 0 || u8[start] !== 0x04) {
    throw new Error('Unsupported passkey public key format');
  }
  const x = u8.slice(start + 1, start + 33);
  const y = u8.slice(start + 33, start + 65);
  return { qx: bytesToHex(x), qy: bytesToHex(y) };
}

export async function registerPasskey(userId: string): Promise<{
  credentialId: string;
  coords: PasskeyCoords;
}> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const options: PublicKeyCredentialCreationOptionsJSON = {
    challenge: bytesToHex(challenge).slice(2),
    rp: { name: RP_NAME, id: window.location.hostname },
    user: {
      id: bytesToHex(new TextEncoder().encode(userId)).slice(2),
      name: userId,
      displayName: userId,
    },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
  };

  const reg = await startRegistration({ optionsJSON: options });
  const credId = reg.id;
  const raw = reg.response.publicKey;
  if (!raw) throw new Error('Passkey registration did not return a public key');
  const spki = base64UrlToBytes(raw);
  const coords = parseP256PublicKeyFromSpki(spki.buffer);
  localStorage.setItem('aa_passkey_credential_id', credId);
  localStorage.setItem('aa_passkey_qx', coords.qx);
  localStorage.setItem('aa_passkey_qy', coords.qy);
  return { credentialId: credId, coords };
}

/**
 * Sign a userOpHash with the stored passkey and return an OZ WebAuthnAuth ABI blob.
 */
export async function signWithPasskey(userOpHash: string): Promise<string> {
  const credentialId = localStorage.getItem('aa_passkey_credential_id');
  if (!credentialId) throw new Error('No passkey registered');

  const hashBytes = userOpHash.startsWith('0x') ? userOpHash.slice(2) : userOpHash;
  const options: PublicKeyCredentialRequestOptionsJSON = {
    challenge: hashBytes,
    timeout: 60_000,
    rpId: window.location.hostname,
    userVerification: 'required',
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
  };

  const auth = await startAuthentication({ optionsJSON: options });
  const clientDataJSON = new TextDecoder().decode(base64UrlToBytes(auth.response.clientDataJSON));
  const authenticatorData = base64UrlToBytes(auth.response.authenticatorData);
  const derSig = base64UrlToBytes(auth.response.signature);

  const { r, s } = parseDerSignature(derSig);
  const sNorm = normalizeLowS(s);
  const typeIndex = clientDataJSON.indexOf('"type"');
  const challengeIndex = clientDataJSON.indexOf('"challenge"');
  if (typeIndex < 0 || challengeIndex < 0) {
    throw new Error('Unexpected WebAuthn clientDataJSON');
  }

  const r32 = `0x${r.toString(16).padStart(64, '0')}`;
  const s32 = `0x${sNorm.toString(16).padStart(64, '0')}`;

  return AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'uint256', 'uint256', 'bytes', 'string'],
    [r32, s32, challengeIndex, typeIndex, hexlify(authenticatorData), clientDataJSON],
  );
}

export function loadStoredPasskeyCoords(): PasskeyCoords | null {
  const qx = localStorage.getItem('aa_passkey_qx') ?? import.meta.env.VITE_PASSKEY_QX;
  const qy = localStorage.getItem('aa_passkey_qy') ?? import.meta.env.VITE_PASSKEY_QY;
  if (!qx || !qy) return null;
  return { qx, qy };
}
