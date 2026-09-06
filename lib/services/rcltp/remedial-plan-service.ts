// =============================================================================
// RCLTP remedial-plan draft loop — Slice 2: generation service (SERVER-ONLY)
// =============================================================================
// The "give Senior Learners their learning-studio time back" build. An at-risk
// reader flagged by RCLTP (low_band | regression) gets an AI-drafted remedial
// reading plan; the Senior Learner reviews, edits, and approves it (Slice 3).
//
// This module owns the GENERATION half:
//   • buildGroundingForLearner — read the learner's real RCLTP standing + weak
//     comprehension areas (the SAME at-risk rule the principal dashboard uses).
//   • enqueueRemedialPlanDraft — write a 'queued' placeholder + enqueue the job
//     on the ₹0 Max lane (async; drained by the Windows seat, collected later).
//   • generateDraftDirect — a synchronous Anthropic path (immediate generation /
//     deterministic proof) that produces the SAME 'draft' row via the SAME RPC.
//   • parsePlanMessage / recordDraft — collect-side: parse the model text and
//     write status='draft' via fn_rcltp_remedial_plan_ai_draft_upsert.
//
// AI is the author; the Senior Learner is the authority. Nothing here ever writes
// status='approved' — only fn_rcltp_remedial_plan_approve (a permissioned human
// action) does. English only (Nattraja CBSE is English-medium).
//
// SERVER-ONLY: imports the service-role client + Anthropic SDK. Never import into
// a client component.
// =============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import { enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import type { RcltpRemedialPlanDraft } from '@/types/rcltp';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** The ai_job_types row seeded in the Slice-1 migration (lane='max' = ₹0). */
export const REMEDIAL_PLAN_JOB_TYPE = 'rcltp.remedial_plan_draft';

// ── types ────────────────────────────────────────────────────────────────────

/** The snapshot the generator RPC needs — identical whether it comes from live
 *  grounding (enqueue/direct) or a job's stashed _ctx (async collect). */
export interface DraftSnapshot {
  institutionId: string;
  learnerId: string;
  assessmentId: string;
  cycleNo: number;
  triggerReason: 'low_band' | 'regression';
  band: string;
  overall: number;
}

interface WeakArea {
  competency: string;
  missed: number;
  total: number;
  sampleQuestions: string[];
}

/** Full grounding — the snapshot plus the human-readable context used only to
 *  BUILD the prompt (never persisted as the trigger snapshot). */
export interface Grounding extends DraftSnapshot {
  learnerName: string;
  gradeLevel: number | null;
  previousOverall: number | null;
  readingScore: number | null;
  comprehensionScore: number | null;
  weakAreas: WeakArea[];
}

/** The AI-drafted plan shape stored in ai_draft (and later edited_content).
 *  Single-sourced in types/rcltp.ts (shared with the client review UI). */
export type RemedialPlanDraft = RcltpRemedialPlanDraft;

// ── prompt ─────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are drafting a short REMEDIAL READING PLAN for one at-risk learner in an Indian CBSE school (English-medium). The plan is a DRAFT: a Senior Learner will review, edit, and approve it before it is used — so write a strong, specific first draft they can adjust, not a finished prescription.

You will receive the learner's latest RCLTP reading-assessment standing (band, scores, and the trigger that flagged them) plus their weak comprehension areas from the most recent cycle. Ground EVERY focus area and activity in that data — do not invent weaknesses the data does not show. Keep the reading level appropriate for the learner's grade. All content is English only.

Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{
  "summary": "2-3 plain-English sentences: where this learner stands now and what this plan aims to move.",
  "focus_areas": [{"area": "short label of one comprehension skill to strengthen", "why": "one sentence tying it to THIS learner's data"}],
  "activities": [{"title": "short activity name", "detail": "1-2 sentences a Senior Learner can run one-on-one with the learner", "cadence": "e.g. '3x per week, 10 min'"}],
  "target_band": "the realistic reading band to aim for by the next cycle"
}
Provide 2-4 focus_areas and 3-5 activities, each concretely tied to the weak areas provided. Use warm, encouraging, non-clinical language suitable for a young reader's plan.`;

function triggerSentence(reason: 'low_band' | 'regression'): string {
  return reason === 'low_band'
    ? 'currently in the lowest reading band (Emergent)'
    : 'their overall reading score dropped compared with the previous cycle (a regression)';
}

