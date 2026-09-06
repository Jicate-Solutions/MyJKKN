// lib/services/pde-coach-clinical-reasoning.ts
// ============================================================================
// PDE Clinical Reasoning coach — server-side Socratic-feedback service.
//
// Ports AICBL's `get-feedback.ts` (144 LOC) into MyJKKN's PDE pipeline.
// Called from PDEService.sendCoachMessage when contextType === 'clinical_case'.
//
// Reads 4 policies via fn_get_policy_clinical_reasoning RPC:
//   - ai.provider              (text: 'google' | 'openai' | 'anthropic')
//   - ai.model                 (text)
//   - ai.max_response_sentences (number)
//   - ai.system_prompt_template (text)
//
// Plus the cap policy:
//   - lifetime_attempts_per_case (number, default 5)
//
// Cap enforcement: count rows in pde_submissions matched on (learner_id,
// assessment_id). If count >= cap → throw FeedbackError(code='CAP_REACHED').
// NOTE: pde_submissions has no `status` column; we count all attempts.
//
// Cost tracking: every AI call writes a row to ai_model_usage with
// feature_key='pde.clinical_reasoning.coach', provider, model_id, tokens,
// cost_inr, success, duration_ms.
//
// AI failure: any thrown error from the AI client becomes FeedbackError(
// code='AI_FAILURE', retryable=true) so the API route returns 502 and the
// UI can show toast + retry.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { estimateChatCostInr } from '@/lib/services/platform/ai-clients/sentiment';
import { getModel } from '@/lib/services/platform/ai-providers';
import { FeedbackError } from '@/lib/services/pde-coach-errors';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';

// ---------------------------------------------------------------------------
// Types — shapes pulled from DB rows we care about
// ---------------------------------------------------------------------------

interface PatientScenario {
  patient_name?: string;
  age?: number | string;
  gender?: string;
  occupation?: string;
  chief_complaint?: string;
  hopi?: string;
  medical_history?: string;
  habit_history?: {
    type?: string;
    duration_years?: number;
    frequency?: string;
    quantity?: string;
    current_status?: string;
  };
  additional_clinical_details?: string;
}

interface QuestionMetadata {
  q_number?: number;
  ground_truth?: string;
  key_concepts?: string[];
  osce_domain?: string;
}

interface AssessmentRow {
  id: string;
  title: string | null;
  lesson_id: string | null;
  assessment_type: string | null;
  metadata: Record<string, unknown> | null;
}

interface QuestionRow {
  id: string;
  assessment_id: string;
  question_text: string;
  question_type: string | null;
  metadata: QuestionMetadata | null;
}

interface LessonRow {
  id: string;
  case_scenario: PatientScenario | null;
}

export interface ClinicalReasoningCoachInput {
  /** profiles.id of the learner (auth.users.id). */
  learnerId: string;
  /** pde_assessments.id — the clinical_case assessment. */
  assessmentId: string;
  /** pde_assessment_questions.id — the question being answered. */
  questionId: string;
  /** Free-text student answer. */
  answer: string;
}

export interface ClinicalReasoningCoachResult {
  /** Socratic feedback text from the AI. */
  feedback: string;
  /** Resolved provider used for the call. */
  provider: string;
  /** Resolved model id used for the call. */
  model: string;
  /** End-to-end latency in ms. */
  latencyMs: number;
  /** Estimated INR cost (null if pricing missing). */
  costInr: number | null;
  /** Total prior attempts (submissions) for this (learner, assessment). */
  priorAttempts: number;
  /** Cap pulled from policy. */
  capPerCase: number;
  /** The exact prompt sent to the model — captured for the AIU (Accountable
   *  AI Use) evidence trail. SERVER-SIDE ONLY: the interpolated template
   *  embeds ground_truth (the answer key), so the coach route MUST strip
   *  this before responding to the learner. */
  promptSent: string;
}

