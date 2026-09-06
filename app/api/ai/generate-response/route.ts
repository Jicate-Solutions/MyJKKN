export const dynamic = 'force-dynamic';
// Long-poll the ai_jobs Max lane (the generic seat/Windows drain claims ~every
// minute). Kept at 300 so the poll window below can finish before a hard-kill.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIResponseService } from '@/lib/services/admission/ai-response-service';
import type {
  CommunicationChannel,
  ResponseIntent,
  LeadContext,
} from '@/lib/services/admission/ai-response-service';

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY CONVERSION (2026-07-13): admission.ai_response reply-draft generation
// moved off the direct Anthropic call onto the #1998 generic AI-jobs registry.
// Instead of AIResponseService.generateResponse() calling anthropic.messages
// .create, this route assembles the SAME lead context the service always built
// (AIResponseService.buildResponsePayload → the 11 placeholder variables the
// seeded `admission.ai_response` prompt_template expects) and enqueues it via
// fn_ai_enqueue, then long-polls fn_ai_job_status for the drain's result —
// mirroring the proven app/api/work-pulse/translate/route.ts + ai-query consumer.
// The prompt_template + tool_set live in ai_job_types (seeded by
// 20260713000300_seed_staff_ai_job_types.sql); we send ONLY the payload vars.
// The Max seat drain runs on the Claude Max subscription (₹0 API).
//
// DRAFTS ONLY, NEVER SENDS: this route returns suggested reply text; nothing is
// dispatched to any lead. Sending stays a separate, explicit counselor action.
// ─────────────────────────────────────────────────────────────────────────────

const JOB_TYPE = 'admission.ai_response';

// Poll cadence — mirrors the translate route / ai-query consumer.
const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // give up if never claimed (drain offline)
// Kept < maxDuration (300s) so we respond before a hard-kill. If the job is
// still pending at this point we hand the caller the job_id so the page can
// resume it (the "while you were away" inbox fallback — result persists in
// ai_jobs, keyed to this user, and fn_ai_job_status re-reads it on GET).
const POST_POLL_DEADLINE_MS = 170_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pull the model's answer text out of the drain's result jsonb. The generic
 *  runner returns { answer } (same contract ai-query reads); tolerate a few
 *  plausible shapes so a completed result never falls silently to null. The
 *  admission prompt asks for a JSON object with a `suggestions` array — if the
 *  drain already handed back a parsed object with that array, surface it too. */
