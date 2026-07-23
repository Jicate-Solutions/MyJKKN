// =====================================================================
// /api/cron/hr-policy-promote-detector — Wave 3 M10
// =====================================================================
// Weekly job (Mondays 02:00 UTC) that scans platform_policies for any
// policy_key whose institution-scope rows have all held the same value +
// classification for at least 180 days AND have received no edits in the
// hr_policy_audit_log during that window.
//
// When such a key is found, the cron inserts a row into
// hr_policy_promotion_suggestions with status='pending'. The /admin/hr/policies
// banner surfaces the count, and /admin/hr/policies/promotion-suggestions
// renders the Director-confirm UI.
//
// Director lock R3-Q2 (project_wave3_hr_policy_lock_2026_05_15):
//   "System-suggested + Director confirm". Auto-promote is deliberately NOT
//   silent — every promotion is acknowledged in writing by the Director and
//   recorded in hr_policy_audit_log under the 'promote_to_global' action.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> header (Vercel auto-sends)
//       OR ?secret=<value> query param for manual/test invocations. Pattern
//       mirrors counselor-shift-flip + callback-queue-expire.
//
// Idempotent: a duplicate pending suggestion for the same policy_key is
// blocked by a partial unique index, so re-running the cron multiple times
// in the same week is safe. Also pre-checks via SELECT before INSERT to keep
// the migration's unique-violation noise out of healthy runs.
//
// Companion substrate: supabase/migrations/20260616_hr_policy_promotion_suggestions.sql
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const JOB_NAME = 'hr-policy-promote-detector';
const IDENTICAL_THRESHOLD_DAYS = 180;

interface PolicyRow {
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  classification: string;
  updated_at: string | null;
}

interface DetectionResult {
  policy_key: string;
  identical_institution_count: number;
  identical_days: number;
  snapshot_value: unknown;
  snapshot_classification: string;
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const ranAt = new Date().toISOString();

  // ----------------------------------------------------------------
  // Auth — Bearer or ?secret= query (matches sibling crons).
  // ----------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createServiceRoleClient();

