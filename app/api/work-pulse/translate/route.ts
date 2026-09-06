export const dynamic = 'force-dynamic';
// Long-poll the ai_jobs Max lane (the generic seat/Windows drain claims ~every
// minute). Kept at 300 so the poll window below can finish before a hard-kill.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE CONVERSION (2026-07-13): work_pulse.translate is the first real
// staff feature moved onto the #1998 generic AI-jobs registry. Instead of
// calling anthropic.messages.create directly, this route enqueues an
// `work_pulse.translate` job (fn_ai_enqueue) whose prompt_template + tool_set
// live in ai_job_types (seeded by 20260713000300_seed_staff_ai_job_types.sql),
// then long-polls fn_ai_job_status for the drain's result — mirroring the
// proven consumer app/api/ai-query/route.ts. The Tamil short-circuit and the
// optional DB persist are preserved. The seat drain runs on the Claude Max
// subscription (₹0 API); usage recording happens on the runner side.
// ─────────────────────────────────────────────────────────────────────────────

// Tamil Unicode range
const TAMIL_REGEX = /[\u0B80-\u0BFF]/;

/** Detect if text contains Tamil characters (>30% threshold) */
function isTamilText(text: string): boolean {
  if (!text) return false;
  const tamilChars = text.split('').filter((c) => TAMIL_REGEX.test(c)).length;
  return tamilChars / text.length > 0.3;
}

// Poll cadence — mirrors app/api/ai-query/route.ts (the proven ai_jobs consumer).
const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // give up if never claimed (drain offline)
const TOTAL_DEADLINE_MS = 285_000; // kept < maxDuration (300s) so we respond first

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Read the translation out of the drain's result jsonb. The generic runner
 *  returns { answer } (same contract ai-query reads); we also tolerate a few
 *  plausible shapes so a completed result never falls silently to null. */
function extractTranslation(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'english', 'text', 'result']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

/** Tamil→English translation via the ai_jobs Max lane (work_pulse.translate) */
export async function POST(request: NextRequest) {
  await connection();

  // Auth: any authenticated user (session client — fn_ai_enqueue is auth.uid()-gated).
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { text, pulse_entry_id, field } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    // Non-Tamil short-circuit — unchanged (no AI call needed).
    if (!isTamilText(text)) {
      return NextResponse.json({
        translated: false,
        reason: 'Text does not appear to be Tamil',
        original: text,
      });
    }

    // Enqueue on the registry Max lane. fn_ai_enqueue resolves the job spec
    // (prompt_template + tool_set) from ai_job_types and gates on allow_rule;
    // the generic seat/Windows drain executes it at ₹0 API cost.
    const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: 'work_pulse.translate',
      p_payload: { text },
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      // Seed not applied / feature disabled → treat as "unavailable, try later".
      if (errText === 'unknown or disabled job_type') {
        return NextResponse.json(
          { error: 'Translation is not available right now. Please try again later.' },
          { status: 503 }
        );
      }
      if (errText === 'too many in-flight jobs of this type') {
        return NextResponse.json(
          { error: 'A translation is already in progress. Please wait for it to finish.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'Could not start translation. Please try again.' },
        { status: 500 }
      );
    }

    const jobId = enq.job_id;
    const startedAt = Date.now();
    let translation: string | null = null;
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        translation = extractTranslation((st as { result?: unknown }).result);
        break;
      }
      if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
        break;
      }
      // Never claimed within the unclaimed window → the drain is offline.
      if (st.status === 'pending' && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    if (translation === null) {
      return NextResponse.json(
        { error: 'Translation did not finish in time. Please try again.' },
        { status: 503 }
      );
    }

    // Optional persist of the English translation onto the pulse entry — kept
    // from the original route (on-done path). Service-role write, allowlisted
    // target column only.
    if (pulse_entry_id && field) {
      const validFields = ['talent_waste_description_en', 'repetition_description_en'];
      if (validFields.includes(field)) {
        const admin = createServiceRoleClient();
        await admin
          .from('wp_pulse_entries')
          .update({ [field]: translation })
          .eq('id', pulse_entry_id);
      }
    }

    return NextResponse.json({
      translated: true,
      original: text,
      english: translation,
    });
  } catch (error) {
    console.error('[work-pulse/translate]', error);
    return NextResponse.json(
      { error: 'Translation failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}
