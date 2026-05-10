// lib/services/integrations/jicate-booking-reconcile-service.ts
//
// OPEN-4 — Nightly reconciliation of jicate_booking_mirror.host_user_id
//
// Problem: the F4 webhook receiver (app/api/webhooks/jicate-booking/route.ts)
// sets host_user_id at ingest time via a case-insensitive ilike match against
// profiles.email. When a webhook arrives BEFORE the host's profiles row exists
// (e.g. the staff member was added to MyJKKN the same day they received their
// first booking), host_user_id is written as NULL. Those rows stay invisible
// to the host's UI until they are backfilled.
//
// This service implements the backfill. It is designed to be called from the
// nightly cron at /api/cron/jicate-booking-reconcile (scheduled 02:17 UTC).
//
// Pattern: mirrors the resolveHostUserId private method in
// lib/services/integrations/jicate-booking-mirror-service.ts (F4 service),
// using the same createAdminClient + ilike + .maybeSingle() shape.
//
// Cap / unprocessable-row behaviour:
//   The batchSize cap (default 200) is applied BEFORE any per-row work.
//   There is no ahead-of-time filter to identify "unprocessable" rows
//   (rows whose host_email will never match a profile) — if a host email
//   is a typo or a non-MyJKKN address, we will attempt a lookup every run
//   until the profiles row appears or the booking is manually corrected.
//   This is intentional: false-negatives (silently skipping a valid email
//   because we guessed it was unresolvable) are worse than wasted lookups.
//   The returned `still_unresolved` counter lets operators detect patterns
//   via log monitoring.

import { createAdminClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ReconcileResult {
  /** Total mirror rows examined in this batch (= rows selected). */
  examined: number;
  /** Rows where a matching profile was found and host_user_id was updated. */
  resolved: number;
  /**
   * Rows where no profile matched the host_email. These remain NULL and will
   * be retried on subsequent runs. High values here indicate either missing
   * staff profiles or email mismatches.
   */
  still_unresolved: number;
  /** Wall-clock time for the entire batch, in milliseconds. */
  elapsed_ms: number;
}

export interface ReconcileBatchOptions {
  /**
   * Maximum number of NULL-host_user_id rows to process per invocation.
   * Defaults to 200. Keep small enough that the cron stays well within
   * Vercel's 30-second serverless function timeout.
   */
  batchSize?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class JicateBookingReconcileService {
  /**
   * Select up to `batchSize` mirror rows where host_user_id IS NULL, attempt
   * a case-insensitive profile lookup for each row's host_email, and UPDATE
   * the row when a match is found.
   *
   * Ordering by created_at ASC means the oldest unresolved rows are worked
   * first — this minimises the window between a staff member being added to
   * MyJKKN and their bookings becoming visible.
   *
   * Uses createAdminClient (service-role) so that RLS on jicate_booking_mirror
   * and profiles does not block cross-user updates. This function MUST NOT be
   * called from any user-facing path — it is cron-only.
   */
  static async reconcileBatch(
    opts: ReconcileBatchOptions = {},
  ): Promise<ReconcileResult> {
    const start = Date.now();
    const batchSize = opts.batchSize ?? 200;
    const supabase = createAdminClient();

    let examined = 0;
    let resolved = 0;
    let still_unresolved = 0;

    // ------------------------------------------------------------------
    // Step 1: Fetch up to batchSize rows with NULL host_user_id.
    // ------------------------------------------------------------------
    const { data: rows, error: fetchError } = await supabase
      .from('jicate_booking_mirror')
      .select('id, host_email')
      .is('host_user_id', null)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(
        `[jicate-booking/reconcile] Failed to fetch unresolved rows: ${fetchError.message}`,
      );
    }

    if (!rows || rows.length === 0) {
      console.info(
        '[jicate-booking/reconcile] No rows with NULL host_user_id found — nothing to reconcile.',
      );
      return { examined: 0, resolved: 0, still_unresolved: 0, elapsed_ms: Date.now() - start };
    }

    examined = rows.length;
    console.info(
      `[jicate-booking/reconcile] Examining ${examined} row(s) with NULL host_user_id (batchSize=${batchSize}).`,
    );

    // ------------------------------------------------------------------
    // Step 2: For each row, attempt to resolve the host profile.
    // ------------------------------------------------------------------
    for (const row of rows) {
      const hostEmail: string = row.host_email;

      // Case-insensitive match — mirrors resolveHostUserId in F4 service.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', hostEmail)
        .limit(1)
        .maybeSingle();

      if (profileError) {
        // Log and count as still_unresolved — do NOT throw; a single bad
        // lookup must not abort the rest of the batch.
        console.warn(
          `[jicate-booking/reconcile] Profile lookup error for host_email=${hostEmail} row_id=${row.id}: ${profileError.message}`,
        );
        still_unresolved++;
        continue;
      }

      if (!profile) {
        console.info(
          `[jicate-booking/reconcile] No profile found for host_email=${hostEmail} row_id=${row.id} — still unresolved.`,
        );
        still_unresolved++;
        continue;
      }

      // Profile found — update the mirror row.
      const { error: updateError } = await supabase
        .from('jicate_booking_mirror')
        .update({ host_user_id: profile.id })
        .eq('id', row.id);

      if (updateError) {
        console.error(
          `[jicate-booking/reconcile] Failed to update host_user_id for row_id=${row.id}: ${updateError.message}`,
        );
        still_unresolved++;
        continue;
      }

      console.info(
        `[jicate-booking/reconcile] Resolved: row_id=${row.id} host_email=${hostEmail} → profile_id=${profile.id}`,
      );
      resolved++;
    }

    const elapsed_ms = Date.now() - start;
    console.info(
      `[jicate-booking/reconcile] Batch complete — examined=${examined} resolved=${resolved} still_unresolved=${still_unresolved} elapsed_ms=${elapsed_ms}`,
    );

    return { examined, resolved, still_unresolved, elapsed_ms };
  }
}