  try {
    // ------------------------------------------------------------
    // Step 1: Pull every institution-scoped platform_policies row.
    // We deliberately ignore role/user scopes — only institution
    // identicalness rolls up to a global promotion.
    // ------------------------------------------------------------
    const { data: rows, error: pullError } = await supabase
      .from('platform_policies')
      .select(
        'policy_key, scope_type, scope_id, value, classification, updated_at'
      )
      .eq('scope_type', 'institution')
      .eq('is_active', true);

    if (pullError) {
      console.error(`[cron:${JOB_NAME}] platform_policies pull error:`, pullError);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: pullError.message },
        { status: 500 }
      );
    }

    const allInstitutionRows = (rows ?? []) as PolicyRow[];

    // ------------------------------------------------------------
    // Step 2: Pull existing global rows so we skip keys that already
    // have a global default (no need to suggest promotion of a key
    // that's already global). Combined into one query for speed.
    // ------------------------------------------------------------
    const { data: globalRows, error: globalError } = await supabase
      .from('platform_policies')
      .select('policy_key')
      .eq('scope_type', 'global');

    if (globalError) {
      console.error(`[cron:${JOB_NAME}] global pull error:`, globalError);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: globalError.message },
        { status: 500 }
      );
    }

    const keysWithGlobal = new Set(
      (globalRows ?? []).map((r: { policy_key: string }) => r.policy_key)
    );

    // ------------------------------------------------------------
    // Step 3: Group institution rows by policy_key and check
    // identicalness + age. Only fires for keys with >=2 institutions
    // (a single-institution agreement is not yet evidence of global).
    // ------------------------------------------------------------
    const byKey = new Map<string, PolicyRow[]>();
    for (const r of allInstitutionRows) {
      // Skip keys that already have a global row — promotion is pointless.
      if (keysWithGlobal.has(r.policy_key)) continue;
      const bucket = byKey.get(r.policy_key) ?? [];
      bucket.push(r);
      byKey.set(r.policy_key, bucket);
    }

    const cutoffMs = Date.now() - IDENTICAL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const candidates: DetectionResult[] = [];

    for (const [policyKey, bucket] of byKey.entries()) {
      if (bucket.length < 2) continue;

      // Identicalness: every row's value + classification must match the first row.
      const firstValueJson = JSON.stringify(bucket[0].value);
      const firstClassification = bucket[0].classification;
      const allIdentical = bucket.every(
        (r) =>
          JSON.stringify(r.value) === firstValueJson &&
          r.classification === firstClassification
      );
      if (!allIdentical) continue;

      // Age: every row's updated_at must be older than the cutoff.
      // updated_at NULL on legacy rows is treated as ancient (older than cutoff).
      const allAged = bucket.every((r) => {
        if (!r.updated_at) return true;
        return new Date(r.updated_at).getTime() < cutoffMs;
      });
      if (!allAged) continue;

      // Edit-check: query hr_policy_audit_log for any edit on this policy_key
      // within the last IDENTICAL_THRESHOLD_DAYS. If found, skip — recent
      // human activity invalidates the "untouched for 6 months" signal.
      const sinceIso = new Date(cutoffMs).toISOString();
      const { count: recentEditCount, error: auditError } = await supabase
        .from('hr_policy_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('policy_key', policyKey)
        .gte('edited_at', sinceIso);

      if (auditError) {
        console.warn(
          `[cron:${JOB_NAME}] audit-log check failed for ${policyKey}, skipping:`,
          auditError.message
        );
        continue;
      }
      if ((recentEditCount ?? 0) > 0) continue;

      // Compute identical_days from the most-recently-touched institution row.
      // Floor so we never overstate the duration.
      let oldestEditMs = cutoffMs;
      for (const r of bucket) {
        if (r.updated_at) {
          const ts = new Date(r.updated_at).getTime();
          if (ts > oldestEditMs) oldestEditMs = ts;
        }
      }
      const identicalDays = Math.floor(
        (Date.now() - oldestEditMs) / (24 * 60 * 60 * 1000)
      );

      candidates.push({
        policy_key: policyKey,
        identical_institution_count: bucket.length,
        identical_days: identicalDays,
        snapshot_value: bucket[0].value,
        snapshot_classification: firstClassification,
      });
    }

    // ------------------------------------------------------------
    // Step 4: Insert pending suggestions, skipping any policy_key
    // that already has an open pending row. Partial unique index
    // is the final safety net, but we pre-check to keep logs clean.
    // ------------------------------------------------------------
    const { data: existingPending, error: pendingError } = await supabase
      .from('hr_policy_promotion_suggestions')
      .select('policy_key')
      .eq('status', 'pending');

    if (pendingError) {
      console.error(`[cron:${JOB_NAME}] pending pull error:`, pendingError);
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: pendingError.message },
        { status: 500 }
      );
    }

    const alreadyPending = new Set(
      (existingPending ?? []).map((r: { policy_key: string }) => r.policy_key)
    );

    const toInsert = candidates.filter((c) => !alreadyPending.has(c.policy_key));

    let inserted = 0;
    const insertErrors: Array<{ policy_key: string; error: string }> = [];

    if (toInsert.length > 0) {
      const insertRows = toInsert.map((c) => ({
        policy_key: c.policy_key,
        snapshot_value: c.snapshot_value,
        snapshot_classification: c.snapshot_classification,
        identical_institution_count: c.identical_institution_count,
        identical_days: c.identical_days,
      }));

      const { data: insertedRows, error: insertError } = await supabase
        .from('hr_policy_promotion_suggestions')
        .insert(insertRows)
        .select('id, policy_key');

      if (insertError) {
        console.error(`[cron:${JOB_NAME}] bulk insert error:`, insertError);
        // Fall back to per-row insert so one rejected row doesn't block the rest.
        for (const row of insertRows) {
          const { error: perRowError } = await supabase
            .from('hr_policy_promotion_suggestions')
            .insert(row);
          if (perRowError) {
            insertErrors.push({
              policy_key: row.policy_key,
              error: perRowError.message,
            });
          } else {
            inserted += 1;
          }
        }
      } else {
        inserted = insertedRows?.length ?? insertRows.length;
      }
    }

    const elapsedMs = Date.now() - started;

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      elapsed_ms: elapsedMs,
      institution_rows_scanned: allInstitutionRows.length,
      keys_evaluated: byKey.size,
      candidates_found: candidates.length,
      already_pending: candidates.length - toInsert.length,
      inserted,
      insert_errors: insertErrors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
