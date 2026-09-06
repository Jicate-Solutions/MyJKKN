// app/api/pde/analytics/export/route.ts
// Real CSV export for the PDE analytics page (replaces a client-side
// placeholder that downloaded a file whose body was the literal text
// "No data available yet.").
//
// GET /api/pde/analytics/export?type=&courseId=&from=&to=
//   type     = overview | time-on-task | finks-dimensions | performers  (required)
//   courseId = vac_courses.id — optional, mirrors the page's course selector
//   from/to  = ISO 8601 timestamps, optional, filtered on submission started_at
//
// Returns text/csv (UTF-8 BOM so Excel renders non-ASCII names correctly).
// An empty result set returns the header row alone — never an error, never
// placeholder prose.
//
// ── Ported from the AICBL predecessor (app/api/analytics/export/route.ts) ────
// Kept: BOM, RFC4180-ish escaping, ISO date-range params, and the dynamic
// per-domain column trick (columns are the union of OSCE domains actually
// present, not a hardcoded list).
// Remapped: AICBL's aicbl_sessions / aicbl_answers / aicbl_osce_scores do not
// exist here. The equivalents are pde_submissions (one row per attempt),
// pde_submissions.answers (JSONB array, the per-question answers), and OSCE
// domain scores derived from answers[].domain_score keyed by
// pde_assessment_questions.metadata.osce_domain — there is no osce_scores
// table and no persisted domain_scores column in this schema.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
// Shared serialiser: UTF-8 BOM, CRLF, RFC-4180 quoting and the existing
// formula-injection guard (this export carries learner-entered free text).
import { buildCsvDocument } from '@/lib/utils/csv-export';
import { toAnswersArray } from '@/lib/pde/answers-shape';

// ──────────────────────────────────────────────────────────────────────────────
// Types / helpers
// ──────────────────────────────────────────────────────────────────────────────

