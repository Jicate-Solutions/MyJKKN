// app/api/cron/work-signal-suggestions/route.ts
// Weekly personalized suggestion loop — ONE kind, specific, actionable
// suggestion per staff member, grounded ONLY in their own measured
// work-signals. Mirrors the curriculum-lesson-spine ₹0 Max-lane pattern:
//
//   • ENQUEUE (default run, Mondays via vercel.json): pick subjects with real
//     signal activity (OD approval queue — pending now or decided in 30d),
//     assemble a grounded prompt each, enqueueJobsLane (in-flight guard =
//     dedupe per person-week).
//   • COLLECT (?mode=collect, hourly): drain done ai_jobs, parse the one-line
//     JSON, record via fn_work_signal_suggestion_upsert (service_role-only
//     writer; a verdicted week is never overwritten).
//
// DOCTRINE (same as fn_work_signals_for): acts, not scores. The suggestion is
// never a rating, never a peer comparison, never auto-applied — it is text on
// the subject's own dashboard that only they can see and only they verdict
// (tried_helped / tried_no_change / not_tried, the SCF vocabulary). The
// verdict feeds the next week's prompt.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOB_TYPE = 'worksignals.weekly_suggestion';
const MAX_SUBJECTS_PER_RUN = 40;

type SubjectSignals = {
  profile_id: string;
  email: string;
  od_pending: number;
  od_oldest_days: number;
  od_decided_30d: number;
};

type SuggestionCtx = {
  subject_profile_id: string;
  subject_email: string;
  week_start: string; // YYYY-MM-DD (IST Monday)
  signals: Record<string, number>;
};

/** Monday of the current week in IST, as YYYY-MM-DD. */
function istWeekStart(): string {
  const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
  const dow = nowIst.getUTCDay(); // 0=Sun
  const back = dow === 0 ? 6 : dow - 1;
  nowIst.setUTCDate(nowIst.getUTCDate() - back);
  return nowIst.toISOString().slice(0, 10);
}

function buildPrompt(s: SubjectSignals, priorVerdictLine: string): string {
  return [
    'You draft ONE short weekly suggestion for a JKKN team member, grounded ONLY in their measured work-signals below.',
    '',
    'Their signals this week (their own approval queue for learner on-duty/leave requests):',
    `- Requests waiting on them right now: ${s.od_pending}`,
    `- Oldest waiting request: ${s.od_oldest_days} day(s)`,
    `- Requests they decided in the last 30 days: ${s.od_decided_30d}`,
    priorVerdictLine,
    '',
    'Rules:',
    '- ONE suggestion only, 1–3 sentences, concrete and doable within the week.',
    '- Kind and practical — never evaluative, never a score, never compare them to anyone.',
    '- Anchor it in the numbers above (e.g., which end of the queue to start with, a batching habit, a time-box).',
    '- If the queue is empty and activity is healthy, say so and suggest one small way to keep the loop fast.',
    '- Use JKKN terminology: say "learner" and "Senior Learner" — never the conventional campus words for those roles.',
    '- Every waiting request is a learner personally waiting on an answer — that is the why, and it may be said plainly.',
    '',
    'Output STRICT JSON only, no markdown fences, exactly: {"suggestion": "<your 1-3 sentence suggestion>"}',
  ].join('\n');
}