export function buildUserPrompt(g: Grounding): string {
  const weak =
    g.weakAreas.length > 0
      ? g.weakAreas
          .map(
            (w) =>
              `- ${w.competency}: missed ${w.missed} of ${w.total}.` +
              (w.sampleQuestions.length
                ? ` Examples missed: ${w.sampleQuestions.join(' | ')}`
                : ''),
          )
          .join('\n')
      : '- (no per-competency breakdown available for this cycle)';

  return `Learner: ${g.learnerName || 'this learner'} — Grade ${g.gradeLevel ?? 'unknown'}, RCLTP reading cycle ${g.cycleNo}.
Trigger: this learner is ${triggerSentence(g.triggerReason)}.
Current overall band: ${g.band}. Current overall score: ${g.overall}${
    g.previousOverall != null ? ` (previous cycle: ${g.previousOverall})` : ''
  }.
Read-aloud (Part A) score: ${g.readingScore ?? 'not recorded'}. Comprehension (Part B) score: ${g.comprehensionScore ?? 'not recorded'}.

Weak comprehension areas from this cycle's Part B:
${weak}

Draft the remedial reading plan JSON for this learner now.`;
}

// ── grounding ────────────────────────────────────────────────────────────────

/**
 * Read one learner's latest RCLTP standing + weak areas and, IF the learner is
 * currently at-risk, return the full grounding. Returns null when the learner
 * has no scored sitting, no cycle number, or is NOT at-risk — the exact rule the
 * principal dashboard applies (band='emergent' → low_band; else a drop vs the
 * previous overall → regression). The generator never drafts for a learner the
 * dashboard would not flag, so the two can never disagree.
 */
export async function buildGroundingForLearner(
  admin: Admin,
  learnerId: string,
): Promise<Grounding | null> {
  // rcltp_ tables are absent from the generated Database type — cast per the
  // rcltp service-layer convention (see results-service.ts).
  const db = admin as unknown as {
    from: (t: string) => any;
  };

  const { data: res } = await db
    .from('rcltp_assessment_results')
    .select(
      'assessment_id, overall_band, overall_score, previous_overall_score, reading_score, comprehension_score',
    )
    .eq('learner_id', learnerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!res) return null;

  const { data: asmt } = await db
    .from('rcltp_assessments')
    .select('cycle_no, grade_level, institution_id')
    .eq('id', res.assessment_id)
    .maybeSingle();
  // A cycle number is required — it is the active-plan uniqueness key.
  if (!asmt || asmt.cycle_no == null) return null;

  const band: string = res.overall_band;
  const overall = Number(res.overall_score);
  const previousOverall =
    res.previous_overall_score != null ? Number(res.previous_overall_score) : null;

  let triggerReason: 'low_band' | 'regression' | null = null;
  if (band === 'emergent') triggerReason = 'low_band';
  else if (previousOverall != null && overall < previousOverall) triggerReason = 'regression';
  if (!triggerReason) return null; // not at-risk → nothing to draft

  const { data: lp } = await db
    .from('learners_profiles')
    .select('first_name, last_name')
    .eq('id', learnerId)
    .maybeSingle();
  const learnerName =
    [lp?.first_name, lp?.last_name].filter(Boolean).join(' ').trim() || '';

  const weakAreas = await buildWeakAreas(db, res.assessment_id);

  return {
    institutionId: asmt.institution_id,
    learnerId,
    assessmentId: res.assessment_id,
    cycleNo: asmt.cycle_no,
    triggerReason,
    band,
    overall,
    learnerName,
    gradeLevel: asmt.grade_level ?? null,
    previousOverall,
    readingScore: res.reading_score != null ? Number(res.reading_score) : null,
    comprehensionScore:
      res.comprehension_score != null ? Number(res.comprehension_score) : null,
    weakAreas,
  };
}

/** Group this sitting's INCORRECT Part B responses by competency (named via
 *  competency_catalog), with a few sample missed questions for concreteness.
 *  Plain multi-step reads (no PostgREST embeds) — robust against the rcltp_
 *  tables missing from the generated type and the FK-embed name guessing. */
