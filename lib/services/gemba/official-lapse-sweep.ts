// =====================================================================
// Gemba — the official-lapse sweep, in one place
// =====================================================================
// The sweep itself lives entirely in the database
// (fn_gemba_official_lapse_notify, migration 20260802030000). This module is
// the single TypeScript entry point to it, so that every caller runs the same
// code rather than its own copy of the same RPC call.
//
// Two callers today:
//   1. app/api/cron/improvement-rank-ideas — the scheduled one. The improvement
//      board's own daily 04:43 job folds this sweep into its daily pass. There
//      is no cron entry of its own: vercel.json already holds exactly 100
//      entries, which is Vercel's hard cap, so a 101st would fail the whole
//      deploy instead of scheduling anything.
//   2. app/api/cron/gemba-official-lapse — the standalone route, kept for a
//      manual run (`?secret=`) and for the day a cron slot frees up.
//
// Idempotent twice over, inside the function: a (artifact, exact lapse) ledger
// row AND notifications.idempotency_key's unique index. Running it twice in one
// night announces nothing new — which matters, because public.notifications
// already holds ~230,000 rows and a re-announcing sweep would bury the bell.
//
// Created: 2026-08-01.

import type { createServiceRoleClient } from '@/lib/supabase/server';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

/** The database function clamps to 1..200 itself; this is the per-run default. */
export const OFFICIAL_LAPSE_DEFAULT_LIMIT = 50;

/** One announced lapse, as fn_gemba_official_lapse_notify returns it. */
export interface AnnouncedLapse {
  artifact_id: string;
  area_id: string;
  area_label: string | null;
  artifact_type: string;
  lapsed_at: string;
  recipients: number;
  notification_id: string | null;
}

/** What a caller reports after a sweep. */
export interface OfficialLapseSweepResult {
  limit: number;
  /** How many artifacts were announced as no longer official. */
  announced: number;
  /** How many people were told, summed across those announcements. */
  notified: number;
  lapses: Array<{
    area: string | null;
    artifact_type: string;
    lapsed_at: string;
    recipients: number;
  }>;
}

/**
 * Run the official-lapse sweep once.
 *
 * THROWS on a database error rather than returning a partial result: each
 * caller decides what a failure means for it. The standalone route answers 500;
 * the improvement-board job catches it so a lapse failure can never take the
 * idea ranking down with it.
 */
export async function runOfficialLapseSweep(
  admin: ServiceRoleClient,
  limit: number = OFFICIAL_LAPSE_DEFAULT_LIMIT
): Promise<OfficialLapseSweepResult> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : OFFICIAL_LAPSE_DEFAULT_LIMIT;

  const { data, error } = await admin.rpc('fn_gemba_official_lapse_notify', {
    p_limit: safeLimit,
  });

  if (error) throw new Error(error.message);

  const announced = (data ?? []) as AnnouncedLapse[];

  return {
    limit: safeLimit,
    announced: announced.length,
    notified: announced.reduce((sum, row) => sum + (row.recipients ?? 0), 0),
    lapses: announced.map((row) => ({
      area: row.area_label,
      artifact_type: row.artifact_type,
      lapsed_at: row.lapsed_at,
      recipients: row.recipients,
    })),
  };
}
