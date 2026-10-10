import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireProcurement, PROC_QUOTATION_MANAGE } from '@/lib/utils/procurement-auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import {
  directExtractApiKey,
  extractQuotationDirect,
  EXTRACT_RESULT_VERSION,
  type QuotationSource,
} from '@/lib/procurement/quotation-pdf-direct';
import { itemKeyOf, knownNamesFor, type ItemAlias } from '@/lib/procurement/item-aliases';

export const runtime = 'nodejs';
// Normally enqueue-only (the ₹0 Max lane does the read). While that lane is
// switched off, the read happens here directly: ~5 s for a one-page quotation, but a
// 3–4 page, 60-line one is read by the steadier model in ~50–80 s, plus the second look.
export const maxDuration = 300;

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

export type ExtractItem = {
  id: string;
  item_name: string;
  item_spec: string | null;
  quantity: number | null;
  unit_label: string | null;
  aka?: string[];
};

/**
 * Names staff already confirmed for each requested item (procurement_item_aliases),
 * handed to the reader as "also called" hints. Best-effort: no hints is never an error.
 */
async function withKnownNames(rfqId: string, items: ExtractItem[]): Promise<ExtractItem[]> {
  try {
    const admin = createServiceRoleClient();
    const { data: rows } = await admin
      .from('procurement_rfq_items')
      .select('id, item_name, domain_item_id, rfq:procurement_rfqs!inner(institution_id)')
      .eq('rfq_id', rfqId);
    const first = (rows ?? [])[0] as { rfq?: { institution_id?: string } | { institution_id?: string }[] } | undefined;
    const rfq = Array.isArray(first?.rfq) ? first?.rfq[0] : first?.rfq;
    if (!rfq?.institution_id) return items;
    const keyById = new Map(
      (rows ?? []).map((r: { id: string; item_name: string; domain_item_id: string | null }) => [r.id, itemKeyOf(r)])
    );
    const { data: aliases } = await admin
      .from('procurement_item_aliases')
      .select('supplier_id, quoted_name, quoted_key, item_key, item_name, same')
      .eq('institution_id', rfq.institution_id)
      .eq('same', true)
      .in('item_key', [...new Set(keyById.values())]);
    if (!aliases?.length) return items;
    return items.map((i) => {
      const key = keyById.get(i.id);
      const aka = key ? knownNamesFor(aliases as ItemAlias[], key) : [];
      return aka.length ? { ...i, aka } : i;
    });
  } catch {
    return items;
  }
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SHEET_RE = /\.(xlsx|xls|csv)$/i;
/** A sheet is sent as text; past this it is cut (a quotation is never this long). */
const MAX_SHEET_CHARS = 60_000;

/** What kind of quotation file this is, or null when it can't be read. */
function kindOf(file: File): 'pdf' | 'image' | 'sheet' | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (SHEET_RE.test(file.name) || /spreadsheet|ms-excel|csv/.test(file.type)) return 'sheet';
  return null;
}

