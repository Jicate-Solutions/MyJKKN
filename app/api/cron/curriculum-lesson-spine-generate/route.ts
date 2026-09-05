// =====================================================================
// Curriculum-aware class poll — Phase 2: AI lesson-spine BULK MINT cron
// =====================================================================
// For each BoS-covered course (courses joined to bos_course_syllabi by
// course_code + institutions_id, is_latest, not archived — the EXACT contract
// fn_bos_clos_for_course already uses) that has NO curriculum_lesson row of any
// kind yet, this asks Claude to draft an ordered lesson spine grounded in the
// syllabus's course_content (units/chapters) + course_learning_outcomes (CLOs),
// and records every lesson as status='draft' via fn_curriculum_lesson_ai_draft_upsert.
//
// HARD INVARIANT: nothing this cron writes is ever status='published'. AI is the
// author, faculty is the authority — a human must call fn_curriculum_lesson_ai_approve
// (the review UI at /academic/curriculum-review) before a drafted lesson counts or
// reaches students. Skips the ~87% no-syllabus courses entirely (Phase 1 territory —
// those stay faculty-typed).
//
// 2026-07-06: ASYNC BATCH — SUBMIT-in-one-run / COLLECT-in-a-later-run, exactly the
// scf-generate-suggestions / induction-generate-playbook pattern (ai-clients/batch.ts,
// the reusable 50%-discount Message Batches lane):
//   • SUBMIT (default GET, weekly via the ai-routine-dispatcher — see
//     ai_routine_schedules seed in the Phase 2 migration): discover BoS-covered
//     courses with no lesson-spine yet, build one generation request per course,
//     submit ONE batch. No polling.
//   • COLLECT (?mode=collect, every 30 min via vercel.json, AND collect-first on
//     the weekly run): drain ENDED batches, record each course's drafted lessons
//     (+ optional Concept-Application/capstone briefs) idempotently.
//
// IMPORTANT — feature_key is SEPARATE from the per-course "regenerate" click
// (lib/ai-tasks/registry.ts uses 'curriculum.lesson_spine_regen', not this cron's
// 'curriculum.lesson_spine_generate'). fn_ai_batch_claim_for_collection claims ANY
// outstanding job for a feature_key regardless of phase, so sharing one key between
// this cron's bespoke collect handler and the generic ai-tasks-sweep collector would
// let either drain the other's jobs into the wrong parse/record logic. Two keys (same
// governed model, both seeded in the Phase 2 migration) avoids that collision.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query param.
// Env: CLAUDE_API_KEY or ANTHROPIC_API_KEY. No key → nothing submitted (skipped),
//   collect still drains any already-outstanding batch.
// Created: 2026-07-06 (Phase 2 of specs/curriculum-aware-lesson-plan-2026-07-04.md).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';
import Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import {
  submitBatch,
  collectEndedBatches,
  markJobCollected,
  partitionInFlight,
  MAX_COLLECT_ATTEMPTS,
  type SubmitBatchRequest,
  type SubmitBatchResult,
} from '@/lib/services/platform/ai-clients/batch';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const FEATURE_KEY = 'curriculum.lesson_spine_generate';
// ₹0 Max-lane migration (work order 2026-07-13 §B): the ai_job_types row
// (seeded 20260713140000) and the flip-back switch key. 'jobs' → enqueue on the
// #1998 registry (₹0); 'direct' → the legacy paid Anthropic fallback verbatim.
const JOB_TYPE = FEATURE_KEY;
const GENERATION_LANE_KEY = 'loops.curriculum_lesson_spine_generate.generation_lane';

/** Read the generation-lane switch (config-table pattern) as a cron: fn_get_policy
 *  at global scope resolves with no auth.uid(). Fail-safe to 'jobs' (the free ₹0
 *  Max lane) on any read error or unexpected value — the paid 'direct' path fires
 *  ONLY when the policy row EXPLICITLY says 'direct'. This upholds the "no silent
 *  paid spend" rule (Director 2026-07-28): a policy hiccup can never silently bill
 *  Anthropic; the worst case is work runs free instead of paid. */
async function readGenerationLane(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<'jobs' | 'direct'> {
  try {
    const { data, error } = await admin.rpc('fn_get_policy', {
      p_key: GENERATION_LANE_KEY,
      p_scope_id: null,
    });
    if (error) return 'jobs';
    return data === 'direct' ? 'direct' : 'jobs';
  } catch {
    return 'jobs';
  }
}
const DEFAULT_BATCH_CAP = 25;
const DEFAULT_EMIT_BRIEFS = true;
// Dry-out guard (2026-07-26): after this many delivered refusals for a course
// whose BoS syllabus is EMPTY (no units, no CLOs), stop re-enqueueing it until
// the syllabus content actually changes. Config row: curriculum_ai.dryout_threshold.
const DEFAULT_DRYOUT_THRESHOLD = 3;
// Sized so a full multi-unit lesson spine fits without truncation → unparseable output.
// A truncated (unparseable) response yields no drafts, so the course stays a candidate and
// is re-submitted next run; a larger budget minimises that wasted-resubmit loop. The brief
// lane (which lengthens output further) is OFF by default until it is hardened separately.
const MAX_TOKENS = 8192;

// ── prompt ───────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a curriculum designer for an Indian higher-education institution (JKKN), building a teaching "lesson spine" for one course from its Board-of-Studies (BoS) approved syllabus.

You will receive the syllabus's units/chapters and its Course Learning Outcomes (CLOs, each with a clo_number and k_values — the Bloom cognitive levels K1-K6 the CLO targets: K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

Your job: break each unit into an ordered sequence of teachable LESSONS (typically 3-6 per unit — one per major topic/chapter section, not one per chapter as a whole), each grounded in the syllabus content and mapped to the CLOs it serves.

Use the Fink taxonomy dimension that best fits each lesson's PRIMARY teaching intent:
foundational (facts/concepts), application (skills/practice), integration (connecting ideas), human (self-understanding/confidence), caring (values/motivation), learning_to_learn (how to keep learning this).

For each lesson's learning_outcomes, cite ONE OR MORE Bloom levels (K1-K6) drawn from the CLOs it maps to (co_ref = the clo_number(s) it serves), and a Fink dimension per outcome statement (usually the lesson's own primary_fink_dimension, unless a specific outcome clearly targets a different one).

