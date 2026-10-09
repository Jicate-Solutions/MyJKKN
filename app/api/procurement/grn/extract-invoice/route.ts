import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireProcurement, PROC_GRN_CREATE } from '@/lib/utils/procurement-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const JOB_TYPE = 'procurement.invoice_extract';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the PDF is parked for the Windows runner. The only procurement PDF bucket is the
 * quotation one; invoices live under their own `invoices/` prefix in it. Uploaded with
 * the service role because the bucket's INSERT policy is keyed on quotation_manage,
 * which a receiver (grn_create) does not hold — this route does the authorisation
 * itself (grn_create + the caller can see the order). The bucket name rides in the
 * payload so the runner never has to guess it.
 */
const BUCKET = 'procurement-quotation-pdfs';

/** fn_ai_enqueue reports the job type is unknown or disabled: shipped dark. */
const SWITCHED_OFF =
  'AI invoice reading is switched off for now — please type the invoice details in.';
/** The bucket is absent on this environment. Retrying will never help. */
const NOT_SET_UP =
  'AI invoice reading is not set up on this environment — please type the invoice details in.';
/** The queue refused the job for some other reason; retrying may work. */
const COULD_NOT_START =
  'AI invoice reading could not be started just now — please type the invoice details in.';

/**
 * Every "can't read it" outcome answers 200 with { unavailable: true, error }. It is not
 * a failure of the form: the person types the invoice in, and the form shows it as a
 * plain notice, never as an error toast.
 */
const manual = (message: string) => NextResponse.json({ unavailable: true, error: message });

