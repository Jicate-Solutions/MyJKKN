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

const FEATURE_KEY = 'curriculum.lesson_spine_generate';
const DEFAULT_BATCH_CAP = 25;
const DEFAULT_EMIT_BRIEFS = true;
const MAX_TOKENS = 4096; // a full multi-unit spine (+ optional briefs) can run long

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

const BRIEFS_ADDENDUM = `
You were ALSO given this course's assessment structure, which includes team-capstone options and/or a Concept-Application note. In addition to "lessons", also return:
"concept_briefs": [{"unit_label": "Unit 1", "title": "...", "text": "a short in-class Concept-Application activity brief grounded in the unit's content and the syllabus's Concept-Application note", "co_ref": ["CO1"]}]  (at most one per unit that has enough content to ground one)
"capstone_brief": {"title": "...", "text": "a short team-capstone brief, adapting ONE of the syllabus's own capstone options (pick the single best-grounded one) into a classroom-ready brief", "co_ref": ["CO1","CO2"]}  (omit entirely if the syllabus's capstone options don't give you enough to ground one)
Keep both brief kinds SHORT (2-4 sentences of "text") — they are prompts for the teacher to run in class, not full lesson plans.`;

// ── types ────────────────────────────────────────────────────────────────────
type CourseRow = {
  course_id: string;
  institution_id: string;
  course_code: string;
  course_name: string;
  bos_syllabus_id: string;
  course_content: unknown;
  course_learning_outcomes: unknown;
  assessment_structure: unknown;
};

type GenContext = {
  course_id: string;
  bos_syllabus_id: string;
  emit_briefs: boolean;
};

type LessonOut = {
  unit_label?: string;
  sequence_no?: number;
  title?: string;
  primary_fink_dimension?: string;
  learning_outcomes?: unknown[];
};
type BriefOut = { unit_label?: string; title?: string; text?: string; co_ref?: string[] };
type ParsedSpine = { lessons?: LessonOut[]; concept_briefs?: BriefOut[]; capstone_brief?: BriefOut | null };

// ── helpers ──────────────────────────────────────────────────────────────────
function dedupeKey(courseId: string): string {
  return `${FEATURE_KEY}|generate|${courseId}`;
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

function buildGenParams(modelId: string, course: CourseRow, emitBriefs: boolean): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: modelId,
    max_tokens: MAX_TOKENS,
    system: emitBriefs ? `${SYSTEM_PROMPT}\n${BRIEFS_ADDENDUM}` : SYSTEM_PROMPT,
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
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(jsonStr) as ParsedSpine;
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
  spine: ParsedSpine,
): Promise<{ lessonsRecorded: number; briefsRecorded: number; failed: number }> {
  let lessonsRecorded = 0;
  let briefsRecorded = 0;
  let failed = 0;

  for (const l of Array.isArray(spine.lessons) ? spine.lessons : []) {
    if (!l.title || typeof l.title !== 'string') continue;
    const { error } = await admin.rpc('fn_curriculum_lesson_ai_draft_upsert', {
      p_course_id: courseId,
      p_artifact_kind: 'lesson',
      p_sequence_no: typeof l.sequence_no === 'number' ? l.sequence_no : null,
      p_unit_label: typeof l.unit_label === 'string' ? l.unit_label : null,
      p_title: l.title,
      p_learning_outcomes: Array.isArray(l.learning_outcomes) ? l.learning_outcomes : [],
      p_primary_fink: typeof l.primary_fink_dimension === 'string' ? l.primary_fink_dimension : null,
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

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const aiAvailable = Boolean(apiKey);
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  // Config-table pattern (decisions #24-26): read at runtime, never hardcoded.
  let batchCap = DEFAULT_BATCH_CAP;
  let emitBriefsPolicy = DEFAULT_EMIT_BRIEFS;
  try {
    const { data: capData } = await admin.rpc('fn_get_policy_int', {
      p_key: 'curriculum_ai.batch_cap',
      p_default: DEFAULT_BATCH_CAP,
      p_scope_id: null,
    });
    if (typeof capData === 'number') batchCap = capData;
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
      .select('id, course_code, institutions_id, course_content, course_learning_outcomes, assessment_structure')
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

    const tenantMatched: CourseRow[] = [];
    for (const c of courseRows ?? []) {
      const syllabus = syllabusByKey.get(`${c.course_code}|${c.institution_id}`);
      if (!syllabus) continue; // no syllabus for THIS course's institution — skip (the ~87% path)
      tenantMatched.push({
        course_id: c.id,
        institution_id: c.institution_id,
        course_code: c.course_code,
        course_name: c.course_name,
        bos_syllabus_id: syllabus.id,
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
    coursesCount = allCandidates.length;
    let courses = allCandidates;
    if (allCandidates.length > batchCap) {
      cappedCount = allCandidates.length - batchCap;
      courses = allCandidates.slice(0, batchCap);
      console.warn(
        `[cron/curriculum-lesson-spine-generate] batch cap hit: ${allCandidates.length} courses, processing ${batchCap}, skipping ${cappedCount}`,
      );
    }

    const requests: SubmitBatchRequest[] = [];
    for (const course of courses) {
      const emitBriefs = emitBriefsPolicy && hasCapstoneData(course.assessment_structure);
      const gctx: GenContext = { course_id: course.course_id, bos_syllabus_id: course.bos_syllabus_id, emit_briefs: emitBriefs };
      requests.push({
        customId: `gen-${requests.length}`,
        params: buildGenParams(modelId, course, emitBriefs),
        context: gctx as unknown as Record<string, unknown>,
        dedupeKey: dedupeKey(course.course_id),
      });
    }

    if (aiAvailable && requests.length > 0) {
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
    courses: coursesCount,
    capped: cappedCount,
    generated,
    briefs_generated: briefsGenerated,
    skipped,
    ai_available: aiAvailable,
    submitted,
    collected: { jobs: collectedJobs, recorded },
    batch_cap: batchCap,
    emit_briefs_policy: emitBriefsPolicy,
    elapsed_ms: Date.now() - started,
  });
}
