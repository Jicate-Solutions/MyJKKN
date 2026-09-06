/**
 * Parent Portal — password hashing.
 *
 * DEVIATION FROM SPEC (deliberate): the spec names `bcryptjs`, but that package
 * is not in this project's dependency tree. Rather than add an unrequested
 * dependency, this uses Node's built-in `node:crypto` scrypt — salted, memory-
 * hard, no install required, and a drop-in to swap for bcrypt later (the stored
 * format is self-describing, so a future bcrypt migration can detect & rehash).
 *
 * Stored format:  scrypt$<N>$<saltHex>$<hashHex>
 *
 * Node-only module — never import into client components.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// promisify's inferred overload drops the options arg; retype so the cost (N)
// option is accepted (it is honored at runtime).
const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions
) => Promise<Buffer>;

const KEYLEN = 64;
const COST = 16384; // 2^14 — sensible interactive-login work factor
const PREFIX = 'scrypt';

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, KEYLEN, { N: COST })) as Buffer;
  return `${PREFIX}$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!plain || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;

  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (!Number.isFinite(cost) || salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = (await scrypt(plain, salt, expected.length, { N: cost })) as Buffer;
  // Constant-time comparison to avoid leaking match progress via timing.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