const POLICY_DEFAULT_PROVIDER = 'google';
const POLICY_DEFAULT_MODEL = 'gemini-2.5-pro';
const POLICY_DEFAULT_MAX_SENTENCES = 4;
const POLICY_DEFAULT_CAP = 5;
const POLICY_DEFAULT_TEMPLATE = `You are an AI clinical reasoning tutor for dental undergraduate students learning Oral Medicine through Case-Based Learning, grounded in Harvard Case-Based Collaborative Learning (CBCL) pedagogy.

CASE CONTEXT:
{case_context}

CURRENT QUESTION (Q{q_number}):
{question}

GROUND TRUTH (DO NOT REVEAL DIRECTLY):
{ground_truth}

KEY CONCEPTS:
{key_concepts}

STUDENT ANSWER:
{student_answer}

RULES:
- NEVER state the correct answer directly.
- If the student got it right with sound reasoning: affirm what was correct, ask one Socratic follow-up that deepens understanding.
- If partially right: identify the strong part, ask a question that surfaces the gap.
- If wrong: do not say "wrong". Ask a question that surfaces the contradiction in their reasoning, hinting toward an observation they may have missed.
- Tone: warm, encouraging, like a senior resident teaching a junior. Never lecture.
- Length: max {max_sentences} sentences.

RESPOND with your Socratic feedback now.`;

const FEATURE_KEY = 'pde.clinical_reasoning.coach';

// ---------------------------------------------------------------------------
// Policy reader — wraps fn_get_policy_clinical_reasoning RPC.
// The RPC concatenates 'clinical_reasoning.' to the key, so we pass the
// suffix only (e.g. 'ai.model', not 'clinical_reasoning.ai.model').
// Verified live 2026-05-23 against prod kvizhngldtiuufknvehv.
// ---------------------------------------------------------------------------

