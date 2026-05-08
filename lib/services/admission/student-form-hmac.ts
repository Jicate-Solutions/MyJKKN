// lib/services/admission/student-form-hmac.ts
//
// Token signing: HMAC-SHA256 over a JSON payload {tid, exp, iat}.
// The signed value is what goes in the URL — the student's QR encodes
// `<base64url payload>.<base64url signature>`.
// The DB stores SHA-256 hash of the FULL signed value, peppered with a
// server secret. Lookup is by hash; HMAC validates authenticity.
//
// Note: this module deliberately does NOT `import 'server-only'`. The
// guard would break the standalone tsx verifier at scripts/verify-student-
// form-hmac.ts which imports this directly outside the Next.js bundle.
// The boundary is enforced one level up in `student-form-service.ts`,
// which is the only application call site and DOES `import 'server-only'`.
// node:crypto would also break a client bundle independently.

import crypto from 'node:crypto';

interface TokenPayload {
  tid: string;   // token UUID (matches learner_self_fill_tokens.id)
  exp: number;   // unix seconds — must be > now
  iat: number;   // unix seconds — issued-at
}

const HMAC_ALG = 'sha256';
const HASH_ALG = 'sha256';

function getSecret(): string {
  const s = process.env.STUDENT_FORM_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error('STUDENT_FORM_HMAC_SECRET missing or too short (need >=32 chars)');
  }
  return s;
}

function getPepper(): string {
  const p = process.env.STUDENT_FORM_PEPPER;
  if (!p || p.length < 32) {
    throw new Error('STUDENT_FORM_PEPPER missing or too short (need >=32 chars)');
  }
  return p;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function b64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Sign a payload. Returns the URL-safe token string.
 */
export function signToken(payload: TokenPayload): string {
  const json = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(json, 'utf8'));
  const sig = crypto.createHmac(HMAC_ALG, getSecret()).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify HMAC and return the payload. Throws on tamper / malformed / expired.
 */
export function verifyToken(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('malformed_token');
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto
    .createHmac(HMAC_ALG, getSecret())
    .update(payloadB64)
    .digest();
  const givenSig = b64urlDecode(sigB64);

  if (
    expectedSig.length !== givenSig.length ||
    !crypto.timingSafeEqual(expectedSig, givenSig)
  ) {
    throw new Error('bad_signature');
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('bad_payload');
  }
  if (typeof payload.tid !== 'string' || typeof payload.exp !== 'number') {
    throw new Error('bad_payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= payload.exp) throw new Error('expired');

  return payload;
}

/**
 * Hash a raw token (the full signed string) with the server pepper.
 * The DB stores this hash; lookup is by hash.
 */
export function hashRawToken(rawToken: string): string {
  const pepper = getPepper();
  return crypto.createHash(HASH_ALG).update(rawToken + pepper).digest('hex');
}