async function buildWeakAreas(
  db: { from: (t: string) => any },
  assessmentId: string,
): Promise<WeakArea[]> {
  const { data: responses } = await db
    .from('rcltp_part_b_responses')
    .select('is_correct, competency_id, question_id')
    .eq('assessment_id', assessmentId);
  if (!Array.isArray(responses) || responses.length === 0) return [];

  const compIds = [
    ...new Set(responses.map((r: any) => r.competency_id).filter(Boolean)),
  ] as string[];
  const qIds = [
    ...new Set(responses.map((r: any) => r.question_id).filter(Boolean)),
  ] as string[];

  const compName = new Map<string, string>();
  if (compIds.length) {
    const { data: comps } = await db
      .from('competency_catalog')
      .select('id, competency_name')
      .in('id', compIds);
    for (const c of comps ?? []) compName.set(c.id, c.competency_name);
  }
  const qText = new Map<string, string>();
  if (qIds.length) {
    const { data: qs } = await db
      .from('rcltp_part_b_questions')
      .select('id, question_text')
      .in('id', qIds);
    for (const q of qs ?? []) qText.set(q.id, q.question_text);
  }

  // competency_id → { missed, total, sampleQuestions }
  const byComp = new Map<string, { competency: string; missed: number; total: number; samples: string[] }>();
  for (const r of responses as any[]) {
    const key = r.competency_id ?? '__none__';
    const name = compName.get(r.competency_id) ?? 'General comprehension';
    const entry = byComp.get(key) ?? { competency: name, missed: 0, total: 0, samples: [] };
    entry.total += 1;
    if (r.is_correct === false) {
      entry.missed += 1;
      const t = qText.get(r.question_id);
      if (t && entry.samples.length < 3) entry.samples.push(t);
    }
    byComp.set(key, entry);
  }

  // Only competencies with at least one miss are "weak"; most-missed first.
  return [...byComp.values()]
    .filter((e) => e.missed > 0)
    .sort((a, b) => b.missed - a.missed)
    .map((e) => ({ competency: e.competency, missed: e.missed, total: e.total, sampleQuestions: e.samples }));
}

// ── parse + record ───────────────────────────────────────────────────────────

/** Tolerant parse of the model's JSON plan (mirrors the lesson-spine parser):
 *  strip fences, else slice the outermost {...}. Returns null on unparseable
 *  output so the caller can skip (the candidate re-qualifies next cycle). */
export function parsePlanMessage(message: Anthropic.Message | null): RemedialPlanDraft | null {
  if (!message) return null;
  try {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed: RemedialPlanDraft;
    try {
      parsed = JSON.parse(jsonStr) as RemedialPlanDraft;
    } catch {
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON object in model output');
      parsed = JSON.parse(m[0]) as RemedialPlanDraft;
    }
    // Minimal shape guard — a plan with no summary and no activities is unusable.
    if (!parsed || (typeof parsed.summary !== 'string' && !Array.isArray(parsed.activities))) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[rcltp/remedial-plan] plan parse failed:', err);
    return null;
  }
}

/** Flat result shape. NOTE: this repo runs `strictNullChecks:false`, under which
 *  TypeScript does NOT narrow the false branch of a `{ok:true}|{ok:false}` union —
 *  so every result here is a flat object with optional fields, read without
 *  branch-narrowing. (Verified: the discriminated form fails the PR-scoped tsc
 *  gate; the flat form compiles.) */
export interface PlanWriteResult {
  ok: boolean;
  planId?: string;
  error?: string;
}

/** Write status='draft' via the service-role generator RPC. Never throws for an
 *  RPC error (supabase .rpc returns { error }); returns a flat result so the
 *  collector can count failures and re-drain. */