const REPORT_TYPES = ['overview', 'time-on-task', 'finks-dimensions', 'performers'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

interface ScopedAssessment {
  id: string;
  title: string;
  assessment_type: string;
  status: string | null;
  course_id: string | null;
  course_code: string | null;
  course_name: string | null;
}

interface AnswerEntry {
  question_id?: string;
  domain_score?: unknown;
  points_earned?: unknown;
  is_correct?: unknown;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * pde_assessment_questions.finks_dimension is stored Title Cased with spaces
 * ("Foundational Knowledge") while the analytics page keys dimensions in
 * snake_case ("foundational_knowledge"). Normalise so the CSV joins to the UI.
 */
function normaliseFinksKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'unassigned';
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Seconds → minutes, 2dp. */
function toMinutes(seconds: number): number {
  return round2(seconds / 60);
}

/** Returns `{ value: null, invalid: false }` when absent, `invalid: true` when unparseable. */
function parseIsoParam(raw: string | null): { value: string | null; invalid: boolean } {
  if (!raw) return { value: null, invalid: false };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { value: null, invalid: true };
  return { value: parsed.toISOString(), invalid: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// Route
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;

    const rawType = searchParams.get('type');
    if (!rawType || !REPORT_TYPES.includes(rawType as ReportType)) {
      return NextResponse.json(
        { error: `Missing or invalid 'type'. Expected one of: ${REPORT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    const type = rawType as ReportType;

    const fromParam = parseIsoParam(searchParams.get('from'));
    if (fromParam.invalid) {
      return NextResponse.json({ error: "Invalid 'from' date. Use ISO 8601." }, { status: 400 });
    }
    const toParam = parseIsoParam(searchParams.get('to'));
    if (toParam.invalid) {
      return NextResponse.json({ error: "Invalid 'to' date. Use ISO 8601." }, { status: 400 });
    }
    if (fromParam.value && toParam.value && fromParam.value > toParam.value) {
      return NextResponse.json({ error: "'from' must be before 'to'." }, { status: 400 });
    }
    const courseId = searchParams.get('courseId');

    // ── Institution scope ────────────────────────────────────────────────────
    // Same shape as app/api/pde/cases/route.ts, with one deliberate difference:
    // that route SKIPS the institution filter when the profile has no
    // institution_id, which would hand a bulk export of every college's data to
    // any user with an unset institution. A CSV export is exactly the wrong
    // place to fail open, so a non-super user with no institution is denied.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('institution_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    const isSuper =
      !!profile &&
      (profile.is_super_admin === true ||
        profile.role === 'super_admin' ||
        profile.role === 'platform_admin');

    const institutionIdParam = searchParams.get('institutionId');
    const scopeInstitutionId = isSuper ? institutionIdParam : (profile?.institution_id ?? null);

    if (!isSuper && !scopeInstitutionId) {
      return NextResponse.json(
        { error: 'Forbidden — your profile has no institution, so export scope cannot be determined.' },
        { status: 403 }
      );
    }

    // ── Assessments in scope ─────────────────────────────────────────────────
    // vac_courses!inner is intentional: institution_id lives on the course, so
    // an assessment with no course (course_id is nullable) cannot be attributed
    // to a tenant. Such rows are excluded rather than leaked. Prod currently has
    // 0 of them, but 6 of 93 vac_courses have a NULL institution_id and those
    // are likewise excluded for non-super users.
    let assessmentQuery = (supabase as any)
      .from('pde_assessments')
      .select('id, title, assessment_type, status, course_id, vac_courses!inner(id, code, name, institution_id)');

    if (scopeInstitutionId) assessmentQuery = assessmentQuery.eq('vac_courses.institution_id', scopeInstitutionId);
    if (courseId) assessmentQuery = assessmentQuery.eq('course_id', courseId);

    const { data: assessmentRows, error: aErr } = await assessmentQuery;
    if (aErr) throw aErr;

    const assessments: ScopedAssessment[] = (assessmentRows || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      assessment_type: r.assessment_type,
      status: r.status ?? null,
      course_id: r.course_id ?? null,
      course_code: r.vac_courses?.code ?? null,
      course_name: r.vac_courses?.name ?? null,
    }));
    const assessmentById = new Map(assessments.map((a) => [a.id, a]));
    const assessmentIds = assessments.map((a) => a.id);

    // ── Questions for the scoped assessments ─────────────────────────────────
    // Needed for both the OSCE domain mapping and the Fink's report.
    let questions: any[] = [];
    if (assessmentIds.length) {
      const { data: qRows, error: qErr } = await (supabase as any)
        .from('pde_assessment_questions')
        .select('id, assessment_id, question_text, question_type, finks_dimension, points, order_index, metadata')
        .in('assessment_id', assessmentIds);
      if (qErr) throw qErr;
      questions = qRows || [];
    }
    const questionById = new Map<string, any>(questions.map((q) => [q.id, q]));

    // ── Submissions for the scoped assessments ───────────────────────────────
    // NOTE: pde_submissions has no institution_id — scoping is the assessment_id
    // IN (…) filter above. It also has an RLS policy `USING (true)` for every
    // authenticated user, so this filter is the ONLY tenant boundary here.
    let submissions: any[] = [];
    if (assessmentIds.length) {
      let subQuery = (supabase as any)
        .from('pde_submissions')
        .select(
          'id, assessment_id, learner_id, attempt_number, assessment_version, started_at, completed_at, ' +
            'answers, auto_score, peer_avg_score, faculty_score, final_score, passed, time_spent_seconds, roll_number_snapshot'
        )
        .in('assessment_id', assessmentIds)
        .order('started_at', { ascending: false });

      if (fromParam.value) subQuery = subQuery.gte('started_at', fromParam.value);
      if (toParam.value) subQuery = subQuery.lte('started_at', toParam.value);

      const { data: sRows, error: sErr } = await subQuery;
      if (sErr) throw sErr;
      submissions = sRows || [];
    }

    // ── Learner identities ───────────────────────────────────────────────────
    // learners_profiles has first_name/last_name (there is NO full_name column).
    // Left join semantics: a submission whose learner row is missing keeps its
    // row and falls back to roll_number_snapshot rather than being dropped.
    const learnerIds = Array.from(new Set(submissions.map((s: any) => s.learner_id).filter(Boolean)));
    const learnerById = new Map<string, { name: string; roll: string | null }>();
    if (learnerIds.length) {
      const { data: lRows } = await (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, register_number')
        .in('id', learnerIds);
      (lRows || []).forEach((l: any) => {
        const name = [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
        learnerById.set(l.id, { name, roll: l.roll_number ?? l.register_number ?? null });
      });
    }

    const identity = (s: any) => {
      const rec = learnerById.get(s.learner_id);
      return {
        name: rec?.name || '',
        roll: rec?.roll ?? s.roll_number_snapshot ?? '',
      };
    };

    // ── Per-submission OSCE domain averages (dynamic columns) ────────────────
    // answers[] entries carry an optional numeric domain_score; the OSCE domain
    // itself lives on the question's metadata.osce_domain.
    const domainAveragesFor = (s: any): Record<string, number> => {
      const answers: AnswerEntry[] = toAnswersArray<AnswerEntry>(s.answers);
      const acc: Record<string, { sum: number; count: number }> = {};
      for (const a of answers) {
        const score = numOrNull(a?.domain_score);
        if (score === null) continue;
        const q = a.question_id ? questionById.get(a.question_id) : undefined;
        const domain = typeof q?.metadata?.osce_domain === 'string' ? q.metadata.osce_domain : 'unassigned';
        acc[domain] = acc[domain] || { sum: 0, count: 0 };
        acc[domain].sum += score;
        acc[domain].count += 1;
      }
      return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, round2(v.sum / v.count)]));
    };

    // Union of domains actually observed — the AICBL dynamic-column idea.
    const observedDomains = new Set<string>();
    for (const s of submissions) {
      Object.keys(domainAveragesFor(s)).forEach((d) => observedDomains.add(d));
    }
    const domainColumns = Array.from(observedDomains).sort();

    // ── Build the requested report ───────────────────────────────────────────
    let headers: string[] = [];
    let rows: unknown[][] = [];

    if (type === 'overview') {
      headers = [
        'submission_id',
        'learner_name',
        'roll_number',
        'case_title',
        'course_code',
        'course_name',
        'assessment_type',
        'attempt_number',
        'assessment_version',
        'started_at',
        'completed_at',
        'time_spent_minutes',
        'auto_score',
        'peer_avg_score',
        'reviewer_score',
        'final_score',
        'passed',
        ...domainColumns.map((d) => `osce_${d}_avg`),
      ];
      rows = submissions.map((s: any) => {
        const a = assessmentById.get(s.assessment_id);
        const who = identity(s);
        const domains = domainAveragesFor(s);
        return [
          s.id,
          who.name,
          who.roll,
          a?.title ?? '',
          a?.course_code ?? '',
          a?.course_name ?? '',
          a?.assessment_type ?? '',
          s.attempt_number,
          s.assessment_version,
          s.started_at,
          s.completed_at,
          typeof s.time_spent_seconds === 'number' ? toMinutes(s.time_spent_seconds) : '',
          s.auto_score,
          s.peer_avg_score,
          s.faculty_score,
          s.final_score,
          s.passed === null || s.passed === undefined ? '' : s.passed ? 'yes' : 'no',
          ...domainColumns.map((d) => (d in domains ? domains[d] : '')),
        ];
      });
    } else if (type === 'time-on-task') {
      headers = [
        'learner_name',
        'roll_number',
        'attempts',
        'completed_attempts',
        'total_minutes',
        'avg_minutes_per_attempt',
        'first_activity_at',
        'last_activity_at',
      ];
      const perLearner = new Map<string, {
        name: string; roll: string; attempts: number; completed: number;
        seconds: number; timed: number; first: string | null; last: string | null;
      }>();
      for (const s of submissions) {
        const who = identity(s);
        const key = s.learner_id || `unknown:${s.id}`;
        const cur = perLearner.get(key) || {
          name: who.name, roll: who.roll, attempts: 0, completed: 0,
          seconds: 0, timed: 0, first: null, last: null,
        };
        cur.attempts += 1;
        if (s.completed_at) cur.completed += 1;
        if (typeof s.time_spent_seconds === 'number') {
          cur.seconds += s.time_spent_seconds;
          cur.timed += 1;
        }
        const stamp = s.completed_at || s.started_at;
        if (stamp) {
          if (!cur.first || stamp < cur.first) cur.first = stamp;
          if (!cur.last || stamp > cur.last) cur.last = stamp;
        }
        perLearner.set(key, cur);
      }
      rows = Array.from(perLearner.values())
        .sort((a, b) => b.seconds - a.seconds)
        .map((l) => [
          l.name,
          l.roll,
          l.attempts,
          l.completed,
          toMinutes(l.seconds),
          l.timed > 0 ? toMinutes(l.seconds / l.timed) : '',
          l.first,
          l.last,
        ]);
    } else if (type === 'finks-dimensions') {
      headers = [
        'finks_dimension',
        'questions',
        'total_points_available',
        'answers_recorded',
        'correct_answers',
        'accuracy_pct',
        'avg_points_earned',
      ];
      // Seeded from the question inventory so the report is meaningful even
      // before any attempts exist — an unattempted dimension reports its
      // question count with blank answer stats rather than vanishing.
      const perDim = new Map<string, {
        questions: number; points: number; answers: number; correct: number; earned: number; earnedCount: number;
      }>();
      const dimOf = (qid?: string) => normaliseFinksKey(qid ? questionById.get(qid)?.finks_dimension : undefined);

      for (const q of questions) {
        const key = normaliseFinksKey(q.finks_dimension);
        const cur = perDim.get(key) || { questions: 0, points: 0, answers: 0, correct: 0, earned: 0, earnedCount: 0 };
        cur.questions += 1;
        cur.points += typeof q.points === 'number' ? q.points : 0;
        perDim.set(key, cur);
      }
      for (const s of submissions) {
        const answers: AnswerEntry[] = toAnswersArray<AnswerEntry>(s.answers);
        for (const ans of answers) {
          const key = dimOf(ans?.question_id);
          const cur = perDim.get(key) || { questions: 0, points: 0, answers: 0, correct: 0, earned: 0, earnedCount: 0 };
          cur.answers += 1;
          if (ans?.is_correct === true) cur.correct += 1;
          const pts = numOrNull(ans?.points_earned);
          if (pts !== null) {
            cur.earned += pts;
            cur.earnedCount += 1;
          }
          perDim.set(key, cur);
        }
      }
      rows = Array.from(perDim.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dim, v]) => [
          dim,
          v.questions,
          v.points,
          v.answers,
          v.answers > 0 ? v.correct : '',
          v.answers > 0 ? round2((v.correct / v.answers) * 100) : '',
          v.earnedCount > 0 ? round2(v.earned / v.earnedCount) : '',
        ]);
    } else {
      // performers
      headers = [
        'rank',
        'learner_name',
        'roll_number',
        'attempts',
        'best_score',
        'avg_score',
        'passed_attempts',
        'pass_rate_pct',
        'last_activity_at',
      ];
      const perLearner = new Map<string, {
        name: string; roll: string; attempts: number; best: number | null;
        sum: number; scored: number; passed: number; passDenom: number; last: string | null;
      }>();
      for (const s of submissions) {
        const who = identity(s);
        const key = s.learner_id || `unknown:${s.id}`;
        const cur = perLearner.get(key) || {
          name: who.name, roll: who.roll, attempts: 0, best: null,
          sum: 0, scored: 0, passed: 0, passDenom: 0, last: null,
        };
        cur.attempts += 1;
        const score = numOrNull(s.final_score) ?? numOrNull(s.auto_score);
        if (score !== null) {
          cur.sum += score;
          cur.scored += 1;
          if (cur.best === null || score > cur.best) cur.best = score;
        }
        if (s.passed !== null && s.passed !== undefined) {
          cur.passDenom += 1;
          if (s.passed) cur.passed += 1;
        }
        const stamp = s.completed_at || s.started_at;
        if (stamp && (!cur.last || stamp > cur.last)) cur.last = stamp;
        perLearner.set(key, cur);
      }
      rows = Array.from(perLearner.values())
        .sort((a, b) => (b.best ?? -Infinity) - (a.best ?? -Infinity))
        .map((l, idx) => [
          idx + 1,
          l.name,
          l.roll,
          l.attempts,
          l.best ?? '',
          l.scored > 0 ? round2(l.sum / l.scored) : '',
          l.passDenom > 0 ? l.passed : '',
          l.passDenom > 0 ? round2((l.passed / l.passDenom) * 100) : '',
          l.last,
        ]);
    }

    const csv = buildCsvDocument(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `pde-${type}-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('GET /api/pde/analytics/export error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
