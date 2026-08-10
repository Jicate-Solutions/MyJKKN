// =====================================================================
// Accreditation — COE Pass-Percentage Mirror (Wave 3, NAAC 8.2.2)
// =====================================================================
// Nightly mirror of the COE exam system's declared results into the MyJKKN
// evidence spine. Reads COE's final_marks_summary_view (per course × session,
// COE Supabase project — direct DB read via lib/services/coe/coe-db-client),
// aggregates to pass percentage per institution × examination session, writes
// coe_naac_evidence snapshot rows, and fans each row out to
// quality_evidence_mappings → NAAC 8.2.2 ("Pass percentage in university
// examinations") on the junction's natural key (source_table, source_id,
// body_code, metric_code, programme_id, institution_id), is_auto=true. That key
// is the arbiter of the upsert below and its column SET must be named in FULL
// or Postgres raises 42P10 — see migrations 20260809000000 and 20260809101400.
// 20260809101400 is unapplied everywhere, so the upsert names the FIVE-column
// key first and retries with six on 42P10.
// Manually-curated (is_auto=false) mappings are NEVER clobbered (pre-excluded
// before the upsert — PostgREST upserts cannot carry a conditional ON CONFLICT,
// so the guard runs here). That guard matches on (source_id, institution_id),
// not source_id alone: this route's own snapshots are per institution, but a
// MANUAL claim on the same source can be curated by ANOTHER college once the
// six-column key is live, and matching on source_id alone would let it suppress
// this college's legitimate auto row.
//
// CROSS-DB NOTE: the computation lives HERE (TypeScript) because no Postgres
// fn in the MyJKKN project can reach into the COE project — the DB migration
// (20260726053000) only creates the snapshot table + registry row + schedule
// row + RLS. Identity bridge: COE institutions.myjkkn_institution_ids[] maps
// each COE institution to 1..n MyJKKN institutions (CAS fans out to 2 —
// Aided + Self); campus-level session numbers are recorded on each, flagged
// in metadata.
//
// METRIC 5.7 (exam-calendar↔result adherence, day counts) is deliberately
// NOT computed: verified live 2026-07-26 that final_marks.published_date is
// NULL on all 29,144 rows, and examination_sessions.result_declaration_date
// is a backfill artifact (3 of the 4 populated values are stamped 2026-06-05
// — one implies results 552 days after the exam). No honest day count exists,
// so none is fabricated.
//
// Fired daily (04:51 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'coe-result-naac-snapshots' — day/time editable in /admin/ai-routines),
// NOT a raw vercel.json cron. Response carries the numeric 'count' key for
// the dispatcher's summarize() allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// COE creds (COE_SUPABASE_URL / COE_SUPABASE_SERVICE_ROLE_KEY) are server-side
// secrets — fail closed with 503 when absent; never NEXT_PUBLIC_.
// Does not call Claude. Created 2026-07-26 (Wave 3, module→evidence-spine).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  EVIDENCE_CONFLICT_TARGET,
  EVIDENCE_CONFLICT_TARGET_LEGACY,
} from '@/lib/types/accreditation';
import {
  isCoeDbConfigured,
  getAllCoeInstitutions,
  getCoeExaminationSessions,
  getCoeFinalSummaryAll,
} from '@/lib/services/coe/coe-db-client';

// Bearer ONLY — no ?secret= branch (a query-param secret lands in access
// logs / Referer headers). Compare is constant-time. Same pattern as
// app/api/cron/facility-teaching-naac-snapshots/route.ts.
function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6,
  JUNE: 6, JUL: 7, JULY: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** 'AY YYYY-YY' with the June cutoff (mirrors fn_accreditation_ay_label). */
