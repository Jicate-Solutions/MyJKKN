/**
 * Shared handling for the "Once per learner" duplicate guard.
 *
 * `trg_billing_bills_once_per_learner` rejects a second live bill for a learner
 * when its billing category has `once_per_learner = true`, raising the custom
 * SQLSTATE below. Enforcement lives in the database because bills are written
 * from ten different paths (four in TypeScript, six SECURITY DEFINER RPCs, plus
 * the feesync cron) — but that means every UI-facing caller receives a raw
 * Postgres error object and has to translate it back into something a billing
 * clerk can act on.
 *
 * Supabase errors are plain objects, not Error instances, so the code lives on
 * `error.code`. See CLAUDE.md — `err instanceof Error` always falls through here.
 */

/** SQLSTATE raised by the once-per-learner trigger. */
export const ONCE_PER_LEARNER_SQLSTATE = 'BL001';

/** True when a Supabase error is the once-per-learner rejection. */
export function isOncePerLearnerViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: string }).code === ONCE_PER_LEARNER_SQLSTATE
  );
}

/**
 * A message safe to show a billing user.
 *
 * The trigger's own message already names the category and the conflicting
 * bill id. The id is useful in an error report the user can act on, but noisy
 * in a toast, so `withBillId: false` strips the parenthetical.
 */
export function oncePerLearnerMessage(
  error: unknown,
  options: { withBillId?: boolean } = {}
): string {
  const raw =
    (error as { message?: string } | null)?.message ??
    'This learner already has a bill in this billing category.';
  if (options.withBillId === false) {
    return raw.replace(/\s*\(bill [0-9a-f-]{36}\)/i, '');
  }
  return raw;
}

/**
 * Translates a Supabase error into a user-facing message when it is the
 * duplicate guard, and returns null otherwise so callers keep their existing
 * error handling for everything else.
 */
export function describeOncePerLearnerError(
  error: unknown,
  options: { withBillId?: boolean } = {}
): string | null {
  return isOncePerLearnerViolation(error)
    ? oncePerLearnerMessage(error, options)
    : null;
}
