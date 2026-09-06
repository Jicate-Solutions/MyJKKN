/**
 * GET /api/cron/exam-audit-alerts — weekly Exam IA Audit watchdog.
 *
 * Director decision 2026-07-13 ("Build the lever"): when a program sits at
 * operator-dump / missing-CIA / no-rubric with an exam date approaching, the
 * Registrar and that college's Principal(s) get an in-app notification — the
 * audit runs itself weekly instead of waiting for someone to open the page.
 *
 * HOW IT DECIDES (single source of truth): the verdicts come from
 * lib/services/exam-audit/compute.ts — the SAME computation the audit page
 * renders. The alert can never disagree with the page.
 *
 * Scope per run: every COE-mapped college whose exam session has
 * exam_start_date within `exam_ia_audit.alert_lead_days` days (or already
 * underway, until exam_end_date). One notification per college per ISO week
 * (idempotency key), change or no change — a standing weekly nudge while
 * flags persist is the point ("runs itself weekly").
 *
 * Recipients (lookup, not authz — mirrors copo-attainment/#1945):
 *   - Registrar(s): user_roles JOIN custom_roles role_key='registrar'
 *     (+ legacy profiles.role='registrar' fallback) — they audit all colleges.
 *   - That college's active Principal(s): same dual lookup, scoped to the
 *     college's MyJKKN institution ids.
 *
 * Auth: CRON_SECRET via Authorization: Bearer <secret> OR ?secret= query.
 * ?dryRun=1 computes and reports what WOULD be sent without writing anything.
 * Config: exam_ia_audit.alerts_enabled / alert_lead_days (platform_policies).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  isCoeDbConfigured,
  getAllCoeInstitutions,
  getCoeExaminationSessions,
  getCoeExamRegistrations,
  getCoeCiaProvenance,
  getCoeCiaSettings,
  getCoePrograms,
} from '@/lib/services/coe/coe-db-client';
import { computeExamAuditPrograms } from '@/lib/services/exam-audit/compute';
import type { ExamAuditProgramVerdict } from '@/lib/services/exam-audit/compute';

export const maxDuration = 300;

function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO week key (e.g. "2026-W29") — one alert per college per week. */
function isoWeek(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

async function getGlobalPolicy(db: SupabaseClient, key: string): Promise<unknown> {
  const { data } = await db
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .maybeSingle();
  return data?.value;
}

/** Users holding a role via Role Management (+ legacy profiles.role fallback).
 *  Optionally narrowed to a set of institutions. Recipient LOOKUP, not authz. */
async function usersWithRole(
  db: SupabaseClient,
  roleKey: string,
  institutionIds?: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: role } = await db
    .from('custom_roles')
    .select('id')
    .eq('role_key', roleKey)
    .eq('is_active', true)
    .maybeSingle();
  let roleUserIds: string[] = [];
  if (role?.id) {
    const { data: ur } = await db.from('user_roles').select('user_id').eq('role_id', role.id);
    roleUserIds = (ur ?? []).map((x) => x.user_id as string).filter(Boolean);
  }
  if (roleUserIds.length > 0) {
    let q = db.from('profiles').select('id').in('id', roleUserIds);
    if (institutionIds && institutionIds.length > 0) q = q.in('institution_id', institutionIds);
    const { data } = await q;
    for (const p of data ?? []) ids.add(p.id as string);
  }
  // Legacy single-role fallback.
  let lq = db.from('profiles').select('id').eq('role', roleKey);
  if (institutionIds && institutionIds.length > 0) lq = lq.in('institution_id', institutionIds);
  const { data: legacy } = await lq;
  for (const p of legacy ?? []) ids.add(p.id as string);
  return [...ids];
}

interface FlaggedProgram {
  code: string;
  problem: string;
}

