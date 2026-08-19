// =============================================================================
// lib/services/pde-osce-scoring.ts
// PDE Clinical Reasoning — OSCE rubric scoring service
// =============================================================================
//
// Ports the AICBL standalone IP (lib/osce/rubric.ts + lib/osce/extractor.ts)
// into MyJKKN, adapted to read policies via `fn_get_policy_clinical_reasoning`
// and assessment data from `pde_assessments` + `pde_assessment_questions` +
// `pde_submissions`.
//
// What it does:
//   1. Loads the rubric (per-domain weights) from `pde_assessments.rubric` —
//      falls back to a 5-domain default if the row is missing rubric data.
//   2. For each domain, builds a prompt from the policy-defined scoring
//      template + relevant Q answers and ground truth, calls the AI provider
//      configured by `clinical_reasoning.ai.provider` + `clinical_reasoning.ai.model`,
//      parses the JSON score, clamps to [0, max_score].
//   3. Aggregates per-domain scores into an overall OsceScore (percentage). The
//      denominator is every question the assessment ASKS (that the rubric
//      claims), not just the answers present in the submission — a skipped
//      question contributes its full weight to the total and nothing to the
//      earned score (Director decision). See planScoring.
//
// Reused by `/api/pde/clinical-reasoning/score` after the final question of an
// attempt is submitted.
//
// Provider routing reuses `lib/services/platform/ai-clients/sentiment.ts`
// patterns (direct fetch to OpenAI / Google) — no shared `getProvider` exists
// in MyJKKN yet for chat-completion text generation. When that substrate
// lands, this can collapse to a single call.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface RubricDomain {
  key: string;
  label: string;
  description: string;
  max_score: number;
  q_numbers: number[];
}

export interface DomainScore {
  domain_key: string;
  domain_label: string;
  score: number;
  max_score: number;
  justification: string;
  evidence_q_numbers: number[];
  /**
   * Questions of this domain the learner left blank. They contribute 0 to the
   * numerator and their full share to the denominator, so the score is honest
   * about what was skipped rather than silently narrowing the total.
   */
  unanswered_q_numbers?: number[];
}

export interface OsceScore {
  total_score: number;
  max_score: number;
  percentage: number;
  domain_scores: DomainScore[];
  /**
   * Questions the assessment asks that no rubric domain claims. These cannot be
   * scored (no domain owns a weight for them) — surfaced so a rubric authoring
   * gap is visible instead of quietly shrinking the assessment.
   */
  uncovered_q_numbers?: number[];
}

export interface PdeQuestion {
  id: string;
  q_number: number;
  question_text: string;
  ground_truth: string;
  key_concepts: string[];
}

export interface PdeAnswer {
  q_number: number;
  student_answer: string;
}

export interface ScoreAttemptArgs {
  supabase: SupabaseClient;
  assessmentId: string;
  caseTitle: string;
  questions: PdeQuestion[];
  answers: PdeAnswer[];
  rubricDomains?: RubricDomain[]; // optional override; usually pulled from assessment.rubric
}

// ----------------------------------------------------------------------------
// Defaults (used when assessment.rubric is null/empty)
// ----------------------------------------------------------------------------

const FALLBACK_RUBRIC: RubricDomain[] = [
  {
    key: 'clinical_findings',
    label: 'Clinical Findings Identification',
    description: 'Recognizing key signs/symptoms from history and examination',
    max_score: 5,
    q_numbers: [1],
  },
  {
    key: 'differential_diagnosis',
    label: 'Differential Diagnosis',
    description: 'Logical listing of differential diagnoses with reasons',
    max_score: 5,
    q_numbers: [2, 3],
  },
  {
    key: 'diagnostic_reasoning',
    label: 'Diagnostic Reasoning',
    description: 'Justification of provisional diagnosis based on findings',
    max_score: 5,
    q_numbers: [2],
  },
  {
    key: 'investigation_judgement',
    label: 'Investigation Judgement',
    description: 'Appropriateness of investigations chosen and rationale',
    max_score: 5,
    q_numbers: [3],
  },
  {
    key: 'management_planning',
    label: 'Management Planning',
    description: 'Comprehensive management plan with reasoning',
    max_score: 5,
    q_numbers: [4],
  },
];