function ayLabel(year: number, month: number): string {
  const startYear = month >= 6 ? year : year - 1;
  return `AY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** AY from an ISO date string, else null. */
function ayFromDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  return ayLabel(Number(m[1]), Number(m[2]));
}

/** Fallback: AY parsed from a session code like 'APRIL-MAY-2025'. */
function ayFromSessionCode(code: string): string | null {
  const m = /^([A-Z]+)\b.*?(\d{4})\s*$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return ayLabel(Number(m[2]), month);
}

interface SessionWindow {
  start: string | null;
  end: string | null;
  name: string | null;
}

interface Aggregate {
  courseRows: number;
  entries: number;
  published: number;
  passed: number;
  failed: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fail CLOSED when the COE direct-DB creds are absent — same guard shape as
  // every other isCoeDbConfigured() caller. These are server-only env vars
  // (present in Vercel prod, verified 2026-07-06).
  if (!isCoeDbConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'COE direct-DB credentials not configured (COE_SUPABASE_URL / ' +
          'COE_SUPABASE_SERVICE_ROLE_KEY) — mirror skipped.',
      },
      { status: 503 },
    );
  }

  try {
    // ── 1. Read the COE side (read-only) ───────────────────────────────────
    const [coeInstitutions, coeSessions, summaryRows] = await Promise.all([
      getAllCoeInstitutions(),
      getCoeExaminationSessions(),
      getCoeFinalSummaryAll(),
    ]);

    const instByCode = new Map(coeInstitutions.map((i) => [i.institution_code, i]));

    // Session windows per COE-institution × code, and per code as fallback
    // (one code can span several session rows — Planned/Registration Open/
    // Results Declared; keep the widest window seen).
    const windows = new Map<string, SessionWindow>();
    const widen = (key: string, s: { exam_start_date: string | null; exam_end_date: string | null; session_name: string | null }) => {
      const cur = windows.get(key);
      if (!cur) {
        windows.set(key, { start: s.exam_start_date, end: s.exam_end_date, name: s.session_name });
        return;
      }
      if (s.exam_start_date && (!cur.start || s.exam_start_date < cur.start)) cur.start = s.exam_start_date;
      if (s.exam_end_date && (!cur.end || s.exam_end_date > cur.end)) cur.end = s.exam_end_date;
      if (!cur.name && s.session_name) cur.name = s.session_name;
    };
    for (const s of coeSessions) {
      if (!s.session_code) continue;
      widen(`code:${s.session_code}`, s);
    }

    // ── 2. Aggregate course rows → institution × session pass percentage ───
    const aggregates = new Map<string, Aggregate>();
    for (const r of summaryRows) {
      if (!r.institution_code || !r.session_code) continue;
      const key = `${r.institution_code}|${r.session_code}`;
      const agg = aggregates.get(key) ?? { courseRows: 0, entries: 0, published: 0, passed: 0, failed: 0 };
      agg.courseRows += 1;
      agg.entries += r.total_students ?? 0;
      agg.published += r.published_count ?? 0;
      agg.passed += r.passed_count ?? 0;
      agg.failed += r.failed_count ?? 0;
      aggregates.set(key, agg);
    }

    // ── 3. Fan out to MyJKKN institutions and build snapshot rows ──────────
    const nowIso = new Date().toISOString();
    const snapshotRows: Array<Record<string, unknown>> = [];
    let sessionsWithResults = 0;
    for (const [key, agg] of aggregates) {
      // Emission gate: only sessions with actually-published results. Nothing
      // fabricated for planned/empty sessions.
      if (agg.published <= 0) continue;
      sessionsWithResults += 1;
      const [institutionCode, sessionCode] = key.split('|');
      const coeInst = instByCode.get(institutionCode);
      if (!coeInst || coeInst.myjkkn_institution_ids.length === 0) continue;

      const win = windows.get(`code:${sessionCode}`) ?? null;
      const ay = ayFromDate(win?.start) ?? ayFromDate(win?.end) ?? ayFromSessionCode(sessionCode);
      const passPct = Math.round((10000 * agg.passed) / agg.published) / 100;

      const computed = {
        coe_institution_code: institutionCode,
        coe_institution_name: coeInst.name,
        session_code: sessionCode,
        exam_start_date: win?.start ?? null,
        exam_end_date: win?.end ?? null,
        course_rows: agg.courseRows,
        learner_course_entries: agg.entries,
        published_entries: agg.published,
        passed_entries: agg.passed,
        failed_entries: agg.failed,
        pass_percentage: passPct,
        denominator: 'published learner-course entries (final_marks_summary_view published_count)',
        fan_out:
          coeInst.myjkkn_institution_ids.length > 1
            ? `COE institution ${institutionCode} maps to ${coeInst.myjkkn_institution_ids.length} MyJKKN institutions — identical campus-level session numbers recorded on each`
            : null,
        source: 'COE final_marks_summary_view (direct DB read, service creds)',
      };

      for (const myjkknId of coeInst.myjkkn_institution_ids) {
        snapshotRows.push({
          institution_id: myjkknId,
          metric_code: '8.2.2',
          session_code: sessionCode,
          ay_label: ay,
          computed,
          computed_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    const supabase = createServiceRoleClient();

    // ── 4. Upsert snapshots on the natural key ──────────────────────────────
    let upserted: Array<{
      id: string;
      institution_id: string;
      metric_code: string;
      session_code: string;
      ay_label: string | null;
      computed: Record<string, unknown>;
      computed_at: string;
    }> = [];
    if (snapshotRows.length > 0) {
      const { data, error } = await supabase
        .from('coe_naac_evidence')
        .upsert(snapshotRows, { onConflict: 'institution_id,metric_code,session_code' })
        .select('id, institution_id, metric_code, session_code, ay_label, computed, computed_at');
      if (error) {
        return NextResponse.json(
          { ok: false, error: `coe_naac_evidence upsert failed: ${error.message}` },
          { status: 500 },
        );
      }
      upserted = data ?? [];
    }

    // ── 5. Fan out to quality_evidence_mappings (never clobber manual rows) ─
    // PostgREST upsert has no conditional DO UPDATE, so manually-curated
    // (is_auto=false) mappings are pre-excluded here instead.
    let mappings = 0;
    let skippedManual = 0;
    // 'scoped'        = the six-column key (institution_id in the arbiter) is live.
    // 'legacy'        = migration 20260809101400 is not applied on this database.
    // 'not_attempted' = no mapping row was written this run, so the key was never
    //                   probed. It must NOT default to a real value: a night with
    //                   zero snapshots would otherwise report the migration's
    //                   status without having checked it, which is exactly the
    //                   false signal this field exists to prevent.
    let conflictTargetUsed: 'scoped' | 'legacy' | 'not_attempted' = 'not_attempted';
    if (upserted.length > 0) {
      // THE EXCLUSION SET MUST MATCH THE KEY THAT IS ACTUALLY LIVE.
      //
      // Under the FIVE-column key (live everywhere today) institution_id is not
      // part of the arbiter, so a manual row owned by ANOTHER college collides
      // with this upsert. Excluding on (source_id, institution_id) would leave it
      // out of the set, and DO UPDATE would silently overwrite a curated row —
      // flipping is_auto to true and re-stamping its tenant. Under the SIX-column
      // key the opposite holds: excluding on source_id alone lets one college's
      // manual claim suppress another college's legitimate auto row.
      //
      // So both sets are built, and the one matching the target actually used is
      // applied. source_id-only for the legacy path — over-excluding merely skips
      // a row, while under-excluding destroys curated data.
      const { data: manual, error: manualErr } = await supabase
        .from('quality_evidence_mappings')
        .select('source_id, institution_id')
        .eq('source_table', 'coe_naac_evidence')
        .eq('is_auto', false);
      if (manualErr) {
        return NextResponse.json(
          { ok: false, error: `manual-mapping guard read failed: ${manualErr.message}` },
          { status: 500 },
        );
      }
      const manualSourceIds = new Set((manual ?? []).map((m) => m.source_id as string));
      const manualComposite = new Set(
        (manual ?? []).map((m) => `${m.source_id as string}::${m.institution_id as string}`),
      );

      const toMappingRow = (s: (typeof upserted)[number]) => ({
        source_table: 'coe_naac_evidence',
        source_id: s.id,
        institution_id: s.institution_id,
        body_code: 'NAAC',
        metric_code: s.metric_code,
        period_label: s.ay_label ?? s.session_code,
        mapped_by: null,
        is_auto: true,
        metadata: { ...s.computed, snapshot: true, computed_at: s.computed_at },
        mapped_at: nowIso,
      });

      const legacyRows = upserted.filter((s) => !manualSourceIds.has(s.id)).map(toMappingRow);
      const scopedRows = upserted
        .filter((s) => !manualComposite.has(`${s.id}::${s.institution_id}`))
        .map(toMappingRow);

      const mappingRows = legacyRows;
      skippedManual = upserted.length - legacyRows.length;

      if (mappingRows.length > 0) {
        // Postgres matches an inferred ON CONFLICT target to a unique constraint
        // EXACTLY, so naming one column too few or too many raises 42P10 — that
        // is precisely how this upsert failed every night for weeks before
        // migration 20260809000000. Migration 20260809101400 adds institution_id
        // to that key so one shared source row can be claimed by every college it
        // serves. Deploys ship code, not migrations, so at any moment production
        // may be on EITHER key and a hard-coded target would break in one of the
        // two orders. Hence: try the LIVE key, fall back on 42P10.
        //
        // Live key first, not the six-column one. 20260809101400 is unapplied
        // everywhere, so leading with six columns would make every run take a
        // guaranteed 42P10 plus a retry and log a Postgres error nightly for no
        // gain. Flip the order — or better, delete the fallback — at apply time.
        //
        // The fallback is NOT silent. A silent one would leave nobody able to
        // tell which key production is on, when the fallback stops firing (i.e.
        // when the transitional constant is safe to delete), or when a genuine
        // 42P10 from some third hard-coded writer starts appearing. So the
        // route reports which target it used.
        conflictTargetUsed = 'legacy';
        let { error: mapErr } = await supabase
          .from('quality_evidence_mappings')
          .upsert(mappingRows, { onConflict: EVIDENCE_CONFLICT_TARGET_LEGACY });
        if (mapErr?.code === '42P10') {
          // Six-column key is live. Re-filter with the composite exclusion set —
          // under that key a manual claim only shadows the SAME college's auto
          // row, so the source_id-only set used above would over-exclude.
          conflictTargetUsed = 'scoped';
          skippedManual = upserted.length - scopedRows.length;
          console.warn(
            '[cron/coe-result-naac-snapshots] five-column evidence conflict target ' +
              'raised 42P10 — migration 20260809101400 IS applied on this database. ' +
              'Retrying with the six-column key. The legacy constant and this fallback ' +
              'can now be deleted.',
          );
          ({ error: mapErr } = await supabase
            .from('quality_evidence_mappings')
            .upsert(scopedRows, { onConflict: EVIDENCE_CONFLICT_TARGET }));
        }
        if (mapErr) {
          return NextResponse.json(
            { ok: false, error: `quality_evidence_mappings upsert failed: ${mapErr.message}` },
            { status: 500 },
          );
        }
        mappings =
          conflictTargetUsed === 'scoped' ? scopedRows.length : mappingRows.length;
      }
    }

    // 'count' is on the dispatcher summarize() allowlist — surfaces the number
    // of snapshot rows refreshed in the Control Tower "last run" line.
    return NextResponse.json({
      ok: true,
      metric: '8.2.2',
      coe_sessions_with_published_results: sessionsWithResults,
      snapshots: upserted.length,
      mappings,
      skipped_manual: skippedManual,
      // Which evidence conflict target this run actually used. 'legacy' means
      // migration 20260809101400 is not applied here, so a shared source row
      // can still be claimed by only one institution.
      conflict_target_used: conflictTargetUsed,
      count: upserted.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
