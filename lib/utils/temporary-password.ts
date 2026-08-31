import { randomInt } from 'node:crypto';

/**
 * The one generator for temporary login passwords.
 *
 * SERVER ONLY — node:crypto. Every caller is an admin API route that provisions
 * an auth user, which is the only place this value is ever produced.
 *
 * WHY THIS EXISTS AS A SHARED MODULE
 * Four routes had grown four private copies of "make a temporary password", and
 * all four were wrong in overlapping ways. Consolidating them is the point: a
 * credential generator is exactly the kind of function that must not be
 * reimplemented per call site, because each copy drifts and none of the drift is
 * visible until someone audits it.
 *
 * WHAT WAS WRONG WITH THE COPIES
 *
 * 1. Math.random() throughout. That is V8's xorshift128+, a fast
 *    non-cryptographic PRNG whose internal state is recoverable from a short run
 *    of outputs. These passwords are minted in visible batches — a bulk profile
 *    backfill, a run of course approvals — so one issued password is a step
 *    toward predicting the next. This value is the whole of what protects an
 *    account until its owner changes it.
 *
 * 2. The character-class guarantee was a NO-OP in two of them. Both wrote
 *
 *        if (!/\d/.test(password)) password += <a digit>;
 *        ...
 *        return password.slice(0, length);
 *
 *    so the digit appended to satisfy the rule was immediately truncated off
 *    again by the slice. A password with no digit stayed a password with no
 *    digit; the code that looked like it enforced a policy enforced nothing.
 *
 * 3. Where the slice was absent, the append made the length variable (12, 13 or
 *    14) and pinned the added character to the final position — a structural
 *    hint about how the string was built.
 *
 * HOW THIS ONE WORKS
 * One character is drawn from each required class up front, so the policy holds
 * by construction rather than by retrofit, and the whole string is then
 * Fisher-Yates shuffled with the same CSPRNG so those four do not sit at fixed
 * positions.
 *
 * The symbol set deliberately excludes quotes, backslashes, spaces, commas and
 * brackets: these passwords are pasted into emails, WhatsApp messages and CSV
 * exports by whoever hands them over, and a character that needs escaping there
 * turns into a support call.
 */

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** randomInt is rejection-sampled by Node, so this is uniform — unlike
 *  `Math.floor(rand() * n)`, which is both predictable and very slightly
 *  biased. */
const pick = (set: string) => set.charAt(randomInt(0, set.length));

export function generateTemporaryPassword(length = 16): string {
  // Below 4 the class guarantee cannot hold, and a short temporary password is
  // not a trade-off worth offering a caller.
  const size = Math.max(12, Math.floor(length));

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