const DEFAULT_SCORING_TEMPLATE = `You are an OSCE rubric examiner for dental clinical reasoning. Score the student on the following domain on a 1-5 Likert scale.

CASE: {case_title}

DOMAIN: {domain_label}
DESCRIPTION: {domain_description}

STUDENT ANSWERS RELEVANT TO THIS DOMAIN:
{relevant_answers}

GROUND TRUTH:
{ground_truth}

SCORING:
- 5: Excellent — comprehensive, clinically accurate, well-reasoned
- 4: Good — minor gaps but solid reasoning
- 3: Adequate — meets minimum competency
- 2: Below standard — significant gaps
- 1: Poor — major errors or omissions

Return ONLY a JSON object: {"score": <number>, "justification": "<one-paragraph explanation>"}`;

// ----------------------------------------------------------------------------
// Policy reads via RPC
// ----------------------------------------------------------------------------

async function getPolicy<T>(
  supabase: SupabaseClient,
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await supabase.rpc(
      'fn_get_policy_clinical_reasoning',
      {
        p_key: key,
        p_default: fallback as unknown,
      },
    );
    if (error) return fallback;
    return (data as T) ?? fallback;
  } catch {
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// Template interpolation — simple {placeholder} substitution
// ----------------------------------------------------------------------------

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

// ----------------------------------------------------------------------------
// AI provider call — minimal chat completion that returns parsed JSON.
// Routes through OpenAI / Google via direct fetch (mirrors sentiment.ts).
// ----------------------------------------------------------------------------

interface AiCallResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function callAi(
  provider: string,
  modelId: string,
  systemPrompt: string,
): Promise<AiCallResult> {
  if (provider === 'google') {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: 'Return the JSON now.' }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google API ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Google returned empty content');
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Return the JSON now.' },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');
    return {
      text: content,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  }

  throw new Error(`Unsupported provider for OSCE scoring: ${provider}`);
}

// ----------------------------------------------------------------------------
// JSON score parser — handles plain JSON and ```json fences. Clamps to [0,max].
// ----------------------------------------------------------------------------

function parseScoreJson(
  text: string,
  maxScore: number,
): { score: number; justification: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  let score = 0;
  let justification = 'AI response could not be parsed.';
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.score === 'number') {
      score = Math.max(0, Math.min(maxScore, parsed.score));
    }
    if (typeof parsed.justification === 'string') {
      justification = parsed.justification;
    }
  } catch {
    const m = cleaned.match(/"score"\s*:\s*([0-9.]+)/);
    if (m) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) score = Math.max(0, Math.min(maxScore, n));
    }
    justification = cleaned.slice(0, 500);
  }
  return { score, justification };
}

// ----------------------------------------------------------------------------
// Rubric loader — pulls from assessment.rubric, validates, returns or falls
// back. Direction-of-truth: assessment row > FALLBACK_RUBRIC.
// ----------------------------------------------------------------------------

export function parseRubricFromAssessment(raw: unknown): RubricDomain[] {
  if (!raw || typeof raw !== 'object') return [];
  // Accept two shapes:
  //   (1) { domains: [...] } — what Agent A may seed
  //   (2) [...] — direct array
  const candidates: unknown = Array.isArray(raw)
    ? raw
    : (raw as Record<string, unknown>).domains;
  if (!Array.isArray(candidates)) return [];
  const out: RubricDomain[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === 'string' ? o.key : null;
    const label = typeof o.label === 'string' ? o.label : null;
    const description = typeof o.description === 'string' ? o.description : '';
    const max_score = typeof o.max_score === 'number' ? o.max_score : 5;
    const q_numbers = Array.isArray(o.q_numbers)
      ? o.q_numbers.filter((n): n is number => typeof n === 'number')
      : [];
    if (!key || !label) continue;
    out.push({ key, label, description, max_score, q_numbers });
  }
  return out;
}

