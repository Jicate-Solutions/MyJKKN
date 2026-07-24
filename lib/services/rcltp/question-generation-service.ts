/**
 * RCLTP Part-B question generation — AI drafts comprehension questions from a
 * curated passage; a Senior Learner (learning facilitator) reviews & approves.
 * Nattraja CBSE, English only. AI authors; the Senior Learner is the authority
 * (nothing here writes status='approved' — the review path does that).
 *
 * DIRECT synchronous Anthropic call (mirrors remedial-plan-service.generateDraftDirect
 * + work-pulse/analyze) — NOT the ₹0 async Max lane. Two model calls per run:
 *   1. generate the question set (prompt encodes the locked pedagogy decisions)
 *   2. answer-key double-check (a second, independent pass verifies each key)
 * Then writes status='draft' rows via the service-role admin client.
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

export const QUESTION_GEN_JOB_TYPE = 'rcltp.question_generation';

type Admin = { from: (t: string) => any };

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

interface GenPassage {
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

interface KeyCheck {
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

/**
 * Generate → answer-key check → write draft rows for one passage. Returns a flat
 * result (repo runs strictNullChecks:false, so a discriminated union would not
 * narrow — see remedial-plan-service). Never throws for a handled failure.
 */
export async function generateQuestionsForPassage(
  admin: Admin,
  passageId: string
): Promise<QGenResult> {
  const { data: passage, error: pErr } = await admin
    .from('rcltp_passages')
    .select('id, institution_id, title, body, grade_level, content_level, difficulty, word_count, language')
    .eq('id', passageId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!passage) return { ok: false, reason: 'not_found' };
  // Nattraja CBSE is English-only — refuse non-English passages (no Tamil pipeline).
  if ((passage.language ?? 'en') !== 'en') return { ok: false, reason: 'not_english' };
  if (!passage.body || String(passage.body).trim().length === 0) {
    return { ok: false, reason: 'parse_failed', error: 'passage has no body text' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_key' };

  const { model_id } = await resolveChatModel(QUESTION_GEN_JOB_TYPE);
  const client = new Anthropic({ apiKey });

  // 1. generate
  const genMsg = await client.messages.create({
    model: model_id,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(passage as GenPassage) }],
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
      messages: [{ role: 'user', content: buildCheckerPrompt(passage as GenPassage, parsed.questions) }],
    });
    checks = parseChecks(extractText(chkMsg));
  } catch {
    checks = [];
  }

  // 3. write draft rows (source='ai_generated', status='draft' — never approved here)
  const rows = parsed.questions.map((q, i) => ({
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
      generated_by_model: `direct:${model_id}`,
      coverage_note: i === 0 ? parsed.coverage_note : undefined,
      generated_via: 'rcltp.question_generation',
    },
  }));

  const { error: insErr } = await admin.from('rcltp_part_b_questions').insert(rows);
  if (insErr) return { ok: false, reason: 'record_failed', error: insErr.message };
  return { ok: true, count: rows.length };
}
