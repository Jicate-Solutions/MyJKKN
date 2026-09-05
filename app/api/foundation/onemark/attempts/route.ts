export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  ATTEMPT_COLUMNS,
  DEADLINE_GRACE_MS,
  DEFAULT_FLAG_THRESHOLD,
  LEARNER_ITEM_COLUMNS,
  ONEMARK_EXAM_KEYS,
  ONEMARK_MODES,
  UUID_RE,
  admin as adminClient,
  closeSitting,
  deadlineFor,
  liveBlankItemIds,
  parentalConsentBlocks,
  projectItemForLearner,
  readPolicyInt,
  resolveCaller,
  shuffle,
  shuffleOptionsTogether,
  signServedSet,
  sittingQuestionCount,
  timedMinutes,
  type LearnerItem,
} from '@/lib/services/onemark/attempt-server';
import type { OneMarkAttemptMode } from '@/types/onemark';

// OneMark — what the signed-in learner can sit, and opening one sitting.
//
// GET  /api/foundation/onemark/attempts
//   -> { learner, subjects[], live[], vault[], policy }
//      learner: null when the caller is not enrolled — an honest empty state.
//
// POST /api/foundation/onemark/attempts
//   body { mode: 'practice'|'timed'|'live'|'vault_review',
//          examDefinitionId?: uuid,   // practice / timed / vault_review
//          assessmentId?: uuid }      // live
//   -> { attemptId, sessionId, mode, questions[], deadlineAt, ... }
//
// The fp_attempts row is opened HERE, with the service-role client, after the
// caller's own fp_students row has been resolved through RLS. fp_attempts'
// write policy is fn_fp_can_manage_student (owner / Senior Learner), so a
// learner cannot insert their own row directly — fn_fp_record_attempt does the
// same insert inside SECURITY DEFINER. `mode` and `session_id` are set on
// create (decision 17 / decision 9).
//
// Questions are served WITHOUT answers (allow-list projection). Correctness is
// only ever returned by the respond route, from fn_onemark_record_response.
//
// RUNTIME DEPENDS ON LANE S: fn_onemark_vault_draw (vault_review mode) and the
// tn_hsc_* practice pools are created by Lane S's migration. Until it is
// applied, vault review reports "not set up yet" and practice/timed report
// "Practice is not set up for this subject yet."

interface StartBody {
  mode?: string;
  examDefinitionId?: string;
  assessmentId?: string;
}