async function readPolicy<T>(
  supabase: ReturnType<typeof createServiceRoleClient>,
  keySuffix: string,
  fallback: T,
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    'fn_get_policy_clinical_reasoning',
    { p_key: keySuffix },
  );
  if (error || data === null || data === undefined) {
    return fallback;
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Public entry point — generate Socratic feedback for one student answer.
// ---------------------------------------------------------------------------

/**
 * Is the ₹0 max-pde lane active for this PDE job type? True only when the job
 * type is registered AND enabled — the Director's cutover flip. Fail-safe: any
 * read error returns false, so the direct provider path runs. Cheap single-row
 * read; the coach is not a high-frequency endpoint.
 */
async function pdeMaxLaneActive(
  supabase: ReturnType<typeof createServiceRoleClient>,
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

export async function generateClinicalReasoningFeedback(
  input: ClinicalReasoningCoachInput,
): Promise<ClinicalReasoningCoachResult> {
  const start = Date.now();
  validateInput(input);

  const supabase = createServiceRoleClient();

  // ---- Load assessment + question + lesson (parallel, single-row each) ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [assessmentRes, questionRes] = await Promise.all([
    sb
      .from('pde_assessments')
      .select('id, title, lesson_id, assessment_type, metadata')
      .eq('id', input.assessmentId)
      .maybeSingle(),
    sb
      .from('pde_assessment_questions')
      .select('id, assessment_id, question_text, question_type, metadata')
      .eq('id', input.questionId)
      .maybeSingle(),
  ]);

  if (assessmentRes.error || !assessmentRes.data) {
    throw new FeedbackError({
      code: 'NOT_FOUND',
      message: 'Clinical case not found',
    });
  }
  const assessment = assessmentRes.data as AssessmentRow;

  if (assessment.assessment_type !== 'clinical_case') {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'Assessment is not a clinical_case',
    });
  }

  if (questionRes.error || !questionRes.data) {
    throw new FeedbackError({
      code: 'NOT_FOUND',
      message: 'Question not found',
    });
  }
  const question = questionRes.data as QuestionRow;
  if (question.assessment_id !== assessment.id) {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'Question does not belong to this case',
    });
  }

  // ---- Load patient scenario from vac_lessons.case_scenario ----
  let scenario: PatientScenario | null = null;
  if (assessment.lesson_id) {
    const lessonRes = await sb
      .from('vac_lessons')
      .select('id, case_scenario')
      .eq('id', assessment.lesson_id)
      .maybeSingle();
    if (lessonRes.data) {
      scenario = (lessonRes.data as LessonRow).case_scenario ?? null;
    }
  }

  // ---- Read all 5 policies in parallel ----
  const [provider, modelId, maxSentences, promptTemplate, capPerCase] =
    await Promise.all([
      readPolicy<string>(supabase, 'ai.provider', POLICY_DEFAULT_PROVIDER),
      readPolicy<string>(supabase, 'ai.model', POLICY_DEFAULT_MODEL),
      readPolicy<number>(
        supabase,
        'ai.max_response_sentences',
        POLICY_DEFAULT_MAX_SENTENCES,
      ),
      readPolicy<string>(
        supabase,
        'ai.system_prompt_template',
        POLICY_DEFAULT_TEMPLATE,
      ),
      readPolicy<number>(
        supabase,
        'lifetime_attempts_per_case',
        POLICY_DEFAULT_CAP,
      ),
    ]);

  // ---- Enforce lifetime attempt cap (5 by default) ----
  // pde_submissions has no `status` column — count all submission rows for
  // this (learner_id, assessment_id). Faculty cap-reset (Agent D) deletes
  // or archives rows; until then, every row counts toward the cap.
  const { count: priorAttempts, error: countError } = await sb
    .from('pde_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('learner_id', input.learnerId)
    .eq('assessment_id', input.assessmentId);

  if (countError) {
    throw new FeedbackError({
      code: 'INTERNAL',
      message: `Failed to count prior attempts: ${countError.message}`,
      cause: countError,
    });
  }
  const attempts = priorAttempts ?? 0;
  if (attempts >= capPerCase) {
    throw new FeedbackError({
      code: 'CAP_REACHED',
      message: `Lifetime attempt cap (${capPerCase}) reached for this case. Ask faculty to grant additional attempts.`,
    });
  }

  // ---- Build the system prompt ----
  const systemPrompt = interpolatePrompt(promptTemplate, {
    case_context: buildCaseContext(scenario),
    q_number: question.metadata?.q_number ?? 1,
    question: question.question_text,
    ground_truth: question.metadata?.ground_truth ?? '(not specified)',
    key_concepts: (question.metadata?.key_concepts ?? []).join(', '),
    student_answer: input.answer,
    max_sentences: maxSentences,
  });

  // ---- Dispatch: ₹0 Max lane when active, else direct provider (dark) ----
  // At cutover the pde.clinical_reasoning.coach job type is enabled and a
  // max-pde box runner is live: the Socratic feedback is generated by the Claude
  // Max seat (₹0, logged by the runner). While dark (job type disabled) the
  // existing direct provider path runs unchanged. No paid fallback on the Max
  // path — a miss surfaces a retryable error (Director: "ask before paid").
  const useMaxLane = await pdeMaxLaneActive(supabase, 'pde.clinical_reasoning.coach');

  // The policy template already interpolates the answer under its own
  // "LEARNER ANSWER:" heading, so unconditionally appending it again sent the
  // answer TWICE in one prompt — visible in the live queued payload, once
  // under the heading and again under a trailing "Student answer:".
  //
  // But it cannot simply be dropped. The direct-provider path does not rely
  // on the template alone: it passes `userPrompt: input.answer` separately
  // (see dispatchSocratic below), which every provider sends as its own user
  // turn. The Max lane has a SINGLE `prompt` field and no message structure,
  // so that append was its only unconditional guarantee that the model ever
  // sees the answer.
  //
  // `clinical_reasoning.ai.system_prompt_template` is a DB-editable policy.
  // Drop `{student_answer}` from it — a one-character mistake while editing —
  // and an unconditional removal would make the coach silently give feedback
  // on an empty answer, with nothing failing loudly.
  //
  // So: append only when the rendered prompt does not already contain the
  // answer. No duplicate in the normal case; the guarantee survives a
  // mis-edited template.
  //
  // Hoisted out of the Max branch (AIU): this same composition is what the
  // AIU evidence trail records as promptSent on BOTH paths — for the direct
  // path it folds the separate user turn back into one faithful text.
  const promptSent = systemPrompt.includes(input.answer)
    ? systemPrompt
    : `${systemPrompt}\n\nLearner answer:\n\n${input.answer}`;

  let feedback = '';
  let usedProvider = provider;
  let usedModel = modelId;
  let costInr: number | null = null;

  if (useMaxLane) {
    const enq = await enqueueJobsLane(supabase, {
      jobType: 'pde.clinical_reasoning.coach',
      prompt: promptSent,
      context: {
        learner_id: input.learnerId,
        assessment_id: input.assessmentId,
        question_id: input.questionId,
      },
      // Unique per request (no dedupe collisions) so we always get a job id to
      // poll; `start` is this request's timestamp.
      dedupeKey: `pde-coach:${input.learnerId}:${input.assessmentId}:${input.questionId}:${start}`,
    });
    if (!enq.ok) {
      const reason = (enq as { reason?: string }).reason ?? 'error';
      throw new FeedbackError({
        code: 'AI_FAILURE',
        message: `The coach could not be reached (${reason}). Please try again.`,
        retryable: true,
      });
    }
    // strictNullChecks is off in this project — read jobId via a cast rather
    // than relying on discriminated-union narrowing.
    const jobId = (enq as { jobId?: string }).jobId;
    if (!jobId) {
      throw new FeedbackError({
        code: 'AI_FAILURE',
        message: 'The coach could not be started. Please try again.',
        retryable: true,
      });
    }
    // Long-poll the drain for the result (< the route's maxDuration=300).
    const results = await awaitJobsLaneResults(supabase, [jobId], {
      deadlineMs: 270_000,
    });
    const text = results.get(jobId);
    if (!text) {
      throw new FeedbackError({
        code: 'AI_FAILURE',
        message: 'The coach did not respond in time. Please try again.',
        retryable: true,
      });
    }
    feedback = text;
    usedProvider = 'claude_code';
    usedModel = 'max-subscription';
    costInr = 0; // the box runner logs ai_model_usage on its side (₹0)
  } else {
    // ---- Direct provider dispatch (dark path — free-text, NOT JSON) ----
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let aiError: unknown = null;
    try {
      const aiResult = await dispatchSocratic({
        provider,
        modelId,
        systemPrompt,
        userPrompt: input.answer,
      });
      feedback = aiResult.text;
      inputTokens = aiResult.inputTokens;
      outputTokens = aiResult.outputTokens;
    } catch (err) {
      aiError = err;
    }

    const modelRef = getModel(provider, modelId);
    costInr = estimateChatCostInr(
      modelRef?.inputPer1KTokensInr,
      modelRef?.outputPer1KTokensInr,
      inputTokens,
      outputTokens,
    );

    // ---- Cost tracking — write ai_model_usage row regardless of success ----
    await logAiModelUsage(supabase, {
      provider,
      modelId,
      inputTokens,
      outputTokens,
      costInr,
      durationMs: Date.now() - start,
      success: aiError === null,
      errorMessage:
        aiError === null
          ? null
          : aiError instanceof Error
            ? aiError.message
            : String(aiError),
    });

    if (aiError !== null) {
      throw new FeedbackError({
        code: 'AI_FAILURE',
        message:
          aiError instanceof Error
            ? aiError.message
            : 'AI provider returned an error',
        retryable: true,
        cause: aiError,
      });
    }
  }

  return {
    feedback,
    provider: usedProvider,
    model: usedModel,
    latencyMs: Date.now() - start,
    costInr,
    priorAttempts: attempts,
    capPerCase,
    promptSent,
  };
}

