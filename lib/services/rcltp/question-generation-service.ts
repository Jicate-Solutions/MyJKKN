/**
 * RCLTP Part-B question generation — AI drafts comprehension questions from a
 * curated passage; a Senior Learner (learning facilitator) reviews & approves.
 * Nattraja CBSE, English only. AI authors; the Senior Learner is the authority
 * (nothing here writes status='approved' — the review path does that).
 *
 * TWO PATHS, ONE EFFECT. Both produce byte-identical status='draft' rows via
 * recordQuestions(); only ai_meta.generated_by_model differs.
 *   • ₹0 MAX LANE (default, overnight) — enqueueQuestionGeneration() puts stage 1
 *     on the lane; the collect sweep parses it and chains stage 2
 *     (enqueueKeyCheck); stage 2's collect writes the rows. Nobody waits.
 *   • DIRECT (secret-gated) — generateQuestionsForPassage() makes both Anthropic
 *     calls inline. Paid, immediate; kept for an operator "generate now" and for
 *     a deterministic proof when the Max seat is idle.
 *
 * Two model calls either way:
 *   1. generate the question set (prompt encodes the locked pedagogy decisions)
 *   2. answer-key double-check (a second, INDEPENDENT pass verifies each key)
 * Stage 2 is deliberately a separate call/job, never folded into stage 1: its
 * verdicts populate ai_agreed_count, which is what the "Approve all AI-agreed"
 * batch button reads. A checker that can see itself writing is a rubber stamp.
 *
 * Locked decisions (Director interview 2026-07-23): MCQ + short-answer mix ·
 * Marzano's New Taxonomy level per question with a spread · mostly grade-level +
 * a few labelled stretch (bonus, excluded from the core score by the scoring
 * engine) · AI writes the answer key (hidden from learners by the take-flow RPC) ·
 * second-AI answer-key check · quality-over-quantity (never pad a thin passage) ·
 * capture the AI original in ai_meta.ai_draft so a human edit is a learnable signal.
 */

