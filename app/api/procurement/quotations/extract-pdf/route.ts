import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireProcurement, PROC_QUOTATION_MANAGE } from '@/lib/utils/procurement-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
// Enqueue only — the model call happens on the ₹0 Max lane, not in this
// function. Nothing here waits on Claude, so the old 60s budget is unnecessary.
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const BUCKET = 'procurement-quotation-pdfs';
const JOB_TYPE = 'procurement.quotation_extract';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every failure here ends the same way for the user — type the prices — but they
 * do NOT mean the same thing, and one shared string made the button unreadable:
 * "unavailable right now" reads as a passing glitch, so people retried a feature
 * that was never going to answer. Each cause now says which state it is in, so
 * the difference between "wait and retry", "ask an admin" and "this isn't built
 * here" is visible from the toast alone.
 */

/** The document store this route uploads to is absent — the feature's migration
 *  has not been applied on this environment. Retrying will never help. */
const NOT_SET_UP =
  'AI PDF reading is not set up on this environment — please enter the prices manually.';

/** fn_ai_enqueue reports the job type is unknown or disabled: shipped dark. */
const SWITCHED_OFF =
  'AI PDF reading is switched off — please enter the prices manually.';

/** The queue refused the job for some other reason; retrying may work. */
const COULD_NOT_START =
  'AI PDF reading could not be started just now — please enter the prices manually.';

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
  const user = await requireProcurement(PROC_QUOTATION_MANAGE);
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
    // Almost always "Bucket not found": 20260805090000_procurement_pdf_max_lane.sql
    // creates procurement-quotation-pdfs and has not been applied here. The user
    // is told it is not set up rather than that something went briefly wrong.
    console.error('[procurement quotation extract-pdf] upload failed:', uploadError);
    return NextResponse.json({ error: NOT_SET_UP, unavailable: true });
  }

  // ── Enqueue on the ₹0 Max lane ─────────────────────────────────────────────
  const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
    p_job_type: JOB_TYPE,
    p_payload: { storage_path: storagePath, sha256, rfq_id: rfqId, rfq_items: items },
  });

  if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
    const errText = typeof enq?.error === 'string' ? enq.error : '';
    // Each of these degrades to "type the prices", but they are different states
    // and the toast now names the one the user is actually in.
    const message =
      errText === 'daily limit reached'
        ? "You have reached today's limit for AI PDF reading — please enter the prices manually."
        : errText === 'not allowed for this job_type'
          ? 'You do not have permission to use AI PDF reading.'
          : errText === 'unknown or disabled job_type'
            ? SWITCHED_OFF
            : COULD_NOT_START;
    if (enqError) console.error('[procurement quotation extract-pdf] enqueue failed:', enqError);
    return NextResponse.json({ error: message, unavailable: true });
  }

  return NextResponse.json({ job_id: enq.job_id });
}