function isMode(v: unknown): v is OneMarkAttemptMode {
  return typeof v === 'string' && (ONEMARK_MODES as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// GET — the learner's OneMark home
// ---------------------------------------------------------------------------

export async function GET() {
  await connection();
  try {
    const caller = await resolveCaller();
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status });
    }
    if (!caller.learner) {
      return NextResponse.json({ learner: null, subjects: [], live: [], vault: [], policy: null });
    }
    const learner = caller.learner;
    const admin = adminClient();

    const [minutes, questionCount] = await Promise.all([
      timedMinutes(admin),
      sittingQuestionCount(admin),
    ]);

    // ---- Subjects: the two Class-12 rows, with their standing pool ----------
    const { data: exams, error: examError } = await admin
      .from('exam_definitions')
      .select('id, config_key, display_name, is_active')
      .in('config_key', ONEMARK_EXAM_KEYS)
      .eq('is_active', true);
    if (examError) {
      return NextResponse.json({ error: examError.message }, { status: 400 });
    }

    const examIds = (exams ?? []).map((e: any) => e.id);
    const { data: pools } = examIds.length
      ? await admin
          .from('fp_assessments')
          .select('id, exam_definition_id')
          .in('exam_definition_id', examIds)
          .eq('kind', 'practice')
          .is('cohort_id', null)
          .eq('is_active', true)
      : { data: [] };
    const poolByExam = new Map<string, string>(
      (pools ?? []).map((p: any) => [p.exam_definition_id, p.id]),
    );

    const subjects = [];
    for (const exam of exams ?? []) {
      const { count } = await admin
        .from('fp_items')
        .select('id', { count: 'exact', head: true })
        .eq('exam_definition_id', exam.id)
        .eq('is_active', true);
      subjects.push({
        examDefinitionId: exam.id,
        key: exam.config_key,
        name: exam.display_name,
        questionCount: count ?? 0,
        poolReady: poolByExam.has(exam.id),
      });
    }
    subjects.sort((a, b) => a.name.localeCompare(b.name));

    // ---- Live-assigned papers for the cohorts this learner is enrolled in --
    const { data: enrolments } = await admin
      .from('fp_enrollments')
      .select('cohort_id')
      .eq('student_id', learner.id)
      .eq('status', 'enrolled');
    const cohortIds = (enrolments ?? []).map((e: any) => e.cohort_id);

    const { data: papers } = cohortIds.length
      ? await admin
          .from('fp_assessments')
          .select('id, title, exam_definition_id, cohort_id, config, exam:exam_definitions!inner(display_name)')
          .in('cohort_id', cohortIds)
          .eq('kind', 'mock')
          .eq('is_active', true)
      : { data: [] };

    const paperIds = (papers ?? []).map((p: any) => p.id);
    const { data: liveAttempts } = paperIds.length
      ? await admin
          .from('fp_attempts')
          .select(ATTEMPT_COLUMNS)
          .eq('student_id', learner.id)
          .eq('mode', 'live')
          .in('assessment_id', paperIds)
      : { data: [] };
    const attemptByPaper = new Map<string, any>();
    for (const a of liveAttempts ?? []) {
      // A submitted attempt wins over an in-progress one for display.
      const prev = attemptByPaper.get(a.assessment_id);
      if (!prev || a.status === 'submitted') attemptByPaper.set(a.assessment_id, a);
    }

    const now = Date.now();
    const live = [];
    for (const p of papers ?? []) {
      const cfg = p.config ?? {};
      // Only a paper that has been published digitally has an open window.
      if (!cfg.open_at) continue;
      const opensAt = new Date(cfg.open_at).getTime();
      const closesAt = cfg.close_at ? new Date(cfg.close_at).getTime() : null;
      const attempt = attemptByPaper.get(p.id);
      let status: 'submitted' | 'in_progress' | 'upcoming' | 'open' | 'closed';
      if (attempt?.status === 'submitted') status = 'submitted';
      else if (attempt?.status === 'in_progress') status = 'in_progress';
      else if (now < opensAt) status = 'upcoming';
      else if (closesAt !== null && now > closesAt) status = 'closed';
      else status = 'open';

      const { count } = await admin
        .from('fp_assessment_items')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', p.id);

      live.push({
        assessmentId: p.id,
        title: p.title,
        examDefinitionId: p.exam_definition_id,
        examName: p.exam?.display_name ?? null,
        opensAt: cfg.open_at,
        closesAt: cfg.close_at ?? null,
        durationMin: Number.isFinite(Number(cfg.duration_min)) ? Number(cfg.duration_min) : null,
        questionCount: count ?? 0,
        status,
        attemptId: attempt?.id ?? null,
      });
    }

    // ---- Mistake Vault, summarised per subject ------------------------------
    // The learner can read their own vault rows under RLS, but the rows only
    // carry item ids; which SUBJECT an item belongs to lives on fp_items, which
    // a learner cannot read. So the grouping happens here, above RLS, and only
    // counts and dates go back — never an item.
    // Only items still ACTIVE in the bank — the same filter fn_onemark_vault_draw
    // applies — so the count promised here is the count the draw can serve.
    const { data: vaultRows } = await admin
      .from('onemark_mistake_vault')
      .select('item_id, status, next_eligible_at, item:fp_items!inner(exam_definition_id, is_active)')
      .eq('student_id', learner.id)
      .eq('item.is_active', true);

    const vaultByExam = new Map<
      string,
      { active: number; eligibleNow: number; mastered: number; nextEligibleAt: string | null }
    >();
    for (const row of vaultRows ?? []) {
      const examId = row.item?.exam_definition_id;
      if (!examId) continue;
      const bucket = vaultByExam.get(examId) ?? {
        active: 0,
        eligibleNow: 0,
        mastered: 0,
        nextEligibleAt: null,
      };
      if (row.status === 'mastered') {
        bucket.mastered += 1;
      } else {
        bucket.active += 1;
        const eligibleAt = row.next_eligible_at ? new Date(row.next_eligible_at).getTime() : 0;
        if (eligibleAt <= now) {
          bucket.eligibleNow += 1;
        } else if (
          !bucket.nextEligibleAt ||
          eligibleAt < new Date(bucket.nextEligibleAt).getTime()
        ) {
          bucket.nextEligibleAt = row.next_eligible_at;
        }
      }
      vaultByExam.set(examId, bucket);
    }
    const vault = subjects.map((s) => ({
      examDefinitionId: s.examDefinitionId,
      ...(vaultByExam.get(s.examDefinitionId) ?? {
        active: 0,
        eligibleNow: 0,
        mastered: 0,
        nextEligibleAt: null,
      }),
    }));

    return NextResponse.json({
      learner: { id: learner.id, full_name: learner.full_name, grade: learner.grade },
      subjects,
      live,
      vault,
      policy: { timedMinutes: minutes, questionCount },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load OneMark' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — open one sitting
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();
  try {
    let body: StartBody = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }

    if (!isMode(body.mode)) {
      return NextResponse.json(
        { error: `mode must be one of ${ONEMARK_MODES.join(', ')}` },
        { status: 400 },
      );
    }
    const mode = body.mode;
    if (mode === 'live') {
      if (!body.assessmentId || !UUID_RE.test(body.assessmentId)) {
        return NextResponse.json({ error: 'assessmentId must be a uuid' }, { status: 400 });
      }
    } else if (!body.examDefinitionId || !UUID_RE.test(body.examDefinitionId)) {
      return NextResponse.json({ error: 'examDefinitionId must be a uuid' }, { status: 400 });
    }

    const caller = await resolveCaller();
    if (!caller.ok) {
      return NextResponse.json({ error: caller.error }, { status: caller.status });
    }
    if (!caller.learner) {
      return NextResponse.json(
        { error: 'You are not enrolled on the Foundation programme.' },
        { status: 403 },
      );
    }
    const learner = caller.learner;
    const supabase = caller.supabase;
    const admin = adminClient();

    if (await parentalConsentBlocks(admin, learner)) {
      return NextResponse.json(
        {
          error:
            'A parent or guardian still needs to give permission before you can sit a paper. Please ask whoever set up your account.',
        },
        { status: 403 },
      );
    }

    const [minutes, questionCount] = await Promise.all([
      timedMinutes(admin),
      sittingQuestionCount(admin),
    ]);

    let assessmentId: string;
    let examDefinitionId: string;
    let assessmentTitle: string | null = null;
    let assessmentConfig: any = null;
    let questions: LearnerItem[] = [];
    let resumedAttempt: any = null;
    let alreadyAnswered: string[] = [];
    let optionsShuffled = false;

    if (mode === 'live') {
      // ---- Live-assigned paper -------------------------------------------
      const { data: paper } = await admin
        .from('fp_assessments')
        .select('id, title, exam_definition_id, cohort_id, kind, is_active, config')
        .eq('id', body.assessmentId)
        .maybeSingle();
      if (!paper || paper.kind !== 'mock' || !paper.is_active || !paper.cohort_id) {
        return NextResponse.json({ error: 'That paper could not be found.' }, { status: 404 });
      }
      const { data: enrolment } = await admin
        .from('fp_enrollments')
        .select('id')
        .eq('student_id', learner.id)
        .eq('cohort_id', paper.cohort_id)
        .eq('status', 'enrolled')
        .maybeSingle();
      if (!enrolment) {
        return NextResponse.json(
          { error: 'This paper was not assigned to your group.' },
          { status: 403 },
        );
      }
      const cfg = paper.config ?? {};
      const now = Date.now();

      // Decision 19 — one submission. The learner's earlier attempts on this
      // paper are read BEFORE the window is tested, because what they mean
      // does not depend on the window: a finished attempt always answers
      // with its result, and an interrupted one is either resumed (window
      // still open) or closed on the spot (window shut) — never left
      // in_progress behind a "This paper has closed" wall with no way to
      // submit what stands.
      const { data: priorAttempts } = await admin
        .from('fp_attempts')
        .select(ATTEMPT_COLUMNS)
        .eq('student_id', learner.id)
        .eq('assessment_id', paper.id)
        .eq('mode', 'live')
        .order('started_at', { ascending: false });
      const submitted = (priorAttempts ?? []).find((a: any) => a.status === 'submitted');
      if (submitted) {
        return NextResponse.json(
          {
            error: 'You have already submitted this paper. It can be sat once.',
            alreadySubmitted: true,
            attemptId: submitted.id,
          },
          { status: 409 },
        );
      }
      const interrupted =
        (priorAttempts ?? []).find((a: any) => a.status === 'in_progress') ?? null;

      const windowClosed = Boolean(cfg.close_at) && now > new Date(cfg.close_at).getTime();
      if (interrupted) {
        // Its own clock: the paper's duration from when it was started, or
        // the close time, whichever comes first — plus the same slack the
        // respond route gives a late tap.
        const ownDeadline = deadlineFor(interrupted, {
          timedMinutes: minutes,
          assessmentConfig: cfg,
        });
        const clockOut = ownDeadline !== null && now > ownDeadline + DEADLINE_GRACE_MS;
        if (windowClosed || clockOut) {
          // Close it server-side: every paper question without a response
          // goes in as a SKIP (decision 18), then the RPC submits. The
          // caller is told the same way as a repeat sitting, with the
          // attempt id, so the page shows the result that stands.
          const blanks = await liveBlankItemIds(admin, interrupted);
          const outcome = await closeSitting(supabase, interrupted.id, blanks);
          if (outcome.error) {
            return NextResponse.json(
              { error: outcome.error.message },
              { status: outcome.error.status },
            );
          }
          return NextResponse.json(
            {
              error: windowClosed
                ? 'This paper closed while your sitting was open. What you had answered has been submitted.'
                : 'Time ran out on this sitting. What you had answered has been submitted.',
              alreadySubmitted: true,
              autoClosed: true,
              attemptId: interrupted.id,
            },
            { status: 409 },
          );
        }
      }

      if (!cfg.open_at) {
        return NextResponse.json({ error: 'This paper has not been opened yet.' }, { status: 403 });
      }
      if (now < new Date(cfg.open_at).getTime()) {
        return NextResponse.json(
          { error: 'This paper is not open yet.', opensAt: cfg.open_at },
          { status: 403 },
        );
      }
      if (windowClosed) {
        return NextResponse.json(
          { error: 'This paper has closed.', closedAt: cfg.close_at },
          { status: 403 },
        );
      }

      // An interrupted sitting resumes rather than starting a second row.
      resumedAttempt = interrupted;

      const { data: paperItems, error: paperItemsError } = await admin
        .from('fp_assessment_items')
        .select(`position, item:fp_items!inner(${LEARNER_ITEM_COLUMNS})`)
        .eq('assessment_id', paper.id)
        .order('position', { ascending: true });
      if (paperItemsError) {
        return NextResponse.json({ error: paperItemsError.message }, { status: 400 });
      }
      questions = (paperItems ?? [])
        .map((r: any) => r.item)
        .filter((it: any) => it && it.is_active)
        .map(projectItemForLearner);
      if (cfg.shuffle_options === true) {
        // One order per question, applied to BOTH languages by key — the
        // Tamil options survive the shuffle and the answer key still matches.
        questions = questions.map(shuffleOptionsTogether);
        optionsShuffled = true;
      }
      assessmentId = paper.id;
      examDefinitionId = paper.exam_definition_id;
      assessmentTitle = paper.title;
      assessmentConfig = cfg;
    } else {
      // ---- Practice / timed / vault review: the subject's standing pool -----
      examDefinitionId = body.examDefinitionId!;
      const { data: pool } = await admin
        .from('fp_assessments')
        .select('id, title')
        .eq('exam_definition_id', examDefinitionId)
        .eq('kind', 'practice')
        .is('cohort_id', null)
        .eq('is_active', true)
        .maybeSingle();
      if (!pool) {
        return NextResponse.json(
          { error: 'Practice is not set up for this subject yet.' },
          { status: 404 },
        );
      }
      assessmentId = pool.id;
      assessmentTitle = pool.title;

      if (mode === 'vault_review') {
        // The draw is the RPC's — ordering, eligibility and the 60% single-
        // chapter cap all live server-side in fn_onemark_vault_draw. Called
        // through the SESSION client so its own fn_fp_can_view_student check
        // runs as the caller.
        const { data: drawn, error: drawError } = await (supabase as any).rpc(
          'fn_onemark_vault_draw',
          {
            p_student_id: learner.id,
            p_exam_definition_id: examDefinitionId,
            p_count: questionCount,
          },
        );
        if (drawError) {
          const missing = /could not find the function|does not exist/i.test(
            drawError.message ?? '',
          );
          return NextResponse.json(
            {
              error: missing
                ? 'Vault review is not set up yet.'
                : 'Your vault could not be read right now.',
            },
            { status: missing ? 503 : 400 },
          );
        }
        const ids: string[] = (drawn ?? [])
          .map((d: any) => (typeof d === 'string' ? d : d?.fn_onemark_vault_draw ?? d?.id))
          .filter((id: any) => typeof id === 'string' && UUID_RE.test(id));
        if (ids.length === 0) {
          return NextResponse.json(
            { error: 'Nothing in your vault is due for review yet.', empty: true },
            { status: 409 },
          );
        }
        // A short draw is NORMAL, not an error: the RPC caps any single
        // chapter at onemark.vault.max_single_chapter_pct of the request and
        // never pads (decision 13), so asking for 15 can rightly return 3.
        // The real number is shown (decision 11's idiom) — see `requested`.
        const { data: items } = await admin
          .from('fp_items')
          .select(LEARNER_ITEM_COLUMNS)
          .in('id', ids);
        const byId = new Map((items ?? []).map((it: any) => [it.id, it]));
        // Keep the RPC's order (least-recently-wrong first).
        questions = ids
          .map((id) => byId.get(id))
          .filter((it: any) => it && it.is_active)
          .map(projectItemForLearner);
      } else {
        const { data: items, error: itemsError } = await admin
          .from('fp_items')
          .select(LEARNER_ITEM_COLUMNS)
          .eq('exam_definition_id', examDefinitionId)
          .eq('is_active', true)
          .limit(1000);
        if (itemsError) {
          return NextResponse.json({ error: itemsError.message }, { status: 400 });
        }
        if (!items || items.length === 0) {
          return NextResponse.json(
            { error: 'There are no questions ready for this subject yet.' },
            { status: 404 },
          );
        }

        // Drop questions enough different people have reported — the same
        // rule and the same policy key the Foundation practice draw applies.
        const threshold = await readPolicyInt(
          admin,
          'foundation.item_flag.suppress_threshold',
          DEFAULT_FLAG_THRESHOLD,
        );
        const itemIds = items.map((it: any) => it.id);
        const { data: openFlags } = await admin
          .from('fp_item_flags')
          .select('item_id, flagged_by')
          .eq('status', 'open')
          .in('item_id', itemIds);
        const reportersByItem = new Map<string, Set<string>>();
        for (const f of openFlags ?? []) {
          if (!reportersByItem.has(f.item_id)) reportersByItem.set(f.item_id, new Set());
          reportersByItem.get(f.item_id)!.add(f.flagged_by);
        }
        const usable = items.filter(
          (it: any) => (reportersByItem.get(it.id)?.size ?? 0) < threshold,
        );
        if (usable.length === 0) {
          return NextResponse.json(
            { error: 'Every question in this subject is waiting to be checked. Please try again later.' },
            { status: 404 },
          );
        }

        // Unseen first, then repeats; random within each group.
        const { data: myAttempts } = await admin
          .from('fp_attempts')
          .select('id')
          .eq('student_id', learner.id);
        const attemptIds = (myAttempts ?? []).map((a: any) => a.id);
        const { data: answered } = attemptIds.length
          ? await admin.from('fp_responses').select('item_id').in('attempt_id', attemptIds)
          : { data: [] };
        const seen = new Set((answered ?? []).map((r: any) => r.item_id));
        const fresh = shuffle(usable.filter((it: any) => !seen.has(it.id)));
        const repeats = shuffle(usable.filter((it: any) => seen.has(it.id)));
        questions = [...fresh, ...repeats].slice(0, questionCount).map(projectItemForLearner);
      }
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'There are no questions ready for this sitting.' },
        { status: 404 },
      );
    }

    // ---- The attempt row -----------------------------------------------------
    let attempt: any = resumedAttempt;
    if (attempt) {
      const { data: done } = await admin
        .from('fp_responses')
        .select('item_id')
        .eq('attempt_id', attempt.id);
      alreadyAnswered = (done ?? []).map((r: any) => r.item_id);
    } else {
      const { data: created, error: createError } = await admin
        .from('fp_attempts')
        .insert({
          student_id: learner.id,
          assessment_id: assessmentId,
          status: 'in_progress',
          mode,
          session_id: crypto.randomUUID(),
        })
        .select(ATTEMPT_COLUMNS)
        .single();
      if (createError || !created) {
        return NextResponse.json(
          { error: createError?.message ?? 'The sitting could not be opened.' },
          { status: 400 },
        );
      }
      attempt = created;
    }

    const deadline = deadlineFor(attempt, { timedMinutes: minutes, assessmentConfig });

    // Bind the drawn set to this attempt. Practice / timed / vault review
    // must hand this back on every respond / finalize; a live paper's set is
    // fp_assessment_items, so the token is issued but not required there.
    const servedToken = signServedSet(
      attempt.id,
      questions.map((q) => q.id),
    );

    return NextResponse.json({
      attemptId: attempt.id,
      sessionId: attempt.session_id,
      servedToken,
      mode,
      examDefinitionId,
      assessmentId,
      assessmentTitle,
      startedAt: attempt.started_at,
      deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      lockedNavigation: mode === 'live',
      revealAfterAnswer: mode === 'practice' || mode === 'vault_review',
      // When true the runner labels options by POSITION (A, B, C, D down the
      // column) while still sending the bank key, so a shuffled paper does
      // not read C / A / D / B.
      optionsShuffled,
      resumed: Boolean(resumedAttempt),
      alreadyAnswered,
      // How many were asked for vs served. A vault review can be shorter
      // than requested by design (decision 13); a live paper is its own size.
      requested: mode === 'live' ? questions.length : questionCount,
      drawn: questions.length,
      questions,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not open the sitting' },
      { status: 500 },
    );
  }
}
