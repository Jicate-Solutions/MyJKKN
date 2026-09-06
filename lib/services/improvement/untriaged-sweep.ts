// =====================================================================
// Improvement Board — the untriaged-idea sweep, in one place
// =====================================================================
// The sweep itself lives entirely in the database
// (fn_improvement_untriaged_notify, migration 20260816050000). This module is
// the single TypeScript entry point to it, mirroring
// lib/services/gemba/official-lapse-sweep.ts so both board sweeps are called
// the same way rather than each caller writing its own RPC.
//
// One caller today: app/api/cron/improvement-rank-ideas, the improvement
// board's daily pass. There is no cron entry of its own for the same reason
// the lapse sweep has none — vercel.json already holds exactly 100 entries,
// which is Vercel's hard cap, and a 101st fails the whole deploy rather than
// scheduling anything.
//
// WHY THIS EXISTS AT ALL: on 2026-08-10 production held 21 improvement ideas
// from 18 authors and not one had ever moved out of 'logged'. The existing
// escalation sweep watches 'approved' ideas whose fix is unapplied — a state
// no idea on this project has reached. Nothing watched the queue where
// everything actually sits.
//
// Idempotent twice over, inside the function: an (idea_id) ledger row AND
// notifications.idempotency_key's unique index. Running it twice in one night
// announces nothing new.
//
// Created: 2026-08-10.

import type { createServiceRoleClient } from '@/lib/supabase/server';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

/** The database function clamps to 1..200 itself; this is the per-run default. */
export const UNTRIAGED_DEFAULT_LIMIT = 50;

/** One announced idea, as fn_improvement_untriaged_notify returns it. */
export interface AnnouncedUntriaged {
  idea_id: string;
  area_id: string;
  area_label: string | null;
  waited_days: number;
  recipients: number;
  notification_id: string | null;
}

/** What a caller reports after a sweep. */
export interface UntriagedSweepResult {
  limit: number;
  /** How many ideas were announced as untriaged. */
  announced: number;
  /** How many people were told, summed across those announcements. */
  notified: number;
  /** The longest any announced idea had been waiting, in days. 0 when none. */
  longestWaitDays: number;
  ideas: Array<{
    area: string | null;
    waited_days: number;
    recipients: number;
  }>;
}

/**
 * Run the untriaged-idea sweep once.
 *
 * THROWS on a database error rather than returning a partial result, matching
 * runOfficialLapseSweep: the caller decides what a failure means. The
 * improvement-board job catches it so a triage-notice failure can never take
 * the idea ranking down with it.
 */
export async function runUntriagedSweep(
  admin: ServiceRoleClient,
  limit: number = UNTRIAGED_DEFAULT_LIMIT
): Promise<UntriagedSweepResult> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : UNTRIAGED_DEFAULT_LIMIT;

  const { data, error } = await admin.rpc('fn_improvement_untriaged_notify', {
    p_limit: safeLimit,
  });

  if (error) throw new Error(error.message);

  const announced = (data ?? []) as AnnouncedUntriaged[];

  return {
    limit: safeLimit,
    announced: announced.length,
    notified: announced.reduce((sum, row) => sum + (row.recipients ?? 0), 0),
    longestWaitDays: announced.reduce((max, row) => Math.max(max, row.waited_days ?? 0), 0),
    ideas: announced.map((row) => ({
      area: row.area_label,
      waited_days: row.waited_days,
      recipients: row.recipients,
    })),
  };
}