function flagOf(row: ExamAuditProgramVerdict): FlaggedProgram | null {
  // Alert conditions (Director 2026-07-13): operator dump / missing / no rubric.
  // A program with zero registered students is noise, not a finding.
  if (row.registered_students === 0) return null;
  if (row.cia_rows === 0 && row.rubric_verdict === 'no_rubric')
    return { code: row.program_code, problem: 'no CIA data and no rubric configured' };
  if (row.verdict === 'missing')
    return { code: row.program_code, problem: 'registered for the exam, zero CIA entries' };
  if (row.rubric_verdict === 'no_rubric')
    return { code: row.program_code, problem: 'no assessment rubric configured' };
  if (row.verdict === 'operator_bulk') {
    const rounds =
      row.rubric_verdict === 'partial' || row.rubric_verdict === 'off_rubric'
        ? `; ${row.rounds_used.length}/${row.rubric_rounds_configured ?? '?'} rubric rounds entered`
        : '';
    return {
      code: row.program_code,
      problem: `operator bulk entry (${row.distinct_enterers} enterer${row.distinct_enterers === 1 ? '' : 's'}, ${row.entry_days} day${row.entry_days === 1 ? '' : 's'}, 0% faculty-stamped)${rounds}`,
    };
  }
  if (row.rubric_verdict === 'off_rubric' || row.rubric_verdict === 'partial')
    return {
      code: row.program_code,
      problem: `${row.rounds_used.length}/${row.rubric_rounds_configured ?? '?'} rubric rounds entered`,
    };
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const { searchParams } = new URL(request.url);
    const provided =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      searchParams.get('secret');
    if (!cronSecret || provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isCoeDbConfigured()) {
      return NextResponse.json({ skipped: 'coe_not_configured' });
    }
    const dryRun = searchParams.get('dryRun') === '1';

    const db = createServiceRoleClient();

    const enabled = (await getGlobalPolicy(db, 'exam_ia_audit.alerts_enabled')) !== false;
    if (!enabled) return NextResponse.json({ skipped: 'disabled' });
    const leadRaw = await getGlobalPolicy(db, 'exam_ia_audit.alert_lead_days');
    const leadDays = typeof leadRaw === 'number' && leadRaw > 0 ? leadRaw : 21;

    const today = istToday();
    const horizon = new Date(new Date(today + 'T00:00:00Z').getTime() + leadDays * 86400000)
      .toISOString()
      .slice(0, 10);
    const week = isoWeek(today);

    // Recipient substrate fetched once: registrars audit every college.
    const registrarIds = await usersWithRole(db, 'registrar');
    const { data: superAdmins } = await db
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .limit(1);
    const createdBy = superAdmins?.[0]?.id as string | undefined;

    const institutions = await getAllCoeInstitutions();
    const results: Array<Record<string, unknown>> = [];
    let alertsSent = 0;
    let sessionsInWindow = 0;
    let snapshotsWritten = 0;

    for (const inst of institutions) {
      // Sessions whose exams start within the lead window or are underway.
      const sessions = await getCoeExaminationSessions(inst.id);
      const seen = new Set<string>();
      const upcoming = sessions.filter((s) => {
        if (!s.session_code || !s.exam_start_date) return false;
        if (seen.has(s.session_code)) return false;
        const starts = s.exam_start_date;
        const ends = s.exam_end_date ?? s.exam_start_date;
        const inWindow = (starts >= today && starts <= horizon) || (starts <= today && ends >= today);
        if (inWindow) seen.add(s.session_code);
        return inWindow;
      });
      if (upcoming.length === 0) continue;

      for (const session of upcoming) {
        sessionsInWindow += 1;
        const code = session.session_code as string;
        const sessionRows = sessions.filter((s) => s.session_code === code);
        const [registrations, provenance, programs, ciaSettings] = await Promise.all([
          getCoeExamRegistrations(code, inst.id),
          getCoeCiaProvenance(sessionRows.map((s) => s.id), inst.id),
          getCoePrograms(inst.id),
          getCoeCiaSettings(inst.id, sessionRows.map((s) => s.id)),
        ]);
        if (registrations.length === 0) continue; // nothing expected yet — no audit surface

        const computed = computeExamAuditPrograms({
          registrations,
          provenance,
          programs,
          ciaSettings,
        });
        const flagged = computed
          .map(({ row }) => flagOf(row))
          .filter((f): f is FlaggedProgram => f !== null);

        // Persist a dated verdict snapshot for EVERY in-window program (clean and
        // flagged) so the EXAM_IA_AUDIT audit parameter has a verdict on record to
        // cite — the LOOP_HEALTH pattern (compute.ts is pure and persists nothing).
        // Append-only; latest-in-cycle-window wins in the discovery query. dryRun
        // writes nothing (mirrors the notification contract).
        if (!dryRun) {
          const problemByCode = new Map(flagged.map((f) => [f.code, f.problem]));
          const snapshotRows = computed.map(({ row }) => ({
            institution_id: inst.myjkkn_institution_ids?.[0] ?? null,
            institution_code: inst.institution_code ?? null,
            institution_name: inst.name ?? null,
            session_code: code,
            program_code: row.program_code,
            program_name: row.program_name,
            verdict: row.verdict,
            rubric_verdict: row.rubric_verdict,
            registered_students: row.registered_students,
            cia_rows: row.cia_rows,
            faculty_entered_pct: row.faculty_entered_pct,
            flagged: problemByCode.has(row.program_code),
            problem: problemByCode.get(row.program_code) ?? null,
          }));
          if (snapshotRows.length > 0) {
            const { error: snapErr } = await db
              .from('exam_ia_audit_verdicts')
              .insert(snapshotRows);
            if (snapErr) {
              console.error('[cron/exam-audit-alerts] snapshot insert failed:', snapErr.message);
            } else {
              snapshotsWritten += snapshotRows.length;
            }
          }
        }

        if (flagged.length === 0) continue;

        // That college's active Principal(s) + every Registrar.
        const principalIds = await usersWithRole(db, 'principal', inst.myjkkn_institution_ids);
        const recipients = [...new Set([...registrarIds, ...principalIds])];

        const listed = flagged.slice(0, 10);
        const more = flagged.length - listed.length;
        const body =
          `${code} exams start ${session.exam_start_date}. ${flagged.length} program${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} an internal-assessment audit before then:\n` +
          listed.map((f) => `• ${f.code} — ${f.problem}`).join('\n') +
          (more > 0 ? `\n…and ${more} more.` : '') +
          `\n\nOpen the Exam IA Audit page, pick ${inst.name ?? 'the college'} and ${code}, and walk the flagged departments with the sheet.`;

        const idempotencyKey = `exam_ia_audit:${inst.id}:${code}:${week}`;

        if (dryRun) {
          results.push({
            institution: inst.name,
            session: code,
            flagged: flagged.length,
            programs: listed.map((f) => f.code),
            recipients: recipients.length,
            idempotencyKey,
            dry_run: true,
          });
          continue;
        }

        const outcome = await fanoutNotification(db, {
          title: `Exam IA Audit: ${inst.name ?? inst.institution_code} — ${flagged.length} program${flagged.length === 1 ? '' : 's'} flagged before ${code}`,
          body,
          userIds: recipients,
          createdBy,
          category: 'academic',
          kind: 'work_item',
          priority: 'high',
          metadata: {
            source: 'exam-audit-alerts',
            institution_code: inst.institution_code,
            session_code: code,
            flagged_programs: flagged.map((f) => f.code),
          },
          idempotencyKey,
        });
        if (outcome.notified > 0) alertsSent += 1;
        results.push({
          institution: inst.name,
          session: code,
          flagged: flagged.length,
          recipients: recipients.length,
          notified: outcome.notified,
          skipped: outcome.skipped ?? null,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      week,
      lead_days: leadDays,
      institutions_checked: institutions.length,
      sessions_in_window: sessionsInWindow,
      alerts_sent: alertsSent,
      snapshots_written: snapshotsWritten,
      registrar_recipients: registrarIds.length,
      results,
    });
  } catch (error) {
    console.error('[cron/exam-audit-alerts] error:', error);
    return NextResponse.json({ error: 'exam-audit-alerts failed' }, { status: 500 });
  }
}