export function loadFallbackRubric(): RubricDomain[] {
  return [...FALLBACK_RUBRIC];
}

// ----------------------------------------------------------------------------
// Scoring plan — decides the DENOMINATOR before any AI call.
//
// Director decision: a skipped question counts as zero. So the score is taken
// over every question the assessment asks (that the rubric claims), not only
// over the answers present in the submission. A blank question adds its full
// share to the denominator and nothing to the numerator.
//
// This also removes a structural inflation: the rubric prompt's Likert scale
// bottoms out at 1 ("Poor"), so handing an examiner model a blank answer could
// never yield 0 — a fully-unanswered domain used to float up to 1-3 out of 5.
// Blank domains are now scored 0 arithmetically, with no AI call at all.
// ----------------------------------------------------------------------------

/** A blank or whitespace-only response is NOT an answer. */
function isAnswered(answer: PdeAnswer | undefined): boolean {
  const text = answer?.student_answer;
  return typeof text === 'string' && text.trim().length > 0;
}

export interface DomainAllocation {
  domain: RubricDomain;
  /** q_numbers of this domain that the assessment actually asks. */
  present_q_numbers: number[];
  /** Present questions the learner answered. */
  answered_q_numbers: number[];
  /** Present questions left blank — denominator only. */
  unanswered_q_numbers: number[];
  /**
   * Ceiling the examiner model may award: domain.max_score scaled by the share
   * of the domain's questions that were answered. The remainder
   * (max_score - scored_max) is denominator-only.
   */
  scored_max: number;
}

export interface ScoringPlan {
  allocations: DomainAllocation[];
  uncovered_q_numbers: number[];
}

export const UNANSWERED_DOMAIN_JUSTIFICATION =
  'Not sent to the examiner: every question in this domain was left blank. ' +
  'A skipped question counts as zero, so this domain scores 0 out of its full weight.';

/**
 * Build the per-domain allocation for an attempt. Pure — no I/O — so both the
 * direct provider path and the max-lane path share one denominator, and so the
 * arithmetic is unit-testable without mocking an AI provider.
 */
export function planScoring(
  rubric: RubricDomain[],
  questions: PdeQuestion[],
  answers: PdeAnswer[],
): ScoringPlan {
  // Last non-blank response for a q_number wins; a blank never overwrites a
  // real answer (submissions can carry a draft row plus the final one).
  const answerByQ = new Map<number, PdeAnswer>();
  for (const a of answers) {
    if (!answerByQ.has(a.q_number) || isAnswered(a)) answerByQ.set(a.q_number, a);
  }
  const askedQNumbers = new Set(questions.map((q) => q.q_number));

  const allocations: DomainAllocation[] = [];
  const covered = new Set<number>();

  for (const domain of rubric) {
    const present = domain.q_numbers.filter((n) => askedQNumbers.has(n));
    for (const n of present) covered.add(n);

    // A domain this assessment asks nothing about is excluded from BOTH the
    // numerator and the denominator. That is a rubric/assessment mismatch, not
    // a learner failure — charging its max would cap an otherwise perfect
    // attempt below the passing threshold.
    if (present.length === 0) continue;

    const answered = present.filter((n) => isAnswered(answerByQ.get(n)));
    const unanswered = present.filter((n) => !isAnswered(answerByQ.get(n)));
    allocations.push({
      domain,
      present_q_numbers: present,
      answered_q_numbers: answered,
      unanswered_q_numbers: unanswered,
      scored_max: roundTo(
        (domain.max_score * answered.length) / present.length,
        4,
      ),
    });
  }

  const uncovered = [
    ...new Set(questions.map((q) => q.q_number).filter((n) => !covered.has(n))),
  ].sort((a, b) => a - b);

  return { allocations, uncovered_q_numbers: uncovered };
}