import Anthropic from '@anthropic-ai/sdk';
import { resolveChatModel } from '@/lib/services/platform/ai-clients/chat';
import { enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import type { createServiceRoleClient } from '@/lib/supabase/server';

/** Stage 1 — draft the question set from a passage. */
export const QUESTION_GEN_JOB_TYPE = 'rcltp.question_generation';
/** Stage 2 — re-read the passage and judge every answer key, independently. */
export const QUESTION_KEYCHECK_JOB_TYPE = 'rcltp.question_keycheck';
/** Both stages, for a single multi-type collect sweep. */
export const RCLTP_QGEN_JOB_TYPES = [QUESTION_GEN_JOB_TYPE, QUESTION_KEYCHECK_JOB_TYPE];

type Admin = { from: (t: string) => any };
/** The lane RPCs need the real service-role client, not the loose read shape. */
type LaneAdmin = ReturnType<typeof createServiceRoleClient>;

export interface GenQuestion {
  question_text: string;
  question_type: 'mcq' | 'short_answer';
  options: string[] | null;
  correct_answer: string;
  marzano_level: string;
  is_stretch: boolean;
  max_score: number;
  rationale: string;
}

export interface GenPassage {
  id: string;
  institution_id: string | null;
  title: string | null;
  body: string;
  grade_level: number | null;
  content_level: string | null;
  difficulty: number | null;
  word_count: number | null;
  language: string | null;
}

export interface KeyCheck {
  index: number;
  verdict: 'agree' | 'disagree' | 'ambiguous' | 'unchecked';
  note?: string;
}

const MARZANO_LEVELS = ['retrieval', 'comprehension', 'analysis', 'knowledge_utilization'];

const SYSTEM_PROMPT = `You are an expert early-reading assessment author for a CBSE school, writing Part-B reading-comprehension questions for grade 3-4 learners in English only.

You are given ONE reading passage. Produce a set of comprehension questions that a learning facilitator (a Senior Learner) will review and approve before any learner sees them.

RULES:
1. QUESTION MIX: produce a mix of multiple-choice ("mcq") and short-answer questions — roughly half and half. Each mcq has exactly 4 short options with exactly one correct. Short-answer questions expect a 1-2 sentence answer a grade 3-4 child could write.
2. THINKING LEVELS (Marzano's New Taxonomy): tag every question with ONE level from {retrieval, comprehension, analysis, knowledge_utilization}. The SET must COVER A SPREAD — never all retrieval. Aim roughly: retrieval (recall a stated fact), comprehension (integrate/summarise/simple inference), analysis (compare, classify, cause/effect), and at most one knowledge_utilization (use an idea from the passage to decide/solve). Do NOT use metacognition or self-system levels — they do not fit a reading test.
3. DIFFICULTY: keep MOST questions at the passage's grade/reading level. Include only 1-2 "stretch" questions that are a notch harder, and mark them "is_stretch": true. Every other question is "is_stretch": false.
4. ANSWER KEY: give the correct_answer for every question (for mcq, the EXACT text of the correct option; for short-answer, a model answer that states the key idea that must appear).
5. QUALITY OVER QUANTITY: generate ONLY as many genuinely good questions as the passage can support — never pad with filler or trivially-obvious questions. A short or thin passage should yield fewer (as few as 3). Explain the count in coverage_note.
6. AGE-APPROPRIATE: simple, warm, clear language; nothing frightening, adult, or off-topic. Every question must be answerable ONLY from the passage.
7. Output STRICT JSON only, no prose outside it, matching this exact shape:
{"questions":[{"question_text":"...","question_type":"mcq"|"short_answer","options":["..","..","..",".."]|null,"correct_answer":"...","marzano_level":"retrieval"|"comprehension"|"analysis"|"knowledge_utilization","is_stretch":true|false,"max_score":1,"rationale":"one line: the comprehension skill this checks"}],"coverage_note":"how many questions and why"}`;

const CHECKER_SYSTEM = `You are a meticulous answer-key checker for a grade 3-4 reading test. You are given a passage and a list of proposed questions WITH their proposed correct answers. For EACH question, re-read the passage and decide INDEPENDENTLY whether the proposed correct answer is actually correct, unambiguous, and answerable from the passage alone. Do NOT rewrite the questions — only judge the keys. Be strict: if a question has more than one defensible answer, mark "ambiguous". Output STRICT JSON only:
{"checks":[{"index":0,"verdict":"agree"|"disagree"|"ambiguous","note":"only if not agree"}]}`;

export function buildUserPrompt(p: GenPassage): string {
  return `Passage title: ${p.title ?? '(untitled)'}
Grade level: ${p.grade_level ?? 'unspecified'}   Reading/content level: ${p.content_level ?? 'unspecified'}   Word count: ${p.word_count ?? 'unspecified'}

PASSAGE:
"""
${p.body}
"""

Generate the comprehension question set now, following every rule. Output strict JSON only.`;
}

function buildCheckerPrompt(p: GenPassage, questions: GenQuestion[]): string {
  const list = questions.map((q, i) => ({
    index: i,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    proposed_correct_answer: q.correct_answer,
  }));
  return `PASSAGE:
"""
${p.body}
"""

PROPOSED QUESTIONS (with proposed correct answers):
${JSON.stringify(list, null, 1)}

Judge each proposed correct answer. Output strict JSON only.`;
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** Strip a ```json fence (if any) and JSON.parse, with a brace-match fallback. */
function parseJsonLoose<T>(text: string): T | null {
  const body = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(body) as T;
  } catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

export function parseQuestions(
  text: string
): { questions: GenQuestion[]; coverage_note: string } | null {
  const parsed = parseJsonLoose<{ questions?: unknown; coverage_note?: unknown }>(text);
  if (!parsed || !Array.isArray(parsed.questions)) return null;
  const questions: GenQuestion[] = [];
  for (const raw of parsed.questions as any[]) {
    if (!raw || typeof raw.question_text !== 'string' || typeof raw.correct_answer !== 'string') {
      continue; // skip malformed items rather than fail the whole set
    }
    const type: 'mcq' | 'short_answer' = raw.question_type === 'mcq' ? 'mcq' : 'short_answer';
    const options =
      type === 'mcq' && Array.isArray(raw.options) ? raw.options.map((o: unknown) => String(o)) : null;
    const level = MARZANO_LEVELS.includes(raw.marzano_level) ? raw.marzano_level : 'comprehension';
    questions.push({
      question_text: raw.question_text.trim(),
      question_type: type,
      options,
      correct_answer: raw.correct_answer.trim(),
      marzano_level: level,
      is_stretch: raw.is_stretch === true,
      max_score: 1,
      rationale: typeof raw.rationale === 'string' ? raw.rationale.trim() : '',
    });
  }
  if (questions.length === 0) return null;
  return {
    questions,
    coverage_note: typeof parsed.coverage_note === 'string' ? parsed.coverage_note : '',
  };
}

function parseChecks(text: string): KeyCheck[] {
  const parsed = parseJsonLoose<{ checks?: unknown }>(text);
  if (!parsed || !Array.isArray(parsed.checks)) return [];
  const out: KeyCheck[] = [];
  for (const raw of parsed.checks as any[]) {
    if (!raw || typeof raw.index !== 'number') continue;
    const verdict =
      raw.verdict === 'disagree' || raw.verdict === 'ambiguous' ? raw.verdict : 'agree';
    out.push({ index: raw.index, verdict, note: typeof raw.note === 'string' ? raw.note : undefined });
  }
  return out;
}

export interface QGenResult {
  ok: boolean;
  count?: number;
  reason?: 'not_found' | 'not_english' | 'no_key' | 'parse_failed' | 'record_failed';
  error?: string;
}

const PASSAGE_COLUMNS =
  'id, institution_id, title, body, grade_level, content_level, difficulty, word_count, language';

/**
 * Load one passage and apply the two gates both paths share (English-only, has
 * body). FLAT result, not a discriminated union: the repo runs
 * strictNullChecks:false, under which a boolean discriminant does not narrow the
 * false branch (see QGenResult / remedial-plan-service for the same shape).
 */
export interface LoadedPassage {
  ok: boolean;
  passage?: GenPassage;
  reason?: QGenResult['reason'];
  error?: string;
}

export async function loadGenPassage(admin: Admin, passageId: string): Promise<LoadedPassage> {
  const { data, error } = await admin
    .from('rcltp_passages')
    .select(PASSAGE_COLUMNS)
    .eq('id', passageId)
    .maybeSingle();
  if (error) return { ok: false, reason: 'not_found', error: error.message };
  if (!data) return { ok: false, reason: 'not_found' };
  // Nattraja CBSE is English-only — refuse non-English passages (no Tamil pipeline).
  if ((data.language ?? 'en') !== 'en') return { ok: false, reason: 'not_english' };
  if (!data.body || String(data.body).trim().length === 0) {
    return { ok: false, reason: 'parse_failed', error: 'passage has no body text' };
  }
  return { ok: true, passage: data as GenPassage };
}

/**
 * Write the draft rows. SHARED by the direct path and the Max lane so the rows
 * are byte-identical whichever produced them — only `provenance` differs
 * (`direct:<model>` vs `maxlane:rcltp.question_generation`). Never writes
 * status='approved'; that is the Senior Learner's review path alone.
 */
export async function recordQuestions(
  admin: Admin,
  passage: GenPassage,
  questions: GenQuestion[],
  coverageNote: string,
  checks: KeyCheck[],
  provenance: string
): Promise<QGenResult> {
  const rows = questions.map((q, i) => ({
    passage_id: passage.id,
    institution_id: passage.institution_id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    correct_answer: q.correct_answer,
    max_score: q.max_score,
    order_index: i,
    is_active: true,
    source: 'ai_generated',
    status: 'draft',
    ai_meta: {
      marzano_level: q.marzano_level,
      is_stretch: q.is_stretch,
      rationale: q.rationale,
      checker: checks.find((c) => c.index === i) ?? { index: i, verdict: 'unchecked' },
      // ai_draft = the original AI text, frozen so a Senior Learner's edit is a
      // measurable "what changed" signal (the self-improving loop input).
      ai_draft: {
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_answer: q.correct_answer,
      },
      generated_by_model: provenance,
      coverage_note: i === 0 ? coverageNote : undefined,
      generated_via: QUESTION_GEN_JOB_TYPE,
    },
  }));

  const { error: insErr } = await admin.from('rcltp_part_b_questions').insert(rows);
  if (insErr) return { ok: false, reason: 'record_failed', error: insErr.message };
  return { ok: true, count: rows.length };
}

// ── ₹0 Max lane (async, overnight) ───────────────────────────────────────────

/** _ctx stashed on a stage-1 job — the collect sweep re-reads the passage. */
export interface QGenContext {
  passageId: string;
}

/** _ctx stashed on a stage-2 job: the questions awaiting an independent verdict. */
export interface QKeyCheckContext {
  passageId: string;
  questions: GenQuestion[];
  coverageNote: string;
}

/**
 * Stage 1: enqueue question generation for ONE passage on the ₹0 Max lane.
 * Writes nothing — rows land only after stage 2 (or after stage 2 is proven
 * unavailable). The dedupeKey guards a double-request: a passage already
 * queued/claimed/running returns in_flight, which the caller treats as handled.
 */
export async function enqueueQuestionGeneration(
  admin: LaneAdmin,
  passageId: string
): Promise<{ ok: boolean; jobId?: string | null; inFlight?: boolean; reason?: string; error?: string }> {
  const loaded = await loadGenPassage(admin as unknown as Admin, passageId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, error: loaded.error };

  const ctx: QGenContext = { passageId };
  const r = await enqueueJobsLane(admin, {
    jobType: QUESTION_GEN_JOB_TYPE,
    prompt: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(loaded.passage)}`,
    context: ctx as unknown as Record<string, unknown>,
    dedupeKey: `${QUESTION_GEN_JOB_TYPE}|${passageId}`,
  });
  if (r.ok) return { ok: true, jobId: r.jobId };
  const fail = r as { reason?: string; error?: string };
  if (fail.reason === 'in_flight') return { ok: true, jobId: null, inFlight: true };
  return { ok: false, reason: fail.reason, error: fail.error };
}

