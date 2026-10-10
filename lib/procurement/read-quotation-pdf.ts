// lib/procurement/read-quotation-pdf.ts
//
// Read one vendor quotation PDF with the AI and resolve with what it found.
// Same pipeline as the single "Add quotation" page: the ₹0 office lane first
// (/api/procurement/quotations/extract-pdf), and if no office runner picks the job
// up within DIRECT_AFTER_MS, a direct read (/extract-pdf/direct). Wrapped as one
// promise so the bulk upload can read several PDFs side by side.

export interface ExtractedLine {
  rfq_item_id: string | null;
  item_name?: string | null;
  unit_price?: number | null;
  /** The pack the price is for, as printed ("100 ml"). Absent from older reads. */
  pack?: string | null;
  uncertain?: boolean;
  /** item / part of a set / one of several options. Absent from older reads. */
  role?: 'item' | 'part' | 'option';
  /** A second look agreed with this match; `reason` says why in a few words. */
  checked?: boolean;
  reason?: string | null;
  catalog_code?: string | null;
  manufacturer?: string | null;
  quality_grade?: string | null;
  concentration?: string | null;
  other_specs?: string | null;
  gst_percent?: number | null;
  hsn?: string | null;
  /** Quantity and amount as printed on the line; absent from older reads. */
  quantity?: number | null;
  line_total?: number | null;
  list_price?: number | null;
  discount_percent?: number | null;
}

export interface ExtractResult {
  from_scan?: boolean;
  lines?: ExtractedLine[];
  unmatched_note?: string | null;
  vendor?: {
    name?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    contact_person?: string | null;
  } | null;
  quote_number?: string | null;
  quote_date?: string | null;
  validity_date?: string | null;
  delivery_days?: number | null;
  payment_terms?: string | null;
  warranty?: string | null;
  /** The grand total printed on the quotation, and whether it includes GST. */
  stated_total?: number | null;
  last_serial_no?: number | null;
  /** Corrections the reader made, in words — show them with the other warnings. */
  read_notes?: string[];
  total_includes_gst?: boolean | null;
}

const POLL_MS = 2_000;
const DIRECT_AFTER_MS = 10_000;
const GIVE_UP_MS = 180_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the reader is told about one requested item — the name alone can't tell 500 g from 500 ml. */
export const extractItemOf = (it: {
  id: string;
  item_name: string;
  item_spec?: string | null;
  quantity?: number;
  unit_label?: string | null;
}) => ({
  id: it.id,
  item_name: it.item_name,
  item_spec: it.item_spec ?? null,
  quantity: it.quantity ?? null,
  unit_label: it.unit_label ?? null,
});

export async function readQuotationPdf(
  file: File,
  rfq: {
    id: string;
    items: Array<{ id: string; item_name: string; item_spec?: string | null; quantity?: number; unit_label?: string | null }>;
  }
): Promise<ExtractResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('rfq_id', rfq.id);
  fd.append('items', JSON.stringify(rfq.items.map(extractItemOf)));

  const res = await fetch('/api/procurement/quotations/extract-pdf', { method: 'POST', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'AI reading failed');
  if (json.unavailable) throw new Error(json.error || 'AI PDF reading is unavailable right now');
  if ((json.direct || json.reused) && json.result) return json.result as ExtractResult;
  if (typeof json.job_id !== 'string') throw new Error('Could not start the AI reading');

  const jobId: string = json.job_id;
  const startedAt = Date.now();
  let directTried = false;

  while (Date.now() - startedAt < GIVE_UP_MS) {
    await sleep(POLL_MS);
    try {
      const sres = await fetch(`/api/procurement/quotations/extract-pdf/status?job_id=${encodeURIComponent(jobId)}`);
      const sjson = await sres.json();
      if (sjson.status === 'done') return sjson.result as ExtractResult;
      if (['error', 'canceled', 'not_found'].includes(sjson.status)) {
        throw new Error('AI could not read this PDF');
      }
      if (sjson.status === 'pending' && !directTried && Date.now() - startedAt > DIRECT_AFTER_MS) {
        directTried = true;
        const dres = await fetch('/api/procurement/quotations/extract-pdf/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId }),
        });
        const djson = await dres.json().catch(() => ({}));
        if (djson.status === 'done') return djson.result as ExtractResult;
        if (djson.error) throw new Error(djson.error);
      }
    } catch (e) {
      // A definite failure ends the read; a network blip (TypeError from fetch) or
      // a garbled response (SyntaxError from .json()) keeps polling.
      if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
    }
  }
  throw new Error('The AI reading took too long');
}