Ground every lesson title and outcome in the ACTUAL syllabus content provided — do not invent topics absent from it. Be concrete and India-context aware.

Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{
  "lessons": [
    {
      "unit_label": "Unit 1",
      "sequence_no": 1,
      "title": "...",
      "primary_fink_dimension": "foundational",
      "learning_outcomes": [
        {"text": "...", "fink_dimension": "foundational", "bloom_level": "K2", "co_ref": "CO1"}
      ]
    }
  ]
}
CRITICAL: sequence_no must be a single strictly-increasing integer across the WHOLE spine (unit 2's first lesson continues after unit 1's last), so the spine has one unambiguous teaching order.`;

// Bloom-primary variant — used when the course's BoS-fixed taxonomy is 'blooms'
// (older regulations, typically 2nd/3rd year). Byte-parallel to SYSTEM_PROMPT so the
// Mac twin (curriculum-lesson-spine-regen.mjs) can carry an identical constant; the
// ONLY differences are the primary axis (a K1-K6 Bloom level instead of a Fink
// dimension) and the JSON schema's primary field (`primary_bloom_level`). Fink stays a
// HYBRID: each outcome still carries its fink_dimension — Bloom is primary, Fink secondary.
const BLOOM_SYSTEM_PROMPT = `You are a learning-framework designer for an Indian higher-education institution (JKKN), building a teaching "lesson spine" for one course from its Board-of-Studies (BoS) approved learning pathway.

You will receive the syllabus's units/chapters and its Course Learning Outcomes (CLOs, each with a clo_number and k_values — the Bloom cognitive levels K1-K6 the CLO targets: K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

Your job: break each unit into an ordered sequence of teachable LESSONS (typically 3-6 per unit — one per major topic/chapter section, not one per chapter as a whole), each grounded in the syllabus content and mapped to the CLOs it serves.

This course's Board of Studies has FIXED the Bloom taxonomy for it. Tag each lesson with the SINGLE Bloom cognitive level (K1-K6) that best fits its PRIMARY teaching intent — the dominant level the lesson builds toward (K1=Remember, K2=Understand, K3=Apply, K4=Analyze, K5=Evaluate, K6=Create).

For each lesson's learning_outcomes, cite the Bloom level (K1-K6) that outcome targets (drawn from the CLOs it maps to, co_ref = the clo_number(s) it serves), and ALSO note the Fink dimension it touches (foundational, application, integration, human, caring, learning_to_learn) — Bloom is primary here, Fink is the secondary hybrid lens, so keep both on every outcome.

