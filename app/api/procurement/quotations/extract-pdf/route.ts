import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireStaff } from '@/lib/utils/parent-admin-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
// Enqueue only — the model call happens on the ₹0 Max lane, not in this
// function. Nothing here waits on Claude, so the old 60s budget is unnecessary.
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const BUCKET = 'procurement-quotation-pdfs';
const JOB_TYPE = 'procurement.quotation_extract';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shown whenever the Max lane cannot take the job. Mirrors the wording this
 *  route already used when extraction failed, so there is nothing new to learn:
 *  the quotation is still completable by hand. */
const MANUAL_FALLBACK =
  'AI reading is unavailable right now — please enter the prices manually.';

export type ExtractItem = { id: string; item_name: string };

/**
 * POST /api/procurement/quotations/extract-pdf  (multipart/form-data)
 * Fields: file (PDF), items (JSON array of { id, item_name }), rfq_id
 *
 * Parks the vendor PDF in a private bucket and ENQUEUES a ₹0 Max-lane job that
 * reads it. Returns immediately with { job_id }; the caller polls ./status and
 * the uploader is notified when the prices are ready.
 *
 * Returns { reused: true, result } when this exact file was already read for
 * this RFQ, and { unavailable: true } when the Max lane cannot take the job
 * (shipped dark, no permission, cap reached, or the runner box is offline) —
 * in which case the caller falls back to manual price entry.
 *
 * NOTE: this route no longer calls the paid Anthropic API. The PDF never
 * travels inside the job payload; only its storage path does.
 */
export async function POST(req: NextRequest) {
  const user = await requireStaff();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'PDF exceeds the 15 MB limit.' }, { status: 400 });
  if (file.type !== 'application/pdf')
    return NextResponse.json({ error: 'AI extraction supports PDF files only.' }, { status: 400 });

  const rfqId = String(form.get('rfq_id') ?? '');
  if (!UUID_RE.test(rfqId))
    return NextResponse.json({ error: 'Missing or invalid rfq_id.' }, { status: 400 });

  let items: ExtractItem[];
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]'));
    items = Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.id === 'string' && typeof i.item_name === 'string')
          .map((i) => ({ id: i.id, item_name: i.item_name }))
      : [];
  } catch {
    return NextResponse.json({ error: 'Invalid items payload.' }, { status: 400 });
  }
  if (items.length === 0)
    return NextResponse.json({ error: 'No RFQ items to match against.' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // ── Reuse an identical read ────────────────────────────────────────────────
  // Same file + same RFQ = same answer. Covers the double-click and the "two
  // people both uploaded the vendor's PDF" case. Read with the service role so
  // a colleague's earlier read is reusable, not only the caller's own.
  try {
    const admin = createServiceRoleClient();
    const { data: prior } = await admin
      .from('ai_jobs')
      .select('id, result')
      .eq('job_type', JOB_TYPE)
      .eq('status', 'done')
      .contains('payload', { sha256, rfq_id: rfqId })
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.result) {
      return NextResponse.json({ reused: true, job_id: prior.id, result: prior.result });
    }
  } catch {
    // A dedupe miss must never block a fresh read — fall through and enqueue.
  }

  const supabase = await createClient();

  // ── Park the PDF where the Max-lane runner can fetch it ────────────────────
  // The path is content-addressed (sha256), so re-uploading identical bytes is
  // a no-op rather than a conflict.
  const storagePath = `${rfqId}/${sha256}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    console.error('[procurement quotation extract-pdf] upload failed:', uploadError);
    return NextResponse.json({ error: MANUAL_FALLBACK, unavailable: true });
  }

  // ── Enqueue on the ₹0 Max lane ─────────────────────────────────────────────
  const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
    p_job_type: JOB_TYPE,
    p_payload: { storage_path: storagePath, sha256, rfq_id: rfqId, rfq_items: items },
  });

  if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
    const errText = typeof enq?.error === 'string' ? enq.error : '';
    // 'unknown or disabled job_type' = shipped dark / switched off.
    // 'daily limit reached' / 'too many in-flight jobs' = try again shortly.
    // Every one of these degrades to the same honest outcome: type the prices.
    const message =
      errText === 'daily limit reached'
        ? "You have reached today's limit for AI PDF reading — please enter the prices manually."
        : errText === 'not allowed for this job_type'
          ? 'You do not have permission to use AI PDF reading.'
          : MANUAL_FALLBACK;
    if (enqError) console.error('[procurement quotation extract-pdf] enqueue failed:', enqError);
    return NextResponse.json({ error: message, unavailable: true });
  }

  return NextResponse.json({ job_id: enq.job_id });
}