// ---------------------------------------------------------------------------
// AI dispatcher — Socratic free-text (NOT JSON like sentiment).
//
// The existing analyzeStructured() in ai-clients/sentiment.ts forces a JSON
// response. The Socratic prompt expects free text. Reusing the same wire
// patterns (OpenAI chat completions / Google generateContent) but without
// the response_format=json constraint, so we get plain text feedback back.
// ---------------------------------------------------------------------------

interface SocraticDispatchArgs {
  provider: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
}

interface SocraticDispatchResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function dispatchSocratic(
  args: SocraticDispatchArgs,
): Promise<SocraticDispatchResult> {
  if (args.provider === 'google') {
    return dispatchSocraticGoogle(args);
  }
  if (args.provider === 'openai') {
    return dispatchSocraticOpenAI(args);
  }
  if (args.provider === 'anthropic') {
    return dispatchSocraticAnthropic(args);
  }
  throw new Error(`Unsupported AI provider for clinical reasoning: ${args.provider}`);
}

async function dispatchSocraticGoogle(
  args: SocraticDispatchArgs,
): Promise<SocraticDispatchResult> {
  const apiKey =
    process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY (or GOOGLE_GENAI_API_KEY) not configured');
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.modelId,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: args.systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: args.userPrompt }],
        },
      ],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Google API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Google returned empty content');
  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? null,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
  };
}

