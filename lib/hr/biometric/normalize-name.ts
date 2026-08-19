/**
 * Name normalisation for the one-time biometric mapping bootstrap.
 * Created: 2026-08-06.
 *
 * Used ONLY to PROPOSE a staff match for a human to confirm. Never used to
 * match at import time — measured against the real July export, plain
 * normalisation matched 26 of 48 and honorific-stripping got it to 36 of 48.
 * 75% is fine for a suggestion someone reviews; it is not fine for silently
 * attributing a month of attendance.
 *
 * The honorific is the whole difference: MyJKKN stores "Mr. RADHA KRISHNAN T",
 * the machine stores "Radhakrishnan T".
 */
const HONORIFIC = /^\s*(mr|mrs|ms|dr|miss|prof|shri|smt)\.?\s+/i;

export function normPersonName(raw: string | null | undefined): string {
  if (!raw) return '';
  let v = String(raw).trim();
  // Strip repeated honorifics ("Dr. Mr. X" appears in imported data).
  for (let i = 0; i < 3 && HONORIFIC.test(v); i++) v = v.replace(HONORIFIC, '');
  return v.replace(/[^A-Za-z]/g, '').toUpperCase();
}
