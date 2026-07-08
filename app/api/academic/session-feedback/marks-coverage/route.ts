/**
 * GET /api/academic/session-feedback/marks-coverage?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Facilitator Pulse signal 8 — "marks for your courses are in".
 *
 * HONESTY CONTRACT (Director decision, 2026-07-08): COE internal marks are
 * bulk-entered by ~4 exam-cell operator accounts (cia_marks.faculty_id is never
 * filled), so there is NO per-faculty marks-entry act to prove presence with.
 * This endpoint therefore reports COURSE COMPLETENESS — of the courses a
 * facilitator is planned to teach that COE examines in the active cycle, how
 * many have internal marks entered — and the UI must label it as exam-cell
 * data, never as the facilitator's own act. Do not "upgrade" this to a
 * presence signal unless COE starts stamping per-faculty entry.
 *
 * Authorization: the roster comes from fn_scf_facilitator_pulse called with
 * the CALLER's session — that SECURITY DEFINER fn is the single authority
 * (leadership roles only + institution scoping) and raises for everyone else.
 * Service-role reads below are keyed strictly to the roster it returned.
 *
 * Attribution chain (join keys verified live 2026-07-08):
 *   pulse roster faculty_email (lowercased)
 *     → staff.institution_email/email (is_active=true only — deactivated rows
 *       poison email joins; see feedback_staff_personal_email_identity_poison)
 *     → staff_plan_courses.staff_id → courses.course_code
 *     → COE cia_marks_summary_view.course_code (marks in)
 *       ∪ COE exam_registrations.course_code (expected universe — a course
 *         with registrations but no CIA rows is exactly the gap to surface).
 *
 * COE PostgREST gotchas: aggregates disabled (use the summary view);
 * cia summary program_code is null (join on course_code alone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  isCoeDbConfigured,
  createCoeDbClient,
  getCoeExaminationSessions,
  getCoeCiaSummary,
} from '@/lib/services/coe/coe-db-client';
import type {
  MarksCoverageResponse,
  MarksCoverageRow,
} from '@/types/session-feedback';

// The .in() filter travels in the querystring — keep it well under PostgREST's
// URL limit. 600 codes ≈ 6KB; a roster's distinct planned codes run ~200-400.
const MAX_PLANNED_CODES = 600;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// .in() filters travel in the querystring — a thousand UUIDs overflows the URL
// and PostgREST answers 400. Read large id-lists in slices.
const IN_CHUNK = 150;
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCoeDbConfigured()) {
      // Fail soft: the column simply doesn't render when COE isn't wired.
      const empty: MarksCoverageResponse = {
        configured: false,
        session_code: null,
        rows: [],
      };
      return NextResponse.json(empty);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json(
        { error: 'from and to are required as YYYY-MM-DD' },
        { status: 400 },
      );
    }

    // Single authority: the pulse fn gates leadership + institution scope and
    // returns the roster this caller may see. Everyone else raises here.
    const { data: roster, error: rosterError } = await supabase.rpc(
      'fn_scf_facilitator_pulse',
      { p_from: from, p_to: to },
    );
    if (rosterError) {
      const msg = rosterError.message || '';
      const status = /not authorized|not authenticated/i.test(msg) ? 403 : 500;
      return NextResponse.json(
        { error: 'You do not have access to the facilitator pulse.' },
        { status },
      );
    }

    const emails = Array.from(
      new Set(
        ((roster ?? []) as Array<{ faculty_email: string | null }>)
          .map((r) => (r.faculty_email ?? '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (emails.length === 0) {
      const empty: MarksCoverageResponse = {
        configured: true,
        session_code: null,
        rows: [],
      };
      return NextResponse.json(empty);
    }

    // ── MyJKKN side: roster emails → active staff → planned courses ────────
    const svc = createServiceRoleClient();

    const emailList = emails.join(',');
    const { data: staffRows, error: staffError } = await svc
      .from('staff')
      .select('id, institution_email, email')
      .eq('is_active', true)
      .or(`institution_email.in.(${emailList}),email.in.(${emailList})`);
    if (staffError) {
      throw new Error(`staff read failed: ${staffError.message}`);
    }

    // staff.institution_email is the login identity; staff.email is personal.
    // Key by whichever matched a roster email, preferring institution_email.
    const staffIdToEmail = new Map<string, string>();
    for (const s of staffRows ?? []) {
      const inst = (s.institution_email ?? '').trim().toLowerCase();
      const pers = (s.email ?? '').trim().toLowerCase();
      const match = emails.includes(inst)
        ? inst
        : emails.includes(pers)
          ? pers
          : null;
      if (match) staffIdToEmail.set(s.id as string, match);
    }

    const staffIds = Array.from(staffIdToEmail.keys());
    const emptyRows: MarksCoverageRow[] = [];
    if (staffIds.length === 0) {
      const none: MarksCoverageResponse = {
        configured: true,
        session_code: null,
        rows: emptyRows,
      };
      return NextResponse.json(none);
    }

    const planRows: Array<{ staff_id: string; course_id: string }> = [];
    for (const ids of chunk(staffIds, IN_CHUNK)) {
      const { data, error: planError } = await svc
        .from('staff_plan_courses')
        .select('staff_id, course_id')
        .in('staff_id', ids);
      if (planError) {
        throw new Error(`staff_plan_courses read failed: ${planError.message}`);
      }
      planRows.push(...((data ?? []) as Array<{ staff_id: string; course_id: string }>));
    }

    const courseIds = Array.from(
      new Set(planRows.map((p) => p.course_id).filter(Boolean)),
    );
    const courseIdToCode = new Map<string, string>();
    for (const ids of chunk(courseIds, IN_CHUNK)) {
      const { data: courseRows, error: courseError } = await svc
        .from('courses')
        .select('id, course_code')
        .in('id', ids);
      if (courseError) {
        throw new Error(`courses read failed: ${courseError.message}`);
      }
      for (const c of courseRows ?? []) {
        const code = (c.course_code ?? '').trim();
        if (code && code !== 'N/A') courseIdToCode.set(c.id as string, code);
      }
    }

    // email → set of planned course codes
    const plannedByEmail = new Map<string, Set<string>>();
    for (const p of planRows) {
      const email = staffIdToEmail.get(p.staff_id as string);
      const code = courseIdToCode.get(p.course_id as string);
      if (!email || !code) continue;
      let set = plannedByEmail.get(email);
      if (!set) plannedByEmail.set(email, (set = new Set()));
      set.add(code);
    }

    let plannedCodes = Array.from(
      new Set(Array.from(plannedByEmail.values()).flatMap((s) => [...s])),
    );
    let codesCapped = false;
    if (plannedCodes.length > MAX_PLANNED_CODES) {
      plannedCodes = plannedCodes.slice(0, MAX_PLANNED_CODES);
      codesCapped = true;
      console.warn(
        `[marks-coverage] planned-code list capped at ${MAX_PLANNED_CODES} — coverage may undercount`,
      );
    }

    // ── COE side: newest exam cycle that actually has CIA rows ─────────────
    const sessions = await getCoeExaminationSessions();
    const seen = new Set<string>();
    const orderedCodes: string[] = [];
    for (const s of [...sessions].sort((a, b) =>
      (b.exam_start_date ?? '').localeCompare(a.exam_start_date ?? ''),
    )) {
      const code = s.session_code;
      if (code && !seen.has(code)) {
        seen.add(code);
        orderedCodes.push(code);
      }
    }

    let sessionCode: string | null = null;
    let ciaCodes = new Set<string>();
    for (const code of orderedCodes.slice(0, 4)) {
      const cia = await getCoeCiaSummary(code);
      if (cia.length > 0) {
        sessionCode = code;
        ciaCodes = new Set(
          cia.map((r) => (r.course_code ?? '').trim()).filter(Boolean),
        );
        break;
      }
    }

    if (!sessionCode || plannedCodes.length === 0) {
      const none: MarksCoverageResponse = {
        configured: true,
        session_code: sessionCode,
        rows: emptyRows,
      };
      return NextResponse.json(none);
    }

    // Expected universe: planned courses with exam registrations this cycle.
    const coe = createCoeDbClient();
    const regCodes = new Set<string>();
    for (const codes of chunk(plannedCodes, IN_CHUNK)) {
      const { data: regRows, error: regError } = await coe
        .from('exam_registrations')
        .select('course_code')
        .eq('session_code', sessionCode)
        .in('course_code', codes)
        .limit(10000);
      if (regError) {
        throw new Error(`COE exam_registrations read failed: ${regError.message}`);
      }
      for (const r of regRows ?? []) {
        const code = ((r as { course_code: string | null }).course_code ?? '').trim();
        if (code) regCodes.add(code);
      }
    }

    const rows: MarksCoverageRow[] = [];
    for (const [email, planned] of plannedByEmail) {
      let expected = 0;
      let marksIn = 0;
      for (const code of planned) {
        const inCia = ciaCodes.has(code);
        if (inCia || regCodes.has(code)) expected += 1;
        if (inCia) marksIn += 1;
      }
      rows.push({
        faculty_email: email,
        courses_expected: expected,
        courses_marks_in: marksIn,
      });
    }

    const response: MarksCoverageResponse = {
      configured: true,
      session_code: sessionCode,
      rows,
      ...(codesCapped ? { codes_capped: true } : {}),
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[marks-coverage] error:', error);
    return NextResponse.json(
      { error: 'Failed to compute marks coverage' },
      { status: 500 },
    );
  }
}