Ground every lesson title and outcome in the ACTUAL syllabus content provided — do not invent topics absent from it. Be concrete and India-context aware.

Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{
  "lessons": [
    {
      "unit_label": "Unit 1",
      "sequence_no": 1,
      "title": "...",
      "primary_bloom_level": "K2",
      "learning_outcomes": [
        {"text": "...", "bloom_level": "K2", "fink_dimension": "foundational", "co_ref": "CO1"}
      ]
    }
  ]
}
CRITICAL: sequence_no must be a single strictly-increasing integer across the WHOLE spine (unit 2's first lesson continues after unit 1's last), so the spine has one unambiguous teaching order.`;

const BRIEFS_ADDENDUM = `
You were ALSO given this course's assessment structure, which includes team-capstone options and/or a Concept-Application note. In addition to "lessons", also return:
"concept_briefs": [{"unit_label": "Unit 1", "title": "...", "text": "a short in-class Concept-Application activity brief grounded in the unit's content and the syllabus's Concept-Application note", "co_ref": ["CO1"]}]  (at most one per unit that has enough content to ground one)
"capstone_brief": {"title": "...", "text": "a short team-capstone brief, adapting ONE of the syllabus's own capstone options (pick the single best-grounded one) into a classroom-ready brief", "co_ref": ["CO1","CO2"]}  (omit entirely if the syllabus's capstone options don't give you enough to ground one)
Keep both brief kinds SHORT (2-4 sentences of "text") — they are prompts for the teacher to run in class, not full lesson plans.`;

// ── types ────────────────────────────────────────────────────────────────────
// A course's BoS-fixed taxonomy (bos_regulation_taxonomies.taxonomy_type). The generator
// branches on this: 'finks' → Fink-primary prompt; 'blooms' → Bloom-primary prompt. A course
// whose regulation has NO taxonomy fixed is skipped-and-flagged, never defaulted to Fink.
type Taxonomy = 'finks' | 'blooms' | 'jkkn_advanced';

type CourseRow = {
  course_id: string;
  institution_id: string;
  course_code: string;
  course_name: string;
  bos_syllabus_id: string;
  taxonomy: Taxonomy;
  course_content: unknown;
  course_learning_outcomes: unknown;
  assessment_structure: unknown;
};

type GenContext = {
  course_id: string;
  bos_syllabus_id: string;
  emit_briefs: boolean;
  taxonomy: Taxonomy;
  /** Cheap length+hash fingerprint of the syllabus substance this generation was
   *  grounded in (see syllabusFingerprint). Stamped on every enqueue so the
   *  dry-out guard can scope refusal counts to UNCHANGED content — a course
   *  re-qualifies the moment its content differs. Optional: legacy in-flight
   *  jobs predate the stamp (same tolerance as ctxTaxonomy). */
  content_fp?: string;
};

type LessonOut = {
  unit_label?: string;
  sequence_no?: number;
  title?: string;
  primary_fink_dimension?: string;
  primary_bloom_level?: string;
  learning_outcomes?: unknown[];
};

/** Resolve a batch-context's taxonomy, defaulting legacy in-flight jobs (submitted before
 *  this change carried no taxonomy) to 'finks' — the behaviour they were generated under. */
function ctxTaxonomy(ctx: { taxonomy?: unknown }): Taxonomy {
  if (ctx?.taxonomy === 'blooms') return 'blooms';
  if (ctx?.taxonomy === 'jkkn_advanced') return 'jkkn_advanced';
  return 'finks';
}
type BriefOut = { unit_label?: string; title?: string; text?: string; co_ref?: string[] };
type ParsedSpine = { lessons?: LessonOut[]; concept_briefs?: BriefOut[]; capstone_brief?: BriefOut | null };

// ── helpers ──────────────────────────────────────────────────────────────────
function dedupeKey(courseId: string): string {
  return `${FEATURE_KEY}|generate|${courseId}`;
}

// ── dry-out guard helpers (2026-07-26) ──────────────────────────────────────
// An EMPTY BoS syllabus ({"units":[]} + {"clos":[]}) can never ground a spine:
// the model refuses honestly every time, the parse yields no drafts, the course
// stays a candidate, and every submit run re-enqueues it — an infinite refusal
// loop (prod receipts 2026-07-16→07-26: four course targets cycled 3-5
// delivered refusals each, e.g. 24UZOGE01 / 26PCHC04). These helpers give the
// guard its two signals: "is the content still empty?" and "has it changed?".

/** djb2-xor hash, base36 — cheap and stable; content COMPARISON, never a timestamp. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** True if a JSON value carries any teachable substance: a non-blank string or
 *  a non-empty array anywhere in it. `{"units":[]}` / `{"clos":[]}` → false.
 *  Numbers/booleans alone (e.g. an hours count) are not substance. Deliberately
 *  conservative: a non-empty array counts as substance even if its entries are
 *  thin, so the guard only ever parks the clear-cut empty-BoS case. */
function hasSubstance(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.values(v).some(hasSubstance);
  return false;
}

/** The dry-out guard's target: a syllabus with NO units and NO CLOs. */
function syllabusIsEmpty(course: CourseRow): boolean {
  return !hasSubstance(course.course_content) && !hasSubstance(course.course_learning_outcomes);
}

/** Cheap count+hash fingerprint of exactly the substance the prompt is built
 *  from (course_content + CLOs). Stamped into GenContext at enqueue; compared
 *  at submit so refusal counts only accrue while the content is UNCHANGED. */
function syllabusFingerprint(course: CourseRow): string {
  const content = JSON.stringify(course.course_content ?? {});
  const clos = JSON.stringify(course.course_learning_outcomes ?? {});
  return `${content.length}.${djb2(content)}-${clos.length}.${djb2(clos)}`;
}

function hasCapstoneData(assessmentStructure: unknown): boolean {
  if (!assessmentStructure || typeof assessmentStructure !== 'object') return false;
  const as = assessmentStructure as { capstones?: unknown[]; components?: unknown[]; concept_applications_note?: string };
  const hasCapstones = Array.isArray(as.capstones) && as.capstones.length > 0;
  const hasNote = typeof as.concept_applications_note === 'string' && as.concept_applications_note.trim().length > 0;
  return hasCapstones || hasNote;
}

function buildUserPrompt(course: CourseRow, emitBriefs: boolean): string {
  const content = JSON.stringify(course.course_content ?? {}).slice(0, 12000); // defensive cap
  const clos = JSON.stringify(course.course_learning_outcomes ?? {}).slice(0, 6000);
  let prompt = `Course: ${course.course_code} — ${course.course_name}

Syllabus content (units/chapters):
${content}

Course Learning Outcomes (CLOs):
${clos}

