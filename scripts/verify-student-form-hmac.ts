// scripts/verify-student-form-hmac.ts
// Run via: npx tsx scripts/verify-student-form-hmac.ts

// Set fake env so the script runs without the real .env.local.
process.env.STUDENT_FORM_HMAC_SECRET = 'a'.repeat(48);
process.env.STUDENT_FORM_PEPPER = 'b'.repeat(48);

import {
  signToken,
  verifyToken,
  hashRawToken,
} from '../lib/services/admission/student-form-hmac';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('OK:  ', msg); }
};
const expectThrow = (fn: () => void, msg: string, contains?: string) => {
  try { fn(); console.error('FAIL:', msg, '(did not throw)'); failures++; }
  catch (e: any) {
    if (contains && !String(e.message).includes(contains)) {
      console.error('FAIL:', msg, '— wrong message:', e.message); failures++;
    } else { console.log('OK:  ', msg); }
  }
};

// 1. Sign + verify roundtrip
const now = Math.floor(Date.now() / 1000);
const payload = { tid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', iat: now, exp: now + 1800 };
const token = signToken(payload);
const verified = verifyToken(token);
assert(verified.tid === payload.tid, 'roundtrip preserves tid');
assert(verified.exp === payload.exp, 'roundtrip preserves exp');

// 2. Tampered signature fails
expectThrow(() => verifyToken(token + 'X'), 'tampered signature throws', 'bad_signature');

// 3. Tampered payload fails
const [payloadB64, sigB64] = token.split('.');
const tamperedPayload = Buffer.from('{"tid":"forged","exp":99999999999}').toString('base64url');
expectThrow(
  () => verifyToken(`${tamperedPayload}.${sigB64}`),
  'tampered payload throws',
  'bad_signature',
);

// 4. Expired token fails
const expiredToken = signToken({ tid: payload.tid, iat: now - 3600, exp: now - 1800 });
expectThrow(() => verifyToken(expiredToken), 'expired token throws', 'expired');

// 5. Malformed (no dot) fails
expectThrow(() => verifyToken('not-a-token'), 'malformed token throws', 'malformed_token');

// 6. Hash is deterministic + 64 hex chars
const h1 = hashRawToken(token);
const h2 = hashRawToken(token);
assert(h1 === h2, 'hash deterministic');
assert(h1.length === 64 && /^[0-9a-f]+$/.test(h1), 'hash is 64-char hex');

// 7. Different tokens hash differently
const otherToken = signToken({ tid: 'different-uuid', iat: now, exp: now + 1800 });
assert(hashRawToken(otherToken) !== h1, 'different tokens hash differently');

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll HMAC checks passed.');