function extractAnswerText(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    // Already-structured result (drain parsed the JSON): re-stringify so the
    // service's tolerant parser handles it uniformly.
    if (Array.isArray(o.suggestions)) return JSON.stringify(o);
    for (const key of ['answer', 'text', 'result', 'content']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

/** Map a fn_ai_enqueue error string to an HTTP response the page understands. */
function enqueueErrorResponse(errText: string): NextResponse {
  if (errText === 'unknown or disabled job_type') {
    return NextResponse.json(
      { message: 'AI reply drafts are not available right now. Please try again later.' },
      { status: 503 }
    );
  }
  if (errText === 'too many in-flight jobs of this type') {
    return NextResponse.json(
      { message: 'A reply draft is already generating. Please wait for it to finish.' },
      { status: 429 }
    );
  }
  if (errText === 'not allowed for this job_type') {
    return NextResponse.json(
      { message: 'You do not have access to AI reply drafts.' },
      { status: 403 }
    );
  }
  if (errText === 'UNAUTHORIZED') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { message: 'Could not start the reply draft. Please try again.' },
    { status: 500 }
  );
}

/**
 * GET
 *  - No params → service availability probe (the component gates its UI on this).
 *    The Max lane needs no local API key, so it is available whenever the job
 *    type is enabled; we report available and let enqueue surface a disabled seed.
 *  - ?job_id=<uuid> → resume/poll a previously-slow job (the inbox fallback the
 *    page uses after it stored a pending job_id). Returns the parsed drafts once
 *    the drain finishes.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ status: 'unavailable', message: 'Unauthorized' }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get('job_id');
  const channelParam = (request.nextUrl.searchParams.get('channel') || 'whatsapp') as CommunicationChannel;

  if (!jobId) {
    return NextResponse.json({
      status: 'available',
      message: 'AI reply drafts run on the Max subscription lane.',
    });
  }

  const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
    p_job_id: jobId,
  });
  if (stError || !st || typeof (st as { status?: unknown }).status !== 'string') {
    return NextResponse.json({ status: 'pending', jobId });
  }
  const status = (st as { status: string }).status;
  if (status === 'done') {
    const answer = extractAnswerText((st as { result?: unknown }).result);
    if (answer === null) {
      return NextResponse.json(
        { status: 'error', message: 'The reply draft came back empty. Please regenerate.' },
        { status: 502 }
      );
    }
    const suggestions = AIResponseService.parseSuggestions(answer, channelParam);
    return NextResponse.json({
      status: 'done',
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  }
  if (status === 'error' || status === 'canceled' || status === 'not_found') {
    return NextResponse.json(
      { status, message: 'The reply draft did not complete. Please regenerate.' },
      { status: status === 'not_found' ? 404 : 502 }
    );
  }
  // pending / claimed / running
  return NextResponse.json({ status: 'pending', jobId });
}

/**
 * POST — generate reply-draft suggestions via the Max lane.
 * Request body (unchanged contract the page/hook already sends):
 *   { leadContext: LeadContext, channel, intent, customPrompt }
 * Success (200): { suggestions, generatedAt }  ← same shape the page consumes.
 * Slow (202):    { pending: true, jobId, generatedAt }  ← page resumes via GET.
 */
export async function POST(request: NextRequest) {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadContext = body?.leadContext as LeadContext | undefined;
    const channel = (body?.channel ?? 'whatsapp') as CommunicationChannel;
    const intent = (body?.intent ?? 'general') as ResponseIntent;
    const customPrompt =
      typeof body?.customPrompt === 'string' ? body.customPrompt : undefined;

    if (!leadContext?.lead?.id) {
      return NextResponse.json({ message: 'Missing lead context' }, { status: 400 });
    }

    // Assemble the 11 placeholder variables the seeded prompt expects — reusing
    // the service's own assembly verbatim so drafts match the direct-call path.
    const payload = AIResponseService.buildResponsePayload({
      leadContext,
      channel,
      intent,
      customPrompt,
    });

    // Enqueue on the registry Max lane. fn_ai_enqueue resolves the job spec
    // (prompt_template + tool_set) from ai_job_types and gates on allow_rule.
    const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: JOB_TYPE,
      p_payload: payload,
    });
    if (
      enqError ||
      !(enq as { ok?: boolean })?.ok ||
      typeof (enq as { job_id?: unknown })?.job_id !== 'string'
    ) {
      const errText =
        typeof (enq as { error?: unknown })?.error === 'string'
          ? (enq as { error: string }).error
          : '';
      return enqueueErrorResponse(errText);
    }

    const jobId = (enq as { job_id: string }).job_id;
    const startedAt = Date.now();
    let answer: string | null = null;

    while (Date.now() - startedAt < POST_POLL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof (st as { status?: unknown }).status !== 'string') continue;
      const status = (st as { status: string }).status;
      if (status === 'done') {
        answer = extractAnswerText((st as { result?: unknown }).result);
        break;
      }
      if (status === 'error' || status === 'canceled' || status === 'not_found') {
        return NextResponse.json(
          { message: 'The reply draft did not complete. Please regenerate.' },
          { status: 502 }
        );
      }
      // Never claimed within the unclaimed window → the drain is offline. Hand
      // back the job_id so the page can keep resuming it via GET.
      if (status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        return NextResponse.json(
          { pending: true, jobId, generatedAt: new Date().toISOString() },
          { status: 202 }
        );
      }
    }

    if (answer === null) {
      // Still working at the deadline (or empty result) → let the page resume.
      return NextResponse.json(
        { pending: true, jobId, generatedAt: new Date().toISOString() },
        { status: 202 }
      );
    }

    const suggestions = AIResponseService.parseSuggestions(answer, channel);
    return NextResponse.json({
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[admission/ai-response] generate-response failed:', error);
    return NextResponse.json(
      { message: 'Failed to generate reply drafts', details: (error as Error).message },
      { status: 500 }
    );
  }
}
