/**
 * TypeScript mirror of the SQL function public.fn_norm_biometric_code(text).
 * Created: 2026-08-06.
 *
 * The two MUST agree: the SQL version backs the unique index on staff, and this
 * one does the matching at import time. If they diverge, a code that saved fine
 * would silently fail to match on import. scripts/biometric-parser.test.ts pins
 * the shared cases.
 *
 * Rule: an all-digit code compares numerically, so 00002 / 002 / 2 are one code
 * (the same export mixes zero-padded and bare forms). Anything else is trimmed
 * and uppercased. The 18-digit cap mirrors the SQL bigint guard.
 */
export function normBiometricCode(code: string | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const trimmed = code.trim();
  if (trimmed === '') return null;
  if (/^[0-9]{1,18}$/.test(trimmed)) return BigInt(trimmed).toString();
  return trimmed.toUpperCase();
}