export type InvoiceExtractItem = {
  id: string;
  item_name: string;
  item_spec: string | null;
  ordered_quantity: number | null;
  unit_label: string | null;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

/**
 * POST /api/procurement/grn/extract-invoice  (multipart/form-data)
 *
 * Parks the supplier invoice PDF in private storage and ENQUEUES a ₹0 Max-lane job
 * (procurement.invoice_extract, lane max-pdf) that the Windows runner reads. Returns at
 * once with { job_id }; the form polls ./status, and the uploader is notified by the
 * runner when the read finishes. There is NO paid route for invoices (spec decision 4).
 *
 * Other answers:
 *   { reused: true, job_id, result }  this exact PDF was already read for this order (decision 8)
 *   { unavailable: true, error }      the lane cannot take it (switched off, not set up,
 *                                     no permission, too many in flight) — type it in (decision 2)
 *
 * REQUEST (multipart):
 *   file          File    the invoice PDF, ≤ 15 MB
 *   po_id         uuid    the purchase order being received
 *   grn_id        uuid?   the receipt, when one already exists (the form has none yet)
 *   items         JSON    Array<{ id, item_name, item_spec?, ordered_quantity?, unit_label? }> — the PO lines
 *   expectations  JSON    { tolerance_pct, require_batch_expiry, max_invoice_age_days, watch_for }
 *
 * JOB PAYLOAD (what the runner receives):
 *   { storage_bucket, storage_path, sha256, po_id, grn_id, po_items,
 *     expectations: { watch_for, require_batch_expiry } }
 * tolerance_pct / max_invoice_age_days are deliberately NOT sent: the app enforces them
 * (three-way-match.ts, invoice-checks.ts). The model only reads; it never decides.
 */

const MAX_WATCH_FOR = 1000;

interface Expectations {
  tolerance_pct: number | null;
  require_batch_expiry: boolean;
  max_invoice_age_days: number | null;
  watch_for: string | null;
}

/** Clamp whatever the client sent into the documented shape. Never throws. */
function parseExpectations(raw: FormDataEntryValue | null): Expectations {
  const empty: Expectations = {
    tolerance_pct: null,
    require_batch_expiry: false,
    max_invoice_age_days: null,
    watch_for: null,
  };
  if (typeof raw !== 'string' || !raw.trim()) return empty;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;

  const pct = Number(parsed.tolerance_pct);
  const days = Number(parsed.max_invoice_age_days);
  return {
    tolerance_pct: Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : null,
    require_batch_expiry: parsed.require_batch_expiry === true,
    max_invoice_age_days: Number.isFinite(days) && days > 0 ? Math.floor(days) : null,
    watch_for:
      typeof parsed.watch_for === 'string' && parsed.watch_for.trim()
        ? parsed.watch_for.trim().slice(0, MAX_WATCH_FOR)
        : null,
  };
}

export async function POST(req: NextRequest) {
  const user = await requireProcurement(PROC_GRN_CREATE);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'PDF exceeds the 15 MB limit.' }, { status: 400 });
  if (file.type !== 'application/pdf')
    return NextResponse.json({ error: 'Invoice reading supports PDF files only.' }, { status: 400 });

  const poId = String(form.get('po_id') ?? '');
  if (!UUID_RE.test(poId))
    return NextResponse.json({ error: 'Missing or invalid po_id.' }, { status: 400 });
  const grnIdRaw = String(form.get('grn_id') ?? '');
  const grnId = UUID_RE.test(grnIdRaw) ? grnIdRaw : null;

  let items: InvoiceExtractItem[];
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]'));
    items = Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.id === 'string' && typeof i.item_name === 'string')
          .map((i) => ({
            id: i.id,
            item_name: i.item_name,
            item_spec: str(i.item_spec),
            ordered_quantity: Number(i.ordered_quantity) > 0 ? Number(i.ordered_quantity) : null,
            unit_label: str(i.unit_label),
          }))
      : [];
  } catch {
    return NextResponse.json({ error: 'Invalid items payload.' }, { status: 400 });
  }
  if (items.length === 0)
    return NextResponse.json({ error: 'No order lines to match against.' }, { status: 400 });

  const expectations = parseExpectations(form.get('expectations'));

  // The caller must be able to see this order (RLS) — the upload below uses the service
  // role, so this is the access check for it.
  const supabase = await createClient();
  const { data: po } = await supabase
    .from('procurement_purchase_orders')
    .select('id')
    .eq('id', poId)
    .maybeSingle();
  if (!po) return NextResponse.json({ error: 'Purchase order not found.' }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const admin = createServiceRoleClient();

  // ── Reuse an identical read (decision 8) ───────────────────────────────────
  // Same file + same order = same answer. Also how a late result is used: the person
  // comes back from the "invoice read" notification, picks the same PDF, and the form
  // fills from the finished job instead of reading it again.
  try {
    const { data: prior } = await admin
      .from('ai_jobs')
      .select('id, result')
      .eq('job_type', JOB_TYPE)
      .eq('status', 'done')
      .contains('payload', { sha256, po_id: poId })
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.result) {
      return NextResponse.json({ reused: true, job_id: prior.id, result: prior.result });
    }

    // The same person pressing the button again while their read is still queued.
    const { data: inFlight } = await admin
      .from('ai_jobs')
      .select('id')
      .eq('job_type', JOB_TYPE)
      .eq('requested_by', user.id)
      .in('status', ['pending', 'claimed', 'running'])
      .contains('payload', { sha256, po_id: poId })
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inFlight?.id) return NextResponse.json({ job_id: inFlight.id });
  } catch {
    // A dedupe miss must never block a fresh read — fall through.
  }

  // ── Lane switched off: say so before parking a PDF nobody will read ───────
  // procurement.invoice_extract stays disabled until the Windows invoice arm lands.
  // fn_ai_enqueue would refuse it anyway (handled below); checking first avoids
  // uploading for nothing.
  try {
    const { data: type } = await admin
      .from('ai_job_types')
      .select('enabled')
      .eq('job_type', JOB_TYPE)
      .maybeSingle();
    if (type?.enabled !== true) return manual(SWITCHED_OFF);
  } catch {
    // Can't tell — let fn_ai_enqueue decide.
  }

  // ── Park the PDF (content-addressed; "already exists" = these exact bytes) ─
  const storagePath = `invoices/${poId}/${sha256}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
  const uploadStatus = String((uploadError as { statusCode?: unknown } | null)?.statusCode ?? '');
  const alreadyStored =
    !!uploadError && (uploadStatus === '409' || /already exists/i.test(uploadError.message));
  if (uploadError && !alreadyStored) {
    console.error('[procurement grn extract-invoice] upload failed:', uploadError);
    return manual(/bucket not found/i.test(uploadError.message) ? NOT_SET_UP : COULD_NOT_START);
  }

  // ── Enqueue on the ₹0 Max lane, as the signed-in user ──────────────────────
  const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
    p_job_type: JOB_TYPE,
    p_payload: {
      storage_bucket: BUCKET,
      storage_path: storagePath,
      sha256,
      po_id: poId,
      grn_id: grnId,
      po_items: items,
      expectations: {
        watch_for: expectations.watch_for,
        require_batch_expiry: expectations.require_batch_expiry,
      },
    },
  });

  if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
    const errText = typeof enq?.error === 'string' ? enq.error : '';
    if (enqError) console.error('[procurement grn extract-invoice] enqueue failed:', enqError);
    return manual(
      errText === 'unknown or disabled job_type'
        ? SWITCHED_OFF
        : errText === 'not allowed for this job_type'
          ? 'You do not have permission to use AI invoice reading — please type the invoice details in.'
          : errText === 'daily limit reached'
            ? "You have reached today's limit for AI invoice reading — please type the invoice details in."
            : errText === 'too many in-flight jobs of this type'
              ? 'You already have invoices being read — wait for those, or type this one in.'
              : COULD_NOT_START,
    );
  }

  return NextResponse.json({ job_id: enq.job_id });
}
