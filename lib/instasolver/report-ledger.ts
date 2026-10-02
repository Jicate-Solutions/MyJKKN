// lib/instasolver/report-ledger.ts
// ============================================================================
// The InstaSolver abuse ceilings, counted from `instasolver_report_ledger`.
//
// SAME LEDGER, SAME NUMBERS as app/api/instasolver/broken/route.ts: 10 reports
// per reporter in any rolling 24 hours, and at most 20 phone pages per college
// in any rolling 24 hours for "this is dangerous" reports. Both doors write to
// the one ledger, so a person cannot get 10 reports through each door.
//
// Why a small copy here instead of an import: the broken route keeps this
// logic inline and is owned by an open draft (#4132), so it could not be
// edited to export it. When that draft lands, the broken route can import
// these functions and the two copies become one.
//
// Why the ledger and not project_tasks or audit_logs: see the long note on
// DAILY_REPORT_LIMIT in the broken route. In short, both of those tables are
// writable by the person being limited; this one (20261213110000) has RLS on
// and no policy for `authenticated`, so only the service role can count it.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const LEDGER_TABLE = 'instasolver_report_ledger';
export const DAILY_REPORT_LIMIT = 10;
export const INSTITUTION_PAGE_LIMIT_PER_DAY = 20;
export const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface LedgerCount {
  count: number;
  /** True when the count could not be taken — callers file the report anyway but never page. */
  failed: boolean;
}

function sinceIso(now: number): string {
  return new Date(now - RATE_WINDOW_MS).toISOString();
}

/** Reports this person filed through either InstaSolver door in the last 24 hours. */
export async function countReporterReports(
  admin: SupabaseClient,
  reporterId: string,
  now: number = Date.now()
): Promise<LedgerCount> {
  const { count, error } = await admin
    .from(LEDGER_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', reporterId)
    .gte('created_at', sinceIso(now));
  if (error) {
    console.error('[instasolver] ledger count failed:', error.message);
    return { count: 0, failed: true };
  }
  return { count: count ?? 0, failed: false };
}

/** Phone pages this college has already sent in the last 24 hours. */
export async function countInstitutionPages(
  admin: SupabaseClient,
  institutionId: string | null,
  now: number = Date.now()
): Promise<LedgerCount> {
  const base = admin.from(LEDGER_TABLE).select('id', { count: 'exact', head: true });
  // `.eq(col, null)` never matches a NULL; a reporter with no college is
  // counted against the other no-college rows.
  const scoped = institutionId
    ? base.eq('institution_id', institutionId)
    : base.is('institution_id', null);
  const { count, error } = await scoped.eq('paged', true).gte('created_at', sinceIso(now));
  if (error) {
    console.error('[instasolver] page-cap count failed:', error.message);
    return { count: 0, failed: true };
  }
  return { count: count ?? 0, failed: false };
}

/** One row per filing. Returns false when the write failed (the caller then does not page). */
export async function recordLedgerRow(
  admin: SupabaseClient,
  row: { reporterId: string; institutionId: string | null; paged: boolean }
): Promise<boolean> {
  const { error } = await admin.from(LEDGER_TABLE).insert({
    reporter_id: row.reporterId,
    institution_id: row.institutionId,
    paged: row.paged
  });
  if (error) {
    console.error('[instasolver] ledger insert failed:', error.message);
    return false;
  }
  return true;
}