Generate the lesson-spine JSON for this course now.`;
  if (emitBriefs) {
    const assessment = JSON.stringify(course.assessment_structure ?? {}).slice(0, 4000);
    prompt += `\n\nAssessment structure (capstone options / Concept-Application note):\n${assessment}`;
  }
  return prompt;
}

// Pick the system prompt for a course's BoS-fixed taxonomy: 'blooms' and
// 'jkkn_advanced' → Bloom-primary, 'finks' → Fink-primary. Kept as a helper so the
// app cron and the Mac twin select the prompt identically (PROMPT/PARSE LOCKSTEP).
//
// JABT routes to the Bloom prompt because its primary tag lives in
// `primary_bloom_level`. That yields K1-K6 only — the added half (A1-A5) is authored
// by faculty, not generated, so a generated spine can never satisfy the coverage rule
// on its own. Without this arm, a JABT course silently got Fink dimensions instead.
function systemForTaxonomy(taxonomy: Taxonomy, emitBriefs: boolean): string {
  const base =
    taxonomy === 'blooms' || taxonomy === 'jkkn_advanced' ? BLOOM_SYSTEM_PROMPT : SYSTEM_PROMPT;
  return emitBriefs ? `${base}\n${BRIEFS_ADDENDUM}` : base;
}

function buildGenParams(modelId: string, course: CourseRow, emitBriefs: boolean): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    system: systemForTaxonomy(course.taxonomy, emitBriefs),
    messages: [{ role: 'user', content: buildUserPrompt(course, emitBriefs) }],
  };
}

function parseSpineMessage(message: Anthropic.Message | null): ParsedSpine | null {
  if (!message) return null;
  try {
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    let jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    // Tolerant extraction (2026-07-09, maiden Max-chain receipt): the model
    // sometimes wraps the object in prose or trailing text — slice the
    // outermost {...} instead of failing the whole course (mirrors the
    // admission-insights parse path).
    try {
      return JSON.parse(jsonStr) as ParsedSpine;
    } catch {
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON object in model output');
      return JSON.parse(m[0]) as ParsedSpine;
    }
  } catch (err) {
    console.error('[cron/curriculum-lesson-spine-generate] AI output parse failed:', err);
    return null;
  }
}

// Records every lesson + brief for one course via the service-role-only draft
// writer. Never throws for a single bad item — logs, counts the failure, and
// continues so one malformed item doesn't sink the whole course's spine. The
// caller MUST inspect `failed`: a non-zero count means the spine is only partly
// written and the batch job must NOT be finalized (it needs a re-drain), else
// the initial-mint-only guard permanently skips the half-populated course.
// NOTE: supabase `.rpc()` returns { error } and does NOT throw on an RPC error,
// so each call's `.error` must be checked explicitly — a try/catch alone (which
// only trips on network/thrown faults) would silently over-count successes.
async function recordSpine(
  admin: ReturnType<typeof createServiceRoleClient>,
  courseId: string,
  bosSyllabusId: string,
  batchKey: string,
  taxonomy: Taxonomy,
  spine: ParsedSpine,
): Promise<{ lessonsRecorded: number; briefsRecorded: number; failed: number }> {
  let lessonsRecorded = 0;
  let briefsRecorded = 0;
  let failed = 0;
  // Blooms course → primary tag is a Bloom K-level; Fink dimension is nulled out (it stays
  // a per-outcome hybrid, but the LESSON's primary axis is Bloom). Finks course → the reverse.
  const isBloom = taxonomy === 'blooms';

  for (const l of Array.isArray(spine.lessons) ? spine.lessons : []) {
    if (!l.title || typeof l.title !== 'string') continue;
    const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
      p_course_id: courseId,
      p_artifact_kind: 'lesson',
      p_sequence_no: typeof l.sequence_no === 'number' ? l.sequence_no : null,
      p_unit_label: typeof l.unit_label === 'string' ? l.unit_label : null,
      p_title: l.title,
      p_learning_outcomes: Array.isArray(l.learning_outcomes) ? l.learning_outcomes : [],
      p_primary_fink: isBloom ? null : (typeof l.primary_fink_dimension === 'string' ? l.primary_fink_dimension : null),
      p_primary_taxonomy: taxonomy,
      p_primary_bloom_level: isBloom ? (typeof l.primary_bloom_level === 'string' ? l.primary_bloom_level : null) : null,
      p_co_refs: Array.isArray(l.learning_outcomes)
        ? [...new Set(l.learning_outcomes.map((o) => (o as { co_ref?: string })?.co_ref).filter((x): x is string => typeof x === 'string'))]
        : [],
      p_bos_syllabus_id: bosSyllabusId,
      p_source: 'bos_ai',
      p_gemini_prompt: null,
      p_ai_batch_key: batchKey,
    });
    if (error) {
      console.error(`[cron/curriculum-lesson-spine-generate] lesson record failed (course ${courseId}):`, error);
      failed++;
    } else {
      lessonsRecorded++;
    }
  }

  for (const b of Array.isArray(spine.concept_briefs) ? spine.concept_briefs : []) {
    if (!b.title || typeof b.title !== 'string' || !b.unit_label) continue;
    const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
      p_course_id: courseId,
      p_artifact_kind: 'concept_brief',
      p_sequence_no: null,
      p_unit_label: b.unit_label,
      p_title: b.title,
      p_learning_outcomes: [{ text: b.text ?? '', co_ref: Array.isArray(b.co_ref) ? b.co_ref : [] }],
      p_primary_fink: null,
      p_primary_taxonomy: taxonomy,
      p_primary_bloom_level: null,
      p_co_refs: Array.isArray(b.co_ref) ? b.co_ref : [],
      p_bos_syllabus_id: bosSyllabusId,
      p_source: 'bos_ai',
      p_gemini_prompt: null,
      p_ai_batch_key: batchKey,
    });
    if (error) {
      console.error(`[cron/curriculum-lesson-spine-generate] concept_brief record failed (course ${courseId}):`, error);
      failed++;
    } else {
      briefsRecorded++;
    }
  }

  const cap = spine.capstone_brief;
  if (cap && typeof cap.title === 'string') {
    const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
      p_course_id: courseId,
      p_artifact_kind: 'capstone_brief',
      p_sequence_no: null,
      p_unit_label: null,
      p_title: cap.title,
      p_learning_outcomes: [{ text: cap.text ?? '', co_ref: Array.isArray(cap.co_ref) ? cap.co_ref : [] }],
      p_primary_fink: null,
      p_primary_taxonomy: taxonomy,
      p_primary_bloom_level: null,
      p_co_refs: Array.isArray(cap.co_ref) ? cap.co_ref : [],
      p_bos_syllabus_id: bosSyllabusId,
      p_source: 'bos_ai',
      p_gemini_prompt: null,
      p_ai_batch_key: batchKey,
    });
    if (error) {
      console.error(`[cron/curriculum-lesson-spine-generate] capstone_brief record failed (course ${courseId}):`, error);
      failed++;
    } else {
      briefsRecorded++;
    }
  }

  return { lessonsRecorded, briefsRecorded, failed };
}

// ── GET handler ──────────────────────────────────────────────────────────────
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

  const started = Date.now();
  const admin = createServiceRoleClient();
  const mode = request.nextUrl.searchParams.get('mode');
  const isCollectOnly = mode === 'collect';

  // ₹0 Max-lane migration (work order 2026-07-13 §B). Which lane generates this
  // run's spines. 'jobs' (default after this PR) = the cron ITSELF enqueues each
  // candidate on the #1998 ai_jobs registry; the generic Windows seat drain runs
  // it on the Max subscription (₹0). 'direct' = the legacy behaviour: defer to
  // the per-routine Max MANIFEST TWIN (a separate Windows brain), with a paid
  // Anthropic sub-fallback only when the twin's heartbeat is stale. Flip-back.
  const lane = await readGenerationLane(admin);

  // Manifest-twin deferral applies ONLY on the legacy 'direct' lane. On 'jobs'
  // the cron feeds ai_jobs itself, so it must NOT stand down for the twin — that
  // would leave the queue unfed. Overlap with a still-running manifest twin is
  // idempotency-safe: recordSpine is initial-mint-only (fn_curriculum_lesson_ai_
  // draft_upsert), so whichever lane mints a course's spine first wins and the
  // other no-ops. Retiring the twin is the ratified 2-week cleanup, not this PR.
  if (lane === 'direct' && (await shouldDeferToMaxLane('curriculum-lesson-spine-generate'))) {
    console.log('[cron/curriculum-lesson-spine-generate] deferred to Max manifest twin (direct lane)');
    return NextResponse.json({
      ok: true,
      generation_lane: lane,
      generated: 0,
      briefs_generated: 0,
      skipped: 0,
      deferred_to_max_lane: true,
    });
  }

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const aiAvailable = Boolean(apiKey);
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // Config-table pattern (decisions #24-26): read at runtime, never hardcoded.
  let batchCap = DEFAULT_BATCH_CAP;
  let emitBriefsPolicy = DEFAULT_EMIT_BRIEFS;
  let dryoutThreshold = DEFAULT_DRYOUT_THRESHOLD;
  try {
    const { data: capData } = await admin.rpc('fn_get_policy_int', {
      p_key: 'curriculum_ai.batch_cap',
      p_default: DEFAULT_BATCH_CAP,
      p_scope_id: null,
    });
    if (typeof capData === 'number') batchCap = capData;
    const { data: dryData } = await admin.rpc('fn_get_policy_int', {
      p_key: 'curriculum_ai.dryout_threshold',
      p_default: DEFAULT_DRYOUT_THRESHOLD,
      p_scope_id: null,
    });
    if (typeof dryData === 'number' && dryData > 0) dryoutThreshold = dryData;
    const { data: briefsData } = await admin.rpc('fn_get_policy_bool', {
      p_key: 'curriculum_ai.emit_assessment_briefs',
      p_default: DEFAULT_EMIT_BRIEFS,
      p_scope_id: null,
    });
    if (typeof briefsData === 'boolean') emitBriefsPolicy = briefsData;
  } catch (e) {
    console.warn('[cron/curriculum-lesson-spine-generate] policy read failed, using defaults:', e);
  }

  let generated = 0; // lessons recorded this run (during collect)
  let briefsGenerated = 0;
  let skipped = 0;
  let collectedJobs = 0;
  let recorded = 0;
  let enqueued = 0; // jobs-lane: candidates enqueued on the ₹0 Max lane this run
  let skippedNoTaxonomy = 0; // SUBMIT: candidates whose regulation has NO BoS taxonomy fixed — skipped, never defaulted to Fink (surfaced on /tracker)
  let skippedDriedOut = 0; // SUBMIT: empty-syllabus courses parked by the dry-out guard this run (re-qualify when content changes)
  const driedOutCourses: Array<{ course_code: string; refusals: number }> = []; // the WHY, surfaced honestly in the response

  // =====================================================================
  // COLLECT PHASE — drains ENDED batches, records each course's spine.
  // =====================================================================
  if (aiAvailable) {
    let jobs;
    try {
      jobs = await collectEndedBatches(FEATURE_KEY);
    } catch (collectErr) {
      console.error('[cron/curriculum-lesson-spine-generate] collect failed:', collectErr);
      jobs = [];
    }

    for (const job of jobs) {
      try {
        let deferFinalize = false;

        for (const item of job.items) {
          const ctx = item.context as unknown as GenContext;
          const spine = parseSpineMessage(item.message);
          if (spine !== null) {
            try {
              const { lessonsRecorded, briefsRecorded, failed } = await recordSpine(
                admin,
                ctx.course_id,
                ctx.bos_syllabus_id,
                job.jobId,
                ctxTaxonomy(ctx),
                spine,
              );
              generated += lessonsRecorded;
              briefsGenerated += briefsRecorded;
              recorded++;
              // A partial write (some draft upserts returned an error) must NOT finalize
              // the job — defer so the batch re-drains and the initial-mint-only guard
              // doesn't permanently skip a half-populated course (deep-review MEDIUM
              // 2026-07-06: .rpc() doesn't throw, so this signal comes from `failed`, not
              // the catch below which only trips on a genuine throw).
              if (failed > 0) {
                console.error(
                  `[cron/curriculum-lesson-spine-generate] course ${ctx.course_id}: ${failed} draft write(s) failed — deferring finalize`,
                );
                deferFinalize = true;
              }
            } catch (recErr) {
              console.error(
                `[cron/curriculum-lesson-spine-generate] record threw for course ${ctx.course_id} — deferring finalize:`,
                recErr,
              );
              deferFinalize = true;
            }
          } else {
            skipped++;
          }
        }

        if (deferFinalize) {
          if (job.collectAttempts >= MAX_COLLECT_ATTEMPTS) {
            console.error(
              `[cron/curriculum-lesson-spine-generate] job ${job.jobId}: record failed on ${job.collectAttempts} attempts — marking failed (terminal)`,
            );
            // Remove the partial spine this job wrote so the initial-mint guard doesn't see
            // a half-populated course as "already has a spine" and permanently skip it — the
            // course re-qualifies for a clean re-mint next run (deep-review MEDIUM 2026-07-06).
            // Scoped to this job's own DRAFT AI rows: never touches a faculty-approved
            // (published) lesson or another job's drafts.
            const { error: cleanupErr } = await admin
              .from('curriculum_lesson')
              .delete()
              .eq('ai_batch_key', job.jobId)
              .eq('status', 'draft')
              .in('source', ['bos_ai', 'title_ai']);
            if (cleanupErr) {
              console.error(
                `[cron/curriculum-lesson-spine-generate] job ${job.jobId}: partial-draft cleanup failed:`,
                cleanupErr,
              );
            }
            await admin.rpc('fn_ai_batch_mark_expired', { p_job_id: job.jobId, p_status: 'failed' });
          } else {
            console.warn(
              `[cron/curriculum-lesson-spine-generate] job ${job.jobId}: a record step failed (attempt ${job.collectAttempts}) — deferring finalize for lease re-drain`,
            );
          }
        } else {
          await markJobCollected(job.jobId);
          collectedJobs++;
        }
      } catch (jobErr) {
        console.error(
          `[cron/curriculum-lesson-spine-generate] job ${job.jobId} collect handling failed (will retry):`,
          jobErr,
        );
      }
    }
  }

  // =====================================================================
  // JOBS-LANE COLLECT — drain done ai_jobs (₹0 Max lane) and record the SAME
  // way as the paid path (recordSpine → fn_curriculum_lesson_ai_draft_upsert),
  // so the drafts written are byte-identical. Runs ALWAYS (no Anthropic key
  // needed) — also drains anything left queued when the switch is 'direct',
  // so a flip back never orphans in-flight Max work. fn_ai_collect_claim stamps
  // delivered_at, so each result is recorded at most once; a record failure is
  // logged and the daily run regenerates the candidate (idempotent upsert).
  // =====================================================================
  try {
    const jobItems = await collectJobsLane(admin, [JOB_TYPE], batchCap);
    for (const item of jobItems) {
      collectedJobs++;
      const ctx = item.context as unknown as GenContext;
      if (!ctx?.course_id) continue;
      const spine = parseSpineMessage(item.message);
      if (spine === null) {
        skipped++;
        continue;
      }
      // ai_batch_key = the ai_jobs id that minted these drafts (same role as the
      // batch job id on the paid path: scopes the partial-write cleanup).
      const { lessonsRecorded, briefsRecorded, failed } = await recordSpine(
        admin,
        ctx.course_id,
        ctx.bos_syllabus_id,
        item.jobId,
        ctxTaxonomy(ctx),
        spine,
      );
      generated += lessonsRecorded;
      briefsGenerated += briefsRecorded;
      recorded++;
      if (failed > 0) {
        console.error(
          `[cron/curriculum-lesson-spine-generate] jobs-lane course ${ctx.course_id}: ${failed} draft write(s) failed (idempotent upsert re-mints next run)`,
        );
      }
    }
  } catch (e) {
    console.error('[cron/curriculum-lesson-spine-generate] jobs-lane collect failed:', e);
  }

  // =====================================================================
  // SUBMIT PHASE — only on the default (weekly) run, not ?mode=collect.
  // =====================================================================
  let coursesCount = 0;
  let cappedCount = 0;
  let submitted: SubmitBatchResult | null = null;

  if (!isCollectOnly) {
    // BoS-covered courses with NO curriculum_lesson row of any kind yet — the
    // EXACT join contract fn_bos_clos_for_course uses (course_code +
    // institutions_id, is_latest, not archived — institution-scoped so a shared
    // course_code across colleges never cross-pollinates). Two reads + a JS join
    // (NOT a PostgREST !inner embed): courses.course_code <-> bos_course_syllabi
    // .course_code is a plain text match with no declared foreign key (same
    // reason Phase 1's fn_bos_clos_for_course and induction-generate-playbook's
    // programs/events read both do a manual JS join, not an embed).
    const { data: courseRows, error: courseErr } = await admin
      .from('courses')
      .select('id, institution_id, course_code, course_name')
      .eq('is_active', true)
      .limit(5000);
    if (courseErr) {
      console.error('[cron/curriculum-lesson-spine-generate] courses read failed:', courseErr);
      return NextResponse.json(
        { ok: false, error: courseErr.message, elapsed_ms: Date.now() - started },
        { status: 500 },
      );
    }
    if (courseRows && courseRows.length === 5000) {
      console.warn('[cron/curriculum-lesson-spine-generate] courses read hit 5000-row cap — candidates may be truncated');
    }

    const { data: syllabusRows, error: syllabusErr } = await admin
      .from('bos_course_syllabi')
      .select('id, course_code, institutions_id, regulation_id, course_content, course_learning_outcomes, assessment_structure')
      .eq('is_latest', true)
      .eq('is_archived', false)
      .limit(5000);
    if (syllabusErr) {
      console.error('[cron/curriculum-lesson-spine-generate] bos_course_syllabi read failed:', syllabusErr);
      return NextResponse.json(
        { ok: false, error: syllabusErr.message, elapsed_ms: Date.now() - started },
        { status: 500 },
      );
    }
    if (syllabusRows && syllabusRows.length === 5000) {
      console.warn('[cron/curriculum-lesson-spine-generate] bos_course_syllabi read hit 5000-row cap — candidates may be truncated');
    }

    // Tenant-scoped lookup: keyed by (course_code, institutions_id) — matching
    // fn_bos_clos_for_course's exact tenant guard so a shared course_code across
    // colleges never resolves to another institution's syllabus.
    const syllabusByKey = new Map<string, (typeof syllabusRows)[number]>();
    for (const s of syllabusRows ?? []) {
      syllabusByKey.set(`${s.course_code}|${s.institutions_id}`, s);
    }

    // BoS-fixed taxonomy per (regulation, institution). The generator BRANCHES on this:
    // 'finks' → Fink-primary prompt, 'blooms' → Bloom-primary prompt. Keyed by
    // (regulation_id, institutions_id) because taxonomy is set per regulation per college.
    const { data: taxRows, error: taxErr } = await admin
      .from('bos_regulation_taxonomies')
      .select('regulation_id, institutions_id, taxonomy_type')
      .limit(5000);
    if (taxErr) {
      console.error('[cron/curriculum-lesson-spine-generate] bos_regulation_taxonomies read failed:', taxErr);
      return NextResponse.json(
        { ok: false, error: taxErr.message, elapsed_ms: Date.now() - started },
        { status: 500 },
      );
    }
    const taxByKey = new Map<string, Taxonomy>();
    for (const t of taxRows ?? []) {
      if (t.taxonomy_type === 'finks' || t.taxonomy_type === 'blooms') {
        taxByKey.set(`${t.regulation_id}|${t.institutions_id}`, t.taxonomy_type);
      }
    }

    const tenantMatched: CourseRow[] = [];
    for (const c of courseRows ?? []) {
      const syllabus = syllabusByKey.get(`${c.course_code}|${c.institution_id}`);
      if (!syllabus) continue; // no syllabus for THIS course's institution — skip (the ~87% path)
      // Read the course's BoS-FIXED taxonomy. A course whose regulation has NO taxonomy
      // fixed is SKIPPED AND FLAGGED — never silently defaulted to Fink (Director rule).
      const regId = syllabus.regulation_id;
      const taxonomy = taxByKey.get(`${regId}|${c.institution_id}`);
      if (!taxonomy) { skippedNoTaxonomy++; continue; }
      tenantMatched.push({
        course_id: c.id,
        institution_id: c.institution_id,
        course_code: c.course_code,
        course_name: c.course_name,
        bos_syllabus_id: syllabus.id,
        taxonomy,
        course_content: syllabus.course_content,
        course_learning_outcomes: syllabus.course_learning_outcomes,
        assessment_structure: syllabus.assessment_structure,
      });
    }

    // Exclude courses that already have ANY curriculum_lesson row (faculty-typed
    // OR a prior AI draft/published lesson) — this cron is INITIAL mint only; a
    // faculty's own "regenerate" click (lib/ai-tasks) handles re-runs for a
    // course that already has content.
    const courseIds = tenantMatched.map((c) => c.course_id);
    let alreadyHasSpine = new Set<string>();
    if (courseIds.length > 0) {
      // Chunk the .in() — a single filter over ~839 UUIDs risks a 414 URI-too-long, and
      // the initial-mint guard's integrity depends on this read SUCCEEDING. On ANY chunk
      // error, poison the guard (treat EVERY course as already-having-a-spine) so nothing
      // is submitted this run — a silent-empty set would re-mint already-populated courses
      // and waste an AI batch (deep-review MEDIUM 2026-07-06). Retries cleanly next run.
      const CHUNK = 200;
      for (let i = 0; i < courseIds.length; i += CHUNK) {
        const slice = courseIds.slice(i, i + CHUNK);
        const { data: existing, error: existErr } = await admin
          .from('curriculum_lesson')
          .select('course_id')
          .in('course_id', slice);
        if (existErr) {
          console.error(
            '[cron/curriculum-lesson-spine-generate] existing-spine lookup failed — skipping mint this run to avoid re-submitting populated courses:',
            existErr,
          );
          alreadyHasSpine = new Set(courseIds.map(String));
          break;
        }
        for (const r of existing ?? []) alreadyHasSpine.add(String(r.course_id));
      }
    }

    const allCandidates = tenantMatched.filter((c) => !alreadyHasSpine.has(c.course_id));

    // ── DRY-OUT GUARD (2026-07-26) — stop the empty-BoS refusal loop ─────────
    // Every delivered ('done' + delivered_at) job for a course that is STILL a
    // candidate was by definition a refusal — a success would have minted rows
    // and the initial-mint guard above would have excluded the course. So the
    // same-content delivered count IS the consecutive-refusal count. A course is
    // parked only when BOTH hold: (a) its syllabus is empty RIGHT NOW, and
    // (b) it has >= dryoutThreshold delivered attempts against unchanged content
    // (fingerprint match; unstamped legacy attempts count only under (a), since
    // still-empty content is exactly the state they refused on — a course whose
    // content was filled after old refusals is never blocked by them). Release
    // is automatic: (a)/(b) are recomputed from LIVE content each run, so any
    // real content change re-qualifies the course with zero manual steps.
    // Transient refusals on courses WITH substance (e.g. truncation → unparseable,
    // as 24PCAED5 showed before minting 26 lessons) keep retrying — the guard
    // never touches them. Fail-open on lookup error: one wasted cycle beats
    // silently freezing a mintable course. Counts read ai_jobs (the live 'jobs'
    // generation lane); on the legacy 'direct' flip-back the guard still stamps
    // fingerprints but accrues no new counts there (emergency-fallback tolerance).
    const driedOutIds = new Set<string>();
    const emptyCands = allCandidates.filter((c) => syllabusIsEmpty(c));
    if (emptyCands.length > 0) {
      const candByKey = new Map(emptyCands.map((c) => [dedupeKey(c.course_id), c] as const));
      const fpByKey = new Map([...candByKey].map(([k, c]) => [k, syllabusFingerprint(c)] as const));
      const { data: pastJobs, error: pastErr } = await admin
        .from('ai_jobs')
        .select('dedupe:payload->>_dedupe, fp:payload->_ctx->>content_fp')
        .eq('job_type', JOB_TYPE)
        .eq('status', 'done')
        .not('delivered_at', 'is', null)
        .in('payload->>_dedupe', [...candByKey.keys()]);
      if (pastErr) {
        console.warn(
          '[cron/curriculum-lesson-spine-generate] dry-out lookup failed — guard stands down this run:',
          pastErr,
        );
      } else {
        const refusals = new Map<string, number>();
        for (const row of (pastJobs ?? []) as Array<{ dedupe: string | null; fp: string | null }>) {
          if (!row.dedupe || !candByKey.has(row.dedupe)) continue;
          if (row.fp !== null && row.fp !== fpByKey.get(row.dedupe)) continue; // content changed since → doesn't count
          refusals.set(row.dedupe, (refusals.get(row.dedupe) ?? 0) + 1);
        }
        for (const [key, cand] of candByKey) {
          const n = refusals.get(key) ?? 0;
          if (n >= dryoutThreshold) {
            driedOutIds.add(cand.course_id);
            driedOutCourses.push({ course_code: cand.course_code, refusals: n });
          }
        }
        if (driedOutCourses.length > 0) {
          skippedDriedOut = driedOutCourses.length;
          console.warn(
            `[cron/curriculum-lesson-spine-generate] dry-out guard: ${skippedDriedOut} empty-syllabus course(s) parked until content changes: ${driedOutCourses
              .map((d) => `${d.course_code} (${d.refusals} refusals)`)
              .join(', ')}`,
          );
        }
      }
    }

    const liveCandidates = allCandidates.filter((c) => !driedOutIds.has(c.course_id));
    coursesCount = liveCandidates.length;
    let courses = liveCandidates;
    if (liveCandidates.length > batchCap) {
      cappedCount = liveCandidates.length - batchCap;
      courses = liveCandidates.slice(0, batchCap);
      console.warn(
        `[cron/curriculum-lesson-spine-generate] batch cap hit: ${liveCandidates.length} courses, processing ${batchCap}, skipping ${cappedCount}`,
      );
    }

    const requests: SubmitBatchRequest[] = [];
    for (const course of courses) {
      const emitBriefs = emitBriefsPolicy && hasCapstoneData(course.assessment_structure);
      const gctx: GenContext = { course_id: course.course_id, bos_syllabus_id: course.bos_syllabus_id, emit_briefs: emitBriefs, taxonomy: course.taxonomy, content_fp: syllabusFingerprint(course) };
      requests.push({
        customId: `gen-${requests.length}`,
        params: buildGenParams(modelId, course, emitBriefs),
        context: gctx as unknown as Record<string, unknown>,
        dedupeKey: dedupeKey(course.course_id),
      });
    }

    if (lane === 'jobs' && requests.length > 0) {
      // ₹0 Max lane: enqueue each candidate as an ai_job. The seeded job type's
      // glue prompt_template is {{prompt}}, so we pass the SAME assembled prompt
      // buildGenParams produced (system + user), extracted from the request, so
      // the model sees identical instructions. fn_ai_enqueue_system's in-flight
      // guard replaces partitionInFlight (a candidate already queued → skipped).
      // No Anthropic key needed — the Max seat runs it.
      for (const req of requests) {
        const system = typeof req.params.system === 'string' ? req.params.system : '';
        const userContent = req.params.messages?.[0]?.content;
        const user = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);
        const prompt = `${system}\n\n${user}`;
        const gctx = req.context as unknown as GenContext;
        const r = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt,
          context: req.context,
          dedupeKey: req.dedupeKey ?? dedupeKey(gctx.course_id),
        });
        if (r.ok) enqueued++;
        else {
          // r is the failure branch here; name it explicitly (project tsconfig does
          // not narrow the union's else-branch, so read the reason off a typed alias).
          const fail = r as { ok: false; reason: string; error?: string };
          if (fail.reason === 'in_flight') skipped++;
          else {
            console.warn(
              `[cron/curriculum-lesson-spine-generate] jobs-lane enqueue failed (${fail.reason}): ${fail.error ?? ''}`,
            );
            skipped++;
          }
        }
      }
    } else if (aiAvailable && requests.length > 0) {
      const keys = requests.map((r) => r.dedupeKey).filter((k): k is string => !!k);
      const inflight = await partitionInFlight(FEATURE_KEY, keys);
      const fresh = requests.filter((r) => !(r.dedupeKey && inflight.has(r.dedupeKey)));
      skipped += requests.length - fresh.length;
      try {
        if (fresh.length > 0) {
          submitted = await submitBatch({ featureKey: FEATURE_KEY, phase: 'generate', modelId, requests: fresh });
        }
      } catch (e) {
        console.error('[cron/curriculum-lesson-spine-generate] submit failed:', e);
        skipped += fresh.length;
      }
    } else if (!aiAvailable) {
      console.warn('[cron/curriculum-lesson-spine-generate] no API key — skipping submission');
      skipped += requests.length;
    }
  }

  return NextResponse.json({
    ok: true,
    mode: isCollectOnly ? 'collect' : 'submit',
    generation_lane: lane,
    courses: coursesCount,
    capped: cappedCount,
    generated,
    briefs_generated: briefsGenerated,
    enqueued,
    skipped,
    skipped_no_taxonomy: skippedNoTaxonomy,
    skipped_dried_out: skippedDriedOut,
    dried_out: driedOutCourses,
    ai_available: aiAvailable,
    submitted,
    collected: { jobs: collectedJobs, recorded },
    batch_cap: batchCap,
    emit_briefs_policy: emitBriefsPolicy,
    elapsed_ms: Date.now() - started,
  });
}