/** Tolerant parse of the model's JSON (strips accidental fences). */
function parseSuggestion(raw: unknown): string | null {
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.suggestion === 'string') return o.suggestion.trim() || null;
    // The Max seat wraps model output as {"answer": "<json-string>"} —
    // unwrap it (verified on the maiden job, 2026-07-25).
    if (typeof o.answer === 'string') text = o.answer;
    else if (typeof o.text === 'string') text = o.text;
    else text = JSON.stringify(raw);
  }
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  try {
    const j = JSON.parse(stripped);
    if (j && typeof j.suggestion === 'string') return j.suggestion.trim() || null;
  } catch {
    const m = stripped.match(/"suggestion"\s*:\s*"([\s\S]*?)"\s*}/);
    if (m) return m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() || null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const collectOnly = request.nextUrl.searchParams.get('mode') === 'collect';
  const weekStart = istWeekStart();

  // ── COLLECT first (both modes): drain done jobs → record drafts ──────────
  let collected = 0;
  let recorded = 0;
  // REPAIR (2026-08-26): this loop shipped reading item.payload/.result/.id,
  // but collectJobsLane has returned CollectedJobsLaneItem
  // { jobId, jobType, context, message } since #2310 — so ctx was ALWAYS
  // undefined, every drafted suggestion was claimed (fn_ai_collect_claim
  // stamps delivered_at) and then silently dropped, and `recorded` could
  // never move. Rewritten to the real lane API (house pattern:
  // scf-learner-notes' collector — context cast + text blocks off message).
  const items = await collectJobsLane(admin, [JOB_TYPE], 50);
  for (const item of items) {
    collected++;
    const ctx = item.context as unknown as SuggestionCtx | undefined;
    if (!ctx?.subject_profile_id) continue;
    let resultText: string | null = null;
    if (item.message) {
      for (const block of item.message.content) {
        if (block.type === 'text') resultText = (resultText ?? '') + block.text;
      }
    }
    const suggestion = parseSuggestion(resultText);
    if (!suggestion) {
      console.warn(`[cron/work-signal-suggestions] unparseable result for job ${item.jobId}`);
      continue;
    }
    const { data, error } = await admin.rpc('fn_work_signal_suggestion_upsert', {
      p_subject_profile_id: ctx.subject_profile_id,
      p_subject_email: ctx.subject_email,
      p_week_start: ctx.week_start,
      p_suggestion: suggestion,
      p_ai_draft: { raw: resultText },
      p_signals_snapshot: ctx.signals ?? {},
    });
    if (error) {
      console.error(`[cron/work-signal-suggestions] upsert failed: ${error.message}`);
    } else if ((data as { success?: boolean } | null)?.success) {
      recorded++;
    }
  }

  // ── ENQUEUE (weekly run only) ─────────────────────────────────────────────
  let enqueued = 0;
  let skipped = 0;
  let termClosed = 0;
  let deltasMeasured = 0;
  if (!collectOnly) {
    // ── Adoption-delta ride-along (weekly, same clock) ──────────────────────
    // The return edge's measurement leg: for suggestions the subject marked
    // tried (tried_helped / tried_no_change — the adoption mark), record next
    // week's od_* signals minus the suggestion week's snapshot.
    // fn_work_signal_suggestion_measure_deltas is service_role-only and only
    // measures rows at least a week old, so the weekly clock makes the
    // re-read land one week after the snapshot. Failures are logged, never
    // fatal — the measurement must not break the loop it rides on.
    {
      const { data: dm, error: dmErr } = await admin.rpc(
        'fn_work_signal_suggestion_measure_deltas',
      );
      if (dmErr) {
        console.warn(`[cron/work-signal-suggestions] delta measure skipped: ${dmErr.message}`);
      } else {
        deltasMeasured = Number(dm ?? 0);
      }
    }

    // ── Term-close ride-along (weekly, same clock — spec decision 7) ────────
    // Two-sided close for re-explanation asks: still-silent asks whose
    // academic year has ENDED close as 'term_ended_unreported' — excluded
    // from all rates, counted against no one. fn_clarification_term_close is
    // service_role-only and no-ops when the classroom_practice.acts kill
    // switch is off. Failures are logged, never fatal — this ride-along must
    // not break the suggestion loop it piggybacks on.
    {
      const { data: tc, error: tcErr } = await admin.rpc('fn_clarification_term_close');
      if (tcErr) {
        console.warn(`[cron/work-signal-suggestions] term close skipped: ${tcErr.message}`);
      } else {
        termClosed = Number((tc as { closed?: number } | null)?.closed ?? 0);
      }
    }

    // Subjects = people with real queue activity: pending now OR decided in
    // 30d — the same canonical source as fn_work_signals_for's od_* signals.
    // Direct aggregate as service_role (bypasses RLS by design for a cron).
    const { data: agg, error: aggErr } = await admin
      .from('leave_onduty_approvals')
      .select('approver_id, status, created_at, action_taken_at')
      .or(
        `status.eq.pending,action_taken_at.gte.${new Date(Date.now() - 30 * 86400 * 1000).toISOString()}`,
      )
      .limit(5000);
    if (aggErr) {
      return NextResponse.json(
        { ok: false, error: `subject sweep failed: ${aggErr.message}`, collected, recorded },
        { status: 500 },
      );
    }
    const byApprover = new Map<string, { pending: number; oldest: number; decided: number }>();
    const now = Date.now();
    for (const r of agg ?? []) {
      const a = byApprover.get(r.approver_id) ?? { pending: 0, oldest: 0, decided: 0 };
      if (String(r.status) === 'pending') {
        a.pending++;
        const days = Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
        if (days > a.oldest) a.oldest = days;
      } else if (r.action_taken_at) {
        a.decided++;
      }
      byApprover.set(r.approver_id, a);
    }
    let subjects: SubjectSignals[] = [];
    const ids = [...byApprover.keys()];
    if (ids.length > 0) {
      const { data: profs } = await admin.from('profiles').select('id, email').in('id', ids);
      const emailById = new Map((profs ?? []).map((p) => [p.id, p.email as string]));
      subjects = ids
        .filter((id) => emailById.get(id))
        .map((id) => {
          const a = byApprover.get(id)!;
          return {
            profile_id: id,
            email: emailById.get(id)!,
            od_pending: a.pending,
            od_oldest_days: a.oldest,
            od_decided_30d: a.decided,
          };
        });
    }

    // Deepest queues first — the people whose week a suggestion helps most.
    subjects.sort((a, b) => b.od_pending - a.od_pending);
    subjects = subjects.slice(0, MAX_SUBJECTS_PER_RUN);

    for (const s of subjects) {
      // Last week's verdict (if any) feeds the prompt — the learning signal.
      const { data: prior } = await admin
        .from('work_signal_suggestions')
        .select('human_verdict, suggestion')
        .eq('subject_profile_id', s.profile_id)
        .lt('week_start', weekStart)
        .not('human_verdict', 'is', null)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      const priorVerdictLine = prior
        ? `- Last week they marked the previous suggestion ("${String(prior.suggestion).slice(0, 120)}") as: ${prior.human_verdict}.`
        : '- No previous suggestion verdict exists yet.';

      const ctx: SuggestionCtx = {
        subject_profile_id: s.profile_id,
        subject_email: s.email,
        week_start: weekStart,
        signals: {
          od_pending: s.od_pending,
          od_oldest_days: s.od_oldest_days,
          od_decided_30d: s.od_decided_30d,
        },
      };
      const r = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: buildPrompt(s, priorVerdictLine),
        context: ctx,
        dedupeKey: `wsug-${s.profile_id}-${weekStart}`,
      });
      if (r.ok) enqueued++;
      else skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    mode: collectOnly ? 'collect' : 'weekly',
    week_start: weekStart,
    collected,
    recorded,
    enqueued,
    skipped,
    term_closed: termClosed,
    deltas_measured: deltasMeasured,
  });
}