/**
 * Stage 2: enqueue the INDEPENDENT answer-key check for a generated set. A fresh
 * job means a fresh context and a different system prompt, so the checker is not
 * grading questions it can still see itself writing — which is what keeps
 * ai_agreed_count (and the batch-approve button it feeds) honest.
 */
export async function enqueueKeyCheck(
  admin: LaneAdmin,
  passage: GenPassage,
  questions: GenQuestion[],
  coverageNote: string
): Promise<{ ok: boolean; jobId?: string | null; inFlight?: boolean; reason?: string; error?: string }> {
  const ctx: QKeyCheckContext = { passageId: passage.id, questions, coverageNote };
  const r = await enqueueJobsLane(admin, {
    jobType: QUESTION_KEYCHECK_JOB_TYPE,
    prompt: `${CHECKER_SYSTEM}\n\n${buildCheckerPrompt(passage, questions)}`,
    context: ctx as unknown as Record<string, unknown>,
    dedupeKey: `${QUESTION_KEYCHECK_JOB_TYPE}|${passage.id}|${questions.length}`,
  });
  if (r.ok) return { ok: true, jobId: r.jobId };
  const fail = r as { reason?: string; error?: string };
  if (fail.reason === 'in_flight') return { ok: true, jobId: null, inFlight: true };
  return { ok: false, reason: fail.reason, error: fail.error };
}