/** Domain the learner left entirely blank: 0 awarded, full weight charged. */
function zeroDomainScore(allocation: DomainAllocation): DomainScore {
  return {
    domain_key: allocation.domain.key,
    domain_label: allocation.domain.label,
    score: 0,
    max_score: allocation.domain.max_score,
    justification: UNANSWERED_DOMAIN_JUSTIFICATION,
    evidence_q_numbers: [],
    unanswered_q_numbers: allocation.unanswered_q_numbers,
  };
}

/** Make a partially-answered domain's reduced ceiling visible in the write-up. */
function withUnansweredNote(
  justification: string,
  allocation: DomainAllocation,
): string {
  if (allocation.unanswered_q_numbers.length === 0) return justification;
  const blanks = allocation.unanswered_q_numbers.map((n) => `Q${n}`).join(', ');
  return `${justification}\n\n[Auto] ${blanks} left blank — counted as zero, so this domain was scored out of ${roundTo(
    allocation.scored_max,
    2,
  )} of ${allocation.domain.max_score}.`;
}

// ----------------------------------------------------------------------------
// Aggregator — sums per-domain scores into an OsceScore.
// ----------------------------------------------------------------------------

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function aggregateScore(
  domainScores: DomainScore[],
  uncoveredQNumbers: number[] = [],
): OsceScore {
  const total_score = domainScores.reduce((sum, d) => sum + d.score, 0);
  const max_score = domainScores.reduce((sum, d) => sum + d.max_score, 0);
  // Divide-by-zero guard: an assessment with no scorable question yields 0,
  // never NaN. 0 is also the safe verdict — an empty assessment must not pass.
  const percentage = max_score > 0 ? (total_score / max_score) * 100 : 0;
  return {
    total_score: roundTo(total_score, 2),
    max_score: roundTo(max_score, 2),
    percentage: roundTo(percentage, 2),
    domain_scores: domainScores,
    uncovered_q_numbers: uncoveredQNumbers,
  };
}

// ----------------------------------------------------------------------------
// Per-domain extractor — builds prompt, calls AI, parses, returns DomainScore.
// ----------------------------------------------------------------------------

interface ExtractArgs {
  supabase: SupabaseClient;
  allocation: DomainAllocation;
  caseTitle: string;
  questions: PdeQuestion[];
  answers: PdeAnswer[];
  provider: string;
  modelId: string;
}

/**
 * Build the per-domain OSCE scoring prompt + the evidence q-numbers. Pure (no
 * I/O) so the direct path (extractDomainScore) and the ₹0 max-pde path
 * (scoreAttemptViaMaxLane) produce byte-identical prompts.
 */
function buildDomainScorePrompt(
  domain: RubricDomain,
  template: string,
  caseTitle: string,
  questions: PdeQuestion[],
  answers: PdeAnswer[],
  includeQNumbers: number[],
): { systemPrompt: string; evidenceNumbers: number[] } {
  // Only the ANSWERED questions of this domain reach the examiner model. Blank
  // ones are scored zero arithmetically (see planScoring) instead of being
  // handed over on a scale whose floor is 1.
  const relevantQs = questions.filter((q) => includeQNumbers.includes(q.q_number));
  const evidenceNumbers = relevantQs.map((q) => q.q_number);

  const relevant_answers = relevantQs
    .map((q) => {
      const ans = answers.find((a) => a.q_number === q.q_number);
      const studentText = ans?.student_answer ?? '(no answer submitted)';
      return `Q${q.q_number}. ${q.question_text}\nStudent: ${studentText}`;
    })
    .join('\n\n');

  const ground_truth = relevantQs
    .map((q) => `Q${q.q_number} ground truth: ${q.ground_truth}`)
    .join('\n\n');

  const systemPrompt = interpolate(template, {
    case_title: caseTitle,
    domain_label: domain.label,
    domain_description: domain.description,
    relevant_answers,
    ground_truth,
  });

  return { systemPrompt, evidenceNumbers };
}