async function dispatchSocraticOpenAI(
  args: SocraticDispatchArgs,
): Promise<SocraticDispatchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.modelId,
      temperature: 0.4,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty content');
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
  };
}

async function dispatchSocraticAnthropic(
  args: SocraticDispatchArgs,
): Promise<SocraticDispatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.modelId,
      max_tokens: 1024,
      temperature: 0.4,
      system: args.systemPrompt,
      messages: [{ role: 'user', content: args.userPrompt }],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    content?: Array<{ text?: string; type?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Anthropic returned empty content');
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cost tracking — single row per AI call into ai_model_usage.
// Verified schema 2026-05-23: feature_key, provider, model_id, input_tokens,
// output_tokens, cost_inr, duration_ms, success, error_message, invoked_at.
// ---------------------------------------------------------------------------

interface UsageLogArgs {
  provider: string;
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costInr: number | null;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
}

async function logAiModelUsage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  args: UsageLogArgs,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('ai_model_usage').insert({
    feature_key: FEATURE_KEY,
    provider: args.provider,
    model_id: args.modelId,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cost_inr: args.costInr,
    duration_ms: args.durationMs,
    success: args.success,
    error_message: args.errorMessage,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateInput(input: ClinicalReasoningCoachInput): void {
  if (!input.learnerId || !UUID_RE.test(input.learnerId)) {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'learnerId must be a UUID',
    });
  }
  if (!input.assessmentId || !UUID_RE.test(input.assessmentId)) {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'assessmentId must be a UUID',
    });
  }
  if (!input.questionId || !UUID_RE.test(input.questionId)) {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'questionId must be a UUID',
    });
  }
  if (typeof input.answer !== 'string' || input.answer.trim().length === 0) {
    throw new FeedbackError({
      code: 'INVALID_INPUT',
      message: 'Answer cannot be empty',
    });
  }
}

function buildCaseContext(scenario: PatientScenario | null): string {
  if (!scenario) return '(case scenario not available)';
  const habit = scenario.habit_history ?? {};
  const lines: string[] = [];
  lines.push(
    `Patient: ${scenario.patient_name ?? 'Unknown'}, ${
      scenario.age ?? '?'
    }y, ${scenario.gender ?? '?'}${
      scenario.occupation ? `, ${scenario.occupation}` : ''
    }`,
  );
  if (scenario.chief_complaint)
    lines.push(`Chief complaint: ${scenario.chief_complaint}`);
  if (scenario.hopi) lines.push(`History: ${scenario.hopi}`);
  if (scenario.medical_history)
    lines.push(`Medical history: ${scenario.medical_history}`);
  if (habit.type) {
    lines.push(
      `Habit: ${habit.type}${
        habit.duration_years ? ` for ${habit.duration_years} years` : ''
      }${habit.frequency ? ` (${habit.frequency}, ${habit.quantity ?? ''})` : ''} — currently ${habit.current_status ?? 'unknown'}`,
    );
  }
  if (scenario.additional_clinical_details)
    lines.push(`Additional details: ${scenario.additional_clinical_details}`);
  return lines.join('\n');
}

function interpolatePrompt(
  template: string,
  vars: Record<string, string | number>,
): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(val));
  }
  return out;
}

// Re-export the imported symbol so callers can route through one module.
export { FeedbackError } from '@/lib/services/pde-coach-errors';