/** Parse a lane message (stage 2) into key-check verdicts. */
export function parseCheckMessage(msg: Anthropic.Message | null): KeyCheck[] {
  if (!msg) return [];
  return parseChecks(extractText(msg));
}

/** Parse a lane message (stage 1) into a question set. */
export function parseQuestionMessage(
  msg: Anthropic.Message | null
): { questions: GenQuestion[]; coverage_note: string } | null {
  if (!msg) return null;
  return parseQuestions(extractText(msg));
}

// ── direct generation (synchronous Anthropic — immediate / proof) ────────────

/**
 * Generate → answer-key check → write draft rows for one passage in ONE request.
 * Costs a paid call (not the ₹0 lane), so it stays secret-gated: an operator
 * "generate now" and a deterministic proof when the Max seat is idle. Returns a
 * flat result (repo runs strictNullChecks:false, so a discriminated union would
 * not narrow — see remedial-plan-service). Never throws for a handled failure.
 */
export async function generateQuestionsForPassage(
  admin: Admin,
  passageId: string
): Promise<QGenResult> {
  const loaded = await loadGenPassage(admin, passageId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, error: loaded.error };
  const passage = loaded.passage;

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const { model_id } = await resolveChatModel(QUESTION_GEN_JOB_TYPE);
  const client = new Anthropic({ apiKey });

  // 1. generate
  const genMsg = await client.messages.create({
    model: model_id,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(passage) }],
  });
  const parsed = parseQuestions(extractText(genMsg));
  if (!parsed) return { ok: false, reason: 'parse_failed' };

  // 2. answer-key double-check (non-fatal: a checker failure leaves verdict='unchecked')
  let checks: KeyCheck[] = [];
  try {
    const chkMsg = await client.messages.create({
      model: model_id,
      max_tokens: 1500,
      system: CHECKER_SYSTEM,
      messages: [{ role: 'user', content: buildCheckerPrompt(passage, parsed.questions) }],
    });
    checks = parseChecks(extractText(chkMsg));
  } catch {
    checks = [];
  }

  // 3. write draft rows (source='ai_generated', status='draft' — never approved here)
  return recordQuestions(admin, passage, parsed.questions, parsed.coverage_note, checks, `direct:${model_id}`);
}