async function extractDomainScore({
  supabase,
  allocation,
  caseTitle,
  questions,
  answers,
  provider,
  modelId,
}: ExtractArgs): Promise<DomainScore> {
  const domain = allocation.domain;
  const template = await getPolicy<string>(
    supabase,
    'scoring.osce_prompt_template',
    DEFAULT_SCORING_TEMPLATE,
  );
  const { systemPrompt, evidenceNumbers } = buildDomainScorePrompt(
    domain,
    template,
    caseTitle,
    questions,
    answers,
    allocation.answered_q_numbers,
  );

  const aiResponse = await callAi(provider, modelId, systemPrompt);
  // Clamp to the ANSWERED share, not the full domain weight — the blank share
  // is denominator-only and must stay unavailable to the examiner model.
  const { score, justification } = parseScoreJson(
    aiResponse.text,
    allocation.scored_max,
  );

  return {
    domain_key: domain.key,
    domain_label: domain.label,
    score,
    max_score: domain.max_score,
    justification: withUnansweredNote(justification, allocation),
    evidence_q_numbers: evidenceNumbers,
    unanswered_q_numbers: allocation.unanswered_q_numbers,
  };
}

/**
 * Is the ₹0 max-pde lane active for this PDE job type? True only when the job
 * type is registered AND enabled (the Director's cutover flip). Fail-safe: any
 * read error returns false → the direct provider path runs.
 */
