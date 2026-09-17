/**
 * Adoption loop — record "this person did the core action of feature X today".
 *
 * Spec: specs/2026-09-16-adoption-loop.md (ruling 3, build step 2).
 *
 * One call at the core action of a labelled feature. The database function
 * fn_feature_used upserts one row per person × feature × IST day and is a
 * silent no-op for keys that are not in feature_registry, so wiring a route
 * can never break the route: this helper never throws and never blocks on a
 * failure — usage is a measurement, not a transaction.
 *
 *   await recordFeatureUse(supabase, FEATURE_KEYS.BUG_REPORT_SUBMIT);
 *
 * Use the caller's own Supabase client (session-scoped): the function keys
 * the row on auth.uid(). A service-role client has no auth.uid() and records
 * nothing.
 */

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Feature keys wired so far. The registry row (fn_adoption_register) is what
 *  makes a key count; an unregistered key records nothing. */
export const FEATURE_KEYS = {
  /** The one app-wide line: a sign-in (ruling 1c). Seeded by migration. */
  APP_LOGIN: 'app.login',
  /** Someone reported a bug through the in-app reporter. */
  BUG_REPORT_SUBMIT: 'bug_reports.submit',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS] | (string & {});

/**
 * Record the use and wait for the answer (one small RPC, ~10 ms). Returns
 * true when a row was written or bumped, false when the key is unregistered,
 * the feature is retired, there is no signed-in person, or anything failed.
 */
export async function recordFeatureUse(client: RpcClient, featureKey: FeatureKey): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('fn_feature_used', { p_feature_key: featureKey });
    if (error) {
      console.warn('[usage/record] fn_feature_used failed (non-blocking):', featureKey, error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[usage/record] fn_feature_used threw (non-blocking):', featureKey, err);
    return false;
  }
}

/**
 * Fire-and-forget variant for paths that must not wait (sign-in redirect).
 * Registers the promise with the platform via `waitUntil` so a serverless
 * instance is not reclaimed mid-write — the same idiom the auth callback
 * already uses for Cal.com provisioning. Off Vercel the import throws and
 * the write simply runs unregistered.
 */
export async function scheduleFeatureUse(client: RpcClient, featureKey: FeatureKey): Promise<void> {
  const work = recordFeatureUse(client, featureKey).then(() => undefined);
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(work);
  } catch {
    void work;
  }
}
