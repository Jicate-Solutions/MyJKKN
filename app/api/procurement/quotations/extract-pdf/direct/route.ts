import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireProcurement, PROC_QUOTATION_MANAGE } from '@/lib/utils/procurement-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  directExtractApiKey,
  extractQuotationDirect,
  type DirectExtractItem,
} from '@/lib/procurement/quotation-pdf-direct';

export const runtime = 'nodejs';
// A Haiku read of a quotation PDF normally finishes in 10-30s.
export const maxDuration = 60;

const JOB_TYPE = 'procurement.quotation_extract';
const BUCKET = 'procurement-quotation-pdfs';
const RUNNER = 'api-direct';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/procurement/quotations/extract-pdf/direct   { job_id }
 *
 * The page calls this when its ₹0 Max-lane job has sat unclaimed for a few
 * seconds (no office AI runner is serving the lane). It takes the job over and
 * reads the PDF with the paid Claude API instead.
 *
 * Exactly-once: the job moves pending -> running with a conditional update, so
 * a runner that wakes up in the same instant either wins the row (we step back
 * and the page keeps polling) or finds it already taken. Nobody pays twice.
 *
 * Returns { status: 'done', result } | { status: 'claimed'|'running' } (a runner
 * has it — keep polling) | { error }.
 */
export async function POST(req: NextRequest) {
  const user = await requireProcurement(PROC_QUOTATION_MANAGE);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: 'Missing or invalid job_id.' }, { status: 400 });

  if (!directExtractApiKey()) {
    return NextResponse.json({
      error: 'AI PDF reading is not available right now — please enter the prices manually.',
    });
  }

  const admin = createServiceRoleClient();

  // Own jobs only — the same rule fn_ai_job_status applies.
  const { data: job, error: jobError } = await admin
    .from('ai_jobs')
    .select('id, status, result, payload, requested_by, job_type')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) {
    console.error('[procurement extract-pdf direct] job read failed:', jobError);
    return NextResponse.json({ error: 'Could not start the AI reading.' });
  }
  if (!job || job.requested_by !== user.id || job.job_type !== JOB_TYPE) {
    return NextResponse.json({ error: 'Reading not found.' }, { status: 404 });
  }
  if (job.status === 'done') return NextResponse.json({ status: 'done', result: job.result });
  if (job.status !== 'pending') return NextResponse.json({ status: job.status });

  // Take the job over. Zero rows back = a runner claimed it first.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from('ai_jobs')
    .update({ status: 'running', claimed_by: RUNNER, claimed_at: now, started_at: now })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError) {
    console.error('[procurement extract-pdf direct] claim failed:', claimError);
    return NextResponse.json({ error: 'Could not start the AI reading.' });
  }
  if (!claimed) return NextResponse.json({ status: 'claimed' });

  const fail = async (message: string, detail: unknown) => {
    console.error('[procurement extract-pdf direct] read failed:', detail);
    await admin
      .from('ai_jobs')
      .update({
        status: 'error',
        error: String(detail instanceof Error ? detail.message : detail).slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return NextResponse.json({ error: message });
  };

  const payload = (job.payload ?? {}) as { storage_path?: string; rfq_items?: DirectExtractItem[] };
  const items = Array.isArray(payload.rfq_items) ? payload.rfq_items : [];
  if (!payload.storage_path || items.length === 0) {
    return fail('Could not read the PDF — please enter the prices manually.', 'job payload incomplete');
  }

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(payload.storage_path);
  if (downloadError || !blob) {
    return fail('Could not read the PDF — please enter the prices manually.', downloadError ?? 'empty download');
  }

  try {
    const pdfBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const result = await extractQuotationDirect(pdfBase64, items);

    await admin
      .from('ai_jobs')
      .update({ status: 'done', result, completed_at: new Date().toISOString() })
      .eq('id', jobId);

    return NextResponse.json({ status: 'done', result });
  } catch (err) {
    // Say which kind of failure it was: waiting helps for a rate limit, not for a
    // bad key or an unreadable file.
    const message =
      err instanceof Anthropic.RateLimitError
        ? 'The AI reader is busy — please try again in a minute, or enter the prices manually.'
        : err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
          ? 'AI PDF reading is not available right now — please enter the prices manually.'
          : err instanceof Anthropic.BadRequestError
            ? 'The AI could not open this PDF — please enter the prices manually.'
            : err instanceof Error && !(err instanceof Anthropic.APIError)
              ? err.message
              : 'AI could not read the PDF — please enter the prices manually.';
    return fail(message, err);
  }
}