async function pdeMaxLaneActive(
  supabase: SupabaseClient,
  jobType: string,
): Promise<boolean> {
  try {
    const { data } = await (supabase as any)
      .from('ai_job_types')
      .select('enabled')
      .eq('job_type', jobType)
      .maybeSingle();
    return data?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Score every rubric domain on the ₹0 max-pde sub-lane: enqueue one job per
 * domain (all claimed concurrently by the Claude Max seat), long-poll for every
 * result, then parse each with the SAME parseScoreJson the direct path uses. A
 * domain whose job fails or times out contributes a 0 with an error
 * justification — identical to the direct path's per-domain failure handling —
 * so aggregateScore always returns a valid OsceScore. No paid fallback.
 */
async function scoreAttemptViaMaxLane(
  supabase: SupabaseClient,
  plan: ScoringPlan,
  caseTitle: string,
  questions: PdeQuestion[],
  answers: PdeAnswer[],
): Promise<OsceScore> {
  const template = await getPolicy<string>(
    supabase,
    'scoring.osce_prompt_template',
    DEFAULT_SCORING_TEMPLATE,
  );

  const stamp = Date.now();
  const admin = supabase as any;

  // Enqueue one job per domain (unique dedupeKey per domain per attempt).
  const enqueued = await Promise.all(
    plan.allocations.map(async (allocation) => {
      const domain = allocation.domain;
      // Fully-blank domain: scored 0 arithmetically, no lane job spent on it.
      if (allocation.answered_q_numbers.length === 0) {
        return {
          allocation,
          evidenceNumbers: [] as number[],
          jobId: null,
          blank: true,
        };
      }
      const { systemPrompt, evidenceNumbers } = buildDomainScorePrompt(
        domain,
        template,
        caseTitle,
        questions,
        answers,
        allocation.answered_q_numbers,
      );
      const r = await enqueueJobsLane(admin, {
        jobType: 'pde.osce_score',
        prompt: systemPrompt,
        context: { domain_key: domain.key },
        dedupeKey: `pde-osce:${domain.key}:${stamp}`,
      });
      const jobId = r.ok ? (r as { jobId?: string }).jobId ?? null : null;
      return { allocation, evidenceNumbers, jobId, blank: false };
    }),
  );

  const jobIds = enqueued
    .map((e) => e.jobId)
    .filter((id): id is string => typeof id === 'string');
  const results =
    jobIds.length > 0
      ? await awaitJobsLaneResults(admin, jobIds, { deadlineMs: 270_000 })
      : new Map<string, string>();

  const domainScores: DomainScore[] = enqueued.map((e) => {
    if (e.blank) return zeroDomainScore(e.allocation);
    const domain = e.allocation.domain;
    const text = e.jobId ? results.get(e.jobId) : undefined;
    if (!text) {
      return {
        domain_key: domain.key,
        domain_label: domain.label,
        score: 0,
        max_score: domain.max_score,
        justification: e.jobId
          ? 'Scoring did not complete in time on the Max lane.'
          : 'Scoring could not be started on the Max lane.',
        evidence_q_numbers: e.evidenceNumbers,
        unanswered_q_numbers: e.allocation.unanswered_q_numbers,
      };
    }
    const { score, justification } = parseScoreJson(
      text,
      e.allocation.scored_max,
    );
    return {
      domain_key: domain.key,
      domain_label: domain.label,
      score,
      max_score: domain.max_score,
      justification: withUnansweredNote(justification, e.allocation),
      evidence_q_numbers: e.evidenceNumbers,
      unanswered_q_numbers: e.allocation.unanswered_q_numbers,
    };
  });

  return aggregateScore(domainScores, plan.uncovered_q_numbers);
}

// ----------------------------------------------------------------------------
// Top-level — score a full attempt across all rubric domains.
// ----------------------------------------------------------------------------

export async function scoreAttempt(args: ScoreAttemptArgs): Promise<OsceScore> {
  const { supabase, caseTitle, questions, answers } = args;
  const rubric =
    args.rubricDomains && args.rubricDomains.length > 0
      ? args.rubricDomains
      : FALLBACK_RUBRIC;

  // Fix the denominator BEFORE any AI call: every question the assessment asks
  // (that the rubric claims) is in the total, answered or not.
  const plan = planScoring(rubric, questions, answers);

  // Nothing scorable — an assessment with no questions, or a rubric that claims
  // none of the questions it asks. Return 0 without dividing by zero and
  // without inviting the examiner model to invent a score from an empty prompt.
  if (plan.allocations.length === 0) {
    return aggregateScore([], plan.uncovered_q_numbers);
  }

  // ₹0 Max lane: when pde.osce_score is enabled AND a max-pde runner is live,
  // score every domain via the Claude Max seat (₹0) instead of paid Gemini.
  // Dark by default — pdeMaxLaneActive fail-safes to false → the direct path.
  if (await pdeMaxLaneActive(supabase, 'pde.osce_score')) {
    return scoreAttemptViaMaxLane(supabase, plan, caseTitle, questions, answers);
  }

  // Read AI provider + model from policies (with sensible defaults)
  const providerRaw = await getPolicy<string>(supabase, 'ai.provider', 'google');
  const modelRaw = await getPolicy<string>(
    supabase,
    'ai.model',
    'gemini-2.5-pro',
  );
  // RPC returns JSONB so values may be wrapped in quotes if stored as JSON strings
  const provider = typeof providerRaw === 'string' ? providerRaw : 'google';
  const modelId = typeof modelRaw === 'string' ? modelRaw : 'gemini-2.5-pro';

  // Score each domain. Sequential rather than parallel — keeps per-domain
  // errors localized and avoids overwhelming the AI provider rate limit.
  const domainScores: DomainScore[] = [];
  for (const allocation of plan.allocations) {
    const domain = allocation.domain;
    // Every question in this domain was left blank — 0 out of its full weight,
    // decided arithmetically. No AI call, so no chance of a blank answer
    // floating up to the Likert floor of 1.
    if (allocation.answered_q_numbers.length === 0) {
      domainScores.push(zeroDomainScore(allocation));
      continue;
    }
    try {
      const ds = await extractDomainScore({
        supabase,
        allocation,
        caseTitle,
        questions,
        answers,
        provider,
        modelId,
      });
      domainScores.push(ds);
    } catch (e) {
      // Per-domain failure → 0 score with error justification. Aggregator
      // still produces a valid OsceScore (the missing domain just contributes 0).
      domainScores.push({
        domain_key: domain.key,
        domain_label: domain.label,
        score: 0,
        max_score: domain.max_score,
        justification: `Scoring failed: ${e instanceof Error ? e.message : String(e)}`,
        evidence_q_numbers: allocation.answered_q_numbers,
        unanswered_q_numbers: allocation.unanswered_q_numbers,
      });
    }
  }

  return aggregateScore(domainScores, plan.uncovered_q_numbers);
}