/** Every sheet of a workbook as CSV text, each under its own heading. */
function sheetText(bytes: Buffer): string {
  const wb = XLSX.read(bytes, { type: 'buffer' });
  return wb.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })}`)
    .join('\n\n')
    .slice(0, MAX_SHEET_CHARS);
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

/**
 * POST /api/procurement/quotations/extract-pdf  (multipart/form-data)
 * Fields: file (PDF), items (JSON array of { id, item_name, item_spec?, quantity?, unit_label? }), rfq_id
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
  const kind = kindOf(file);
  if (!kind)
    return NextResponse.json(
      { error: 'The AI reads PDFs, photos (JPG/PNG) and Excel/CSV quotations only.' },
      { status: 400 }
    );

  const rfqId = String(form.get('rfq_id') ?? '');
  if (!UUID_RE.test(rfqId))
    return NextResponse.json({ error: 'Missing or invalid rfq_id.' }, { status: 400 });

  let items: ExtractItem[];
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]'));
    items = Array.isArray(parsed)
      ? parsed
          .filter((i) => i && typeof i.id === 'string' && typeof i.item_name === 'string')
          .map((i) => ({
            id: i.id,
            item_name: i.item_name,
            // The specification ("500 ml") is what the vendor's pack is checked against.
            item_spec: str(i.item_spec),
            quantity: Number(i.quantity) > 0 ? Number(i.quantity) : null,
            unit_label: str(i.unit_label),
          }))
      : [];
  } catch {
    return NextResponse.json({ error: 'Invalid items payload.' }, { status: 400 });
  }
  if (items.length === 0)
    return NextResponse.json({ error: 'No RFQ items to match against.' }, { status: 400 });
  items = await withKnownNames(rfqId, items);

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
    // Only reuse reads that carry the quotation header (vendor, quote #, terms);
    // older ones would leave the vendor section empty.
    if (prior?.result && Number((prior.result as { version?: unknown }).version) >= EXTRACT_RESULT_VERSION) {
      return NextResponse.json({ reused: true, job_id: prior.id, result: prior.result });
    }

    // The same person pressing the button again while their read is still
    // queued: hand back that job instead of enqueuing a duplicate. Own jobs only —
    // fn_ai_job_status answers 'not_found' for anyone else's job id.
    const { data: inFlight } = await admin
      .from('ai_jobs')
      .select('id')
      .eq('job_type', JOB_TYPE)
      .eq('requested_by', user.id)
      .in('status', ['pending', 'claimed', 'running'])
      .contains('payload', { sha256, rfq_id: rfqId })
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inFlight?.id) {
      return NextResponse.json({ job_id: inFlight.id });
    }
  } catch {
    // A dedupe miss must never block a fresh read — fall through and enqueue.
  }

  // ── No office runner serving the lane: read it now ─────────────────────────
  // procurement.quotation_extract stays switched OFF (ai_job_types.enabled)
  // until the Max-lane PDF runner is installed on the office AI machine. While
  // it is off, queueing would only make the person wait for nobody, so read the
  // PDF directly (paid, Haiku) in this request and answer with the prices.
  // Switching the job type on restores the ₹0 lane, with the page's own
  // 10-second direct fallback behind it.
  const laneOn = await (async () => {
    try {
      const { data } = await createServiceRoleClient()
        .from('ai_job_types')
        .select('enabled')
        .eq('job_type', JOB_TYPE)
        .maybeSingle();
      return data?.enabled === true;
    } catch {
      return true; // can't tell — fall through to the normal queue path
    }
  })();

  if ((!laneOn || kind !== 'pdf') && directExtractApiKey()) {
    try {
      const source: QuotationSource =
        kind === 'image'
          ? { kind: 'image', base64: bytes.toString('base64'), mediaType: file.type as 'image/jpeg' }
          : kind === 'sheet'
            ? { kind: 'text', text: sheetText(bytes), fileName: file.name }
            : { kind: 'pdf', base64: bytes.toString('base64') };
      const result = await extractQuotationDirect(source, items);
      // Kept as a finished job, so the same file for the same purchase is never paid for twice.
      await createServiceRoleClient()
        .from('ai_jobs')
        .insert({
          job_type: JOB_TYPE,
          lane: 'max-pdf',
          status: 'done',
          requested_by: user.id,
          claimed_by: 'api-direct',
          payload: { sha256, rfq_id: rfqId, file_name: file.name.slice(0, 200), direct: true },
          result,
          completed_at: new Date().toISOString(),
        })
        .then(({ error }) => error && console.error('[procurement quotation extract-pdf] cache write failed:', error));
      return NextResponse.json({ direct: true, result });
    } catch (err) {
      console.error('[procurement quotation extract-pdf] direct read failed:', err);
      const message =
        err instanceof Anthropic.RateLimitError
          ? 'The AI reader is busy — please try again in a minute, or enter the prices manually.'
          : err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)
            ? 'AI reading is paused: the AI account is out of credit (an admin must top it up). Type the prices for now.'
          : err instanceof Anthropic.BadRequestError
            ? 'The AI could not open this PDF — please enter the prices manually.'
            : err instanceof Error && !(err instanceof Anthropic.APIError)
              ? err.message
              : 'AI could not read the PDF — please enter the prices manually.';
      return NextResponse.json({ error: message, unavailable: true });
    }
  }

  if (kind !== 'pdf') {
    return NextResponse.json({ error: 'AI reading of photos and sheets is not available right now — please type the prices.', unavailable: true });
  }

  const supabase = await createClient();

  // ── Park the PDF where the Max-lane runner can fetch it ────────────────────
  // The path is content-addressed (sha256): if the object is already there it
  // holds these exact bytes, so "already exists" is success. Never upsert — an
  // overwrite needs UPDATE on storage.objects, which the bucket deliberately
  // does not grant (a retry of the same PDF used to fail with an RLS error).
  const storagePath = `${rfqId}/${sha256}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
  const uploadStatus = String((uploadError as { statusCode?: unknown } | null)?.statusCode ?? '');
  const alreadyStored =
    !!uploadError && (uploadStatus === '409' || /already exists/i.test(uploadError.message));
  if (uploadError && !alreadyStored) {
    console.error('[procurement quotation extract-pdf] upload failed:', uploadError);
    // Only a missing bucket means "not set up"; anything else is a real refusal
    // and must not be disguised as a configuration gap.
    const message = /bucket not found/i.test(uploadError.message)
      ? NOT_SET_UP
      : uploadStatus === '403'
        ? 'You do not have permission to upload vendor quotations for AI reading.'
        : COULD_NOT_START;
    return NextResponse.json({ error: message, unavailable: true });
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
