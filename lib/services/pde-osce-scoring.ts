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
//   3. Aggregates per-domain scores into an overall OsceScore (percentage).
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
}

export interface OsceScore {
  total_score: number;
  max_score: number;
  percentage: number;
  domain_scores: DomainScore[];
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
// Aggregator — sums per-domain scores into an OsceScore.
// ----------------------------------------------------------------------------

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function aggregateScore(domainScores: DomainScore[]): OsceScore {
  const total_score = domainScores.reduce((sum, d) => sum + d.score, 0);
  const max_score = domainScores.reduce((sum, d) => sum + d.max_score, 0);
  const percentage = max_score > 0 ? (total_score / max_score) * 100 : 0;
  return {
    total_score: roundTo(total_score, 2),
    max_score: roundTo(max_score, 2),
    percentage: roundTo(percentage, 2),
    domain_scores: domainScores,
  };
}

// ----------------------------------------------------------------------------
// Per-domain extractor — builds prompt, calls AI, parses, returns DomainScore.
// ----------------------------------------------------------------------------

interface ExtractArgs {
  supabase: SupabaseClient;
  domain: RubricDomain;
  caseTitle: string;
  questions: PdeQuestion[];
  answers: PdeAnswer[];
  provider: string;
  modelId: string;
}

async function extractDomainScore({
  supabase,
  domain,
  caseTitle,
  questions,
  answers,
  provider,
  modelId,
}: ExtractArgs): Promise<DomainScore> {
  const relevantQs = questions.filter((q) => domain.q_numbers.includes(q.q_number));
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

  const template = await getPolicy<string>(
    supabase,
    'scoring.osce_prompt_template',
    DEFAULT_SCORING_TEMPLATE,
  );

  const systemPrompt = interpolate(template, {
    case_title: caseTitle,
    domain_label: domain.label,
    domain_description: domain.description,
    relevant_answers,
    ground_truth,
  });

  const aiResponse = await callAi(provider, modelId, systemPrompt);
  const { score, justification } = parseScoreJson(aiResponse.text, domain.max_score);

  return {
    domain_key: domain.key,
    domain_label: domain.label,
    score,
    max_score: domain.max_score,
    justification,
    evidence_q_numbers: evidenceNumbers,
  };
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
  for (const domain of rubric) {
    try {
      const ds = await extractDomainScore({
        supabase,
        domain,
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
        evidence_q_numbers: domain.q_numbers,
      });
    }
  }

  return aggregateScore(domainScores);
}