export async function recordDraft(
  admin: Admin,
  snap: DraftSnapshot,
  plan: RemedialPlanDraft,
  aiModel: string,
): Promise<PlanWriteResult> {
  const { data, error } = await admin.rpc('fn_rcltp_remedial_plan_ai_draft_upsert', {
    p_institution_id: snap.institutionId,
    p_learner_id: snap.learnerId,
    p_assessment_id: snap.assessmentId,
    p_cycle_no: snap.cycleNo,
    p_trigger_reason: snap.triggerReason,
    p_band: snap.band,
    p_overall: snap.overall,
    p_ai_draft: plan,
    p_ai_model: aiModel,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, planId: data as string };
}

/** The subset stashed in the job's _ctx so the async collect can record without
 *  re-reading the learner (and so the trigger snapshot is frozen at enqueue). */
function toSnapshot(g: Grounding): DraftSnapshot {
  return {
    institutionId: g.institutionId,
    learnerId: g.learnerId,
    assessmentId: g.assessmentId,
    cycleNo: g.cycleNo,
    triggerReason: g.triggerReason,
    band: g.band,
    overall: g.overall,
  };
}

// ── enqueue (₹0 Max lane, async) ──────────────────────────────────────────────

export interface EnqueueResult {
  ok: boolean;
  planId?: string;
  jobId?: string | null;
  inFlight?: boolean;
  reason?: 'not_at_risk' | 'error';
  error?: string;
}

/**
 * The Slice-3 button's server path: write a 'queued' placeholder (so the review
 * console shows "requested — pending") and enqueue the generation on the ₹0 Max
 * lane. The dedupeKey guards a double-request (in_flight → treated as success,
 * the pending row already exists). The caller MUST have already verified the
 * actor holds rcltp.review + institution access.
 */
export async function enqueueRemedialPlanDraft(
  admin: Admin,
  learnerId: string,
): Promise<EnqueueResult> {
  const g = await buildGroundingForLearner(admin, learnerId);
  if (!g) return { ok: false, reason: 'not_at_risk' };

  const { data: planId, error: pErr } = await admin.rpc('fn_rcltp_remedial_plan_enqueue', {
    p_institution_id: g.institutionId,
    p_learner_id: g.learnerId,
    p_assessment_id: g.assessmentId,
    p_cycle_no: g.cycleNo,
    p_trigger_reason: g.triggerReason,
    p_band: g.band,
    p_overall: g.overall,
  });
  if (pErr) return { ok: false, reason: 'error', error: pErr.message };

  const { model_id } = await resolveChatModel(REMEDIAL_PLAN_JOB_TYPE);
  const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(g)}`;
  const r = await enqueueJobsLane(admin, {
    jobType: REMEDIAL_PLAN_JOB_TYPE,
    prompt,
    context: toSnapshot(g) as unknown as Record<string, unknown>,
    dedupeKey: `${REMEDIAL_PLAN_JOB_TYPE}|${g.learnerId}|${g.cycleNo}`,
  });
  if (r.ok) {
    // The TRUE branch narrows correctly even under strictNullChecks:false.
    return { ok: true, planId: planId as string, jobId: r.jobId };
  }
  // FALSE branch: read reason/error via a flat view — boolean-discriminant
  // false-branch narrowing does not apply under strictNullChecks:false.
  const fail = r as { reason?: string; error?: string };
  if (fail.reason === 'in_flight') {
    return { ok: true, planId: planId as string, jobId: null, inFlight: true };
  }
  return { ok: false, reason: 'error', error: fail.error };
}

// ── direct generation (synchronous Anthropic — immediate / proof) ─────────────

export interface DirectResult {
  ok: boolean;
  planId?: string;
  reason?: 'not_at_risk' | 'no_key' | 'parse_failed' | 'record_failed';
  error?: string;
}

/**
 * Generate a draft SYNCHRONOUSLY via a direct Anthropic call and record it — the
 * SAME 'draft' row via the SAME RPC as the async lane, just without waiting on
 * the external Max seat. Used for an immediate "generate now" and for a
 * deterministic end-to-end proof. Costs a paid call (not the ₹0 lane), so it is
 * secret-gated (cron) — the default learner-facing path stays the ₹0 enqueue.
 */
export async function generateDraftDirect(admin: Admin, learnerId: string): Promise<DirectResult> {
  const g = await buildGroundingForLearner(admin, learnerId);
  if (!g) return { ok: false, reason: 'not_at_risk' };

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const { model_id } = await resolveChatModel(REMEDIAL_PLAN_JOB_TYPE);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: model_id,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(g) }],
  });

  const plan = parsePlanMessage(msg);
  if (!plan) return { ok: false, reason: 'parse_failed' };

  const rec = await recordDraft(admin, toSnapshot(g), plan, `direct:${model_id}`);
  if (!rec.ok) return { ok: false, reason: 'record_failed', error: rec.error };
  return { ok: true, planId: rec.planId };
}
