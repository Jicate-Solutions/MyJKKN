// lib/services/procurement/invoice-checks.ts
//
// App-side invoice checks I1–I4 (specs: procurement invoice extraction → ₹0 Max lane,
// Draft PR #4289). PURE and side-effect-free, like three-way-match.ts, so the GRN form
// (live preview) and the GRN service (save path) apply the SAME rules.
//
// The model is never the enforcer. The AI only reads the PDF; whether a line is
// allowed, expired, not ordered, or a duplicate is decided here, deterministically.
//
// Dates are ISO `YYYY-MM-DD` strings. `today` is always passed in (never read from the
// clock inside), so every rule is testable at its boundaries.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (both YYYY-MM-DD). Null when either is not a valid date. */
export function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * A real calendar date written as YYYY-MM-DD. "2025-02-30" and "03/04/2025" are not.
 * Used to refuse an AI-read or posted date the rules below would otherwise skip
 * (daysBetween returns null for a non-ISO value, which disables I2 and I4).
 */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** Today's date in the viewer's local calendar, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── I1 duplicate invoice number ──────────────────────────────────────────────

/**
 * Normalise an invoice number for comparison: trimmed, case-folded, spaces and dashes
 * removed. "INV-2041", " inv 2041 ", "inv–2041" (en dash) all become "inv2041".
 * Returns null for an empty or missing number — an empty number never matches anything.
 */
export function normaliseInvoiceNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  // Hyphen-minus plus the Unicode dash family (‐ ‑ ‒ – — ―) and the minus sign.
  const n = raw.trim().toLowerCase().replace(/[\s\-‐-―−]+/g, '');
  return n || null;
}

/** The fields of an existing GRN the duplicate check (and the side-by-side) needs. */
export interface DuplicateCandidate {
  id: string;
  supplier_id: string;
  invoice_number: string | null;
  status?: string | null;
  created_at?: string | null;
}

/** True when `g` was recorded before `ref` — created_at first, id as the tie-break. */
function recordedBefore(
  g: { id: string; created_at?: string | null },
  ref: { id: string; created_at: string },
): boolean {
  const a = Date.parse(g.created_at ?? '');
  const b = Date.parse(ref.created_at);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a < b || (a === b && g.id < ref.id);
}

/**
 * Earlier GRNs from the SAME supplier with the same normalised invoice number.
 *
 * Cancelled receipts are excluded: a cancelled GRN was undone, and re-recording the same
 * invoice is the expected way to fix it. `excludeGrnId` skips the record being edited.
 *
 * `earlierThan` (an already-saved receipt) keeps only receipts recorded BEFORE it, the
 * same rule as fn_procurement_grn_has_duplicate: the original receipt is never held by
 * a later repeat of it — only the repeat is. Omit it for a receipt not saved yet.
 */
export function findDuplicateGrns<T extends DuplicateCandidate>(
  candidates: readonly T[],
  supplierId: string | null | undefined,
  invoiceNumber: string | null | undefined,
  excludeGrnId?: string | null,
  earlierThan?: { id: string; created_at: string } | null,
): T[] {
  const key = normaliseInvoiceNumber(invoiceNumber);
  if (!key || !supplierId) return [];
  return candidates.filter(
    (g) =>
      g.supplier_id === supplierId &&
      g.id !== excludeGrnId &&
      g.status !== 'cancelled' &&
      normaliseInvoiceNumber(g.invoice_number) === key &&
      (!earlierThan || recordedBefore(g, earlierThan)),
  );
}

// ── I2 expired / near expiry ─────────────────────────────────────────────────

export type ExpiryState = 'expired' | 'near_expiry' | 'ok';

/**
 * Classify a line's expiry date against today.
 *   expiry <  today              → 'expired'     (today itself is still usable)
 *   expiry <= today + nearDays   → 'near_expiry' (warning only)
 *   otherwise                    → 'ok'
 * Null when there is no (valid) expiry date — nothing to judge.
 * A non-positive or missing `nearDays` disables the near-expiry warning.
 */
export function expiryState(
  expiryDate: string | null | undefined,
  today: string,
  nearDays: number | null | undefined,
): ExpiryState | null {
  const left = daysBetween(today, expiryDate ?? null);
  if (left == null) return null;
  if (left < 0) return 'expired';
  const window = Number(nearDays);
  if (Number.isFinite(window) && window > 0 && left <= window) return 'near_expiry';
  return 'ok';
}

/**
 * Whether an expired line blocks the save. Only goods being ACCEPTED into stock are
 * blocked: an expired line whose quantity is all rejected is exactly how the receiver
 * records that expired goods were refused, so it must stay saveable.
 */
export function expiredLineBlocks(
  line: { expiry_date?: string | null; accepted_quantity?: number | null },
  today: string,
): boolean {
  return expiryState(line.expiry_date, today, null) === 'expired' && Number(line.accepted_quantity ?? 0) > 0;
}

// ── I3 not ordered ───────────────────────────────────────────────────────────

export interface ReadInvoiceLine {
  po_item_id?: string | null;
  item_name?: string | null;
  uncertain?: boolean;
  /** The model's hint. Ignored as a verdict — see splitInvoiceLines. */
  not_on_po?: boolean;
  invoice_quantity?: number | null;
  invoice_unit_price?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
}

/**
 * Split AI-read lines into those that belong to a line of THIS purchase order and those
 * that were never ordered. Re-derived app-side: a line counts as ordered only when its
 * po_item_id is one of the order's own line ids — whatever the model's `not_on_po` says.
 * "Not ordered" lines are for display only and must never be added to accepted stock.
 *
 * When two invoice lines claim the same PO line, the first fills the form and the rest
 * are returned in `duplicates` so the person can see the AI was unsure.
 */
export function splitInvoiceLines<T extends ReadInvoiceLine>(
  lines: readonly T[] | null | undefined,
  poItemIds: readonly string[],
): { ordered: T[]; notOrdered: T[]; duplicates: T[] } {
  const ids = new Set(poItemIds);
  const seen = new Set<string>();
  const ordered: T[] = [];
  const notOrdered: T[] = [];
  const duplicates: T[] = [];
  for (const l of lines ?? []) {
    const id = typeof l?.po_item_id === 'string' ? l.po_item_id : null;
    if (!id || !ids.has(id)) {
      notOrdered.push(l);
    } else if (seen.has(id)) {
      duplicates.push(l);
    } else {
      seen.add(id);
      ordered.push(l);
    }
  }
  return { ordered, notOrdered, duplicates };
}

// ── I4 old invoice ───────────────────────────────────────────────────────────

/**
 * Is the invoice older than the receiver's declared limit?
 * `today - invoice_date > maxAgeDays` → warn AND require a typed reason before save.
 * No limit set, or no valid invoice date, → no check.
 */
export function invoiceAgeCheck(
  invoiceDate: string | null | undefined,
  today: string,
  maxAgeDays: number | null | undefined,
): { ageDays: number | null; tooOld: boolean } {
  const ageDays = daysBetween(invoiceDate ?? null, today);
  const max = Number(maxAgeDays);
  const tooOld = ageDays != null && Number.isFinite(max) && max > 0 && ageDays > max;
  return { ageDays, tooOld };
}

/** True when the old-invoice rule fires and no usable reason was given. */
export function lateReasonMissing(
  invoiceDate: string | null | undefined,
  today: string,
  maxAgeDays: number | null | undefined,
  reason: string | null | undefined,
): boolean {
  return invoiceAgeCheck(invoiceDate, today, maxAgeDays).tooOld && !(reason ?? '').trim();
}

// ── I1 held save (Director, 2026-10-09) ──────────────────────────────────────

/**
 * A receipt whose invoice number repeats an earlier one from the same supplier is
 * SAVED, but held: it cannot be verified (added to stock) until a verifier confirms it
 * is a different invoice. The verifier must not be the person who received it.
 *
 *   held        — a duplicate exists and nobody has confirmed it yet
 *   canConfirm  — the viewer may press "this is a different invoice" now
 *   blocksVerify — verify must be refused (same as held)
 *
 * The database enforces the same rule (fn_procurement_guard_approval refuses the verify,
 * fn_procurement_grn_invoice_checks refuses a confirmer who is the receiver).
 */
export function duplicateHold(input: {
  hasDuplicate: boolean;
  confirmedBy: string | null | undefined;
  viewerId: string | null | undefined;
  receivedBy: string | null | undefined;
  viewerCanVerify: boolean;
}): { held: boolean; canConfirm: boolean; blocksVerify: boolean } {
  const held = input.hasDuplicate && !input.confirmedBy;
  const canConfirm =
    held &&
    input.viewerCanVerify &&
    !!input.viewerId &&
    input.viewerId !== input.receivedBy;
  return { held, canConfirm, blocksVerify: held };
}

// ── Filling the form from a finished read (review round, 2026-10-09) ─────────

/** The per-line fields an AI read may fill. */
export interface MergeableLine {
  po_item_id: string;
  item_name: string;
  invoice_quantity?: number | null;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
  cost?: number | null;
}

export type ReadMark = 'ai' | 'uncertain';
type HeaderKey = 'invoice_number' | 'invoice_date' | 'invoice_amount';

/**
 * Merge a finished AI read into what is on the form. A value the person typed ALWAYS
 * wins over an AI-read one (the read can land while they are still typing):
 *   - a header field is filled only while it is blank or still holds an AI value
 *     (`aiMarked` — a mark is cleared the moment a person edits the field);
 *   - a line the person edited (`touched`) gets only its blank batch / dates / price,
 *     never its quantities; an untouched line takes the read quantity, and accepted
 *     is the read quantity less whatever is already rejected;
 *   - rejected and missing quantities are never written;
 *   - a date that is not a real YYYY-MM-DD is left out and reported in `unreadable`
 *     (its line is marked uncertain): a date input cannot show it, and the expiry and
 *     invoice-age checks would silently skip it.
 * Lines billed twice against one order line come back in `duplicates` (see
 * splitInvoiceLines) — the caller must show them, never drop them.
 */
export function mergeInvoiceRead<L extends MergeableLine>(input: {
  header: Record<HeaderKey, string>;
  aiMarked: Partial<Record<string, unknown>>;
  lines: readonly L[];
  touched: ReadonlySet<string>;
  invoice?: {
    invoice_number?: string | null;
    invoice_date?: string | null;
    invoice_amount?: number | null;
  } | null;
  readLines?: readonly ReadInvoiceLine[] | null;
}): {
  header: Partial<Record<HeaderKey, string>>;
  lines: L[];
  marks: Record<string, ReadMark>;
  notOrdered: ReadInvoiceLine[];
  duplicates: ReadInvoiceLine[];
  unreadable: string[];
  kept: number;
  matched: number;
} {
  const marks: Record<string, ReadMark> = {};
  const header: Partial<Record<HeaderKey, string>> = {};
  const unreadable: string[] = [];
  let kept = 0;
  const canFill = (key: HeaderKey) => !input.header[key].trim() || !!input.aiMarked[key];

  const inv = input.invoice ?? null;
  const offer = (key: HeaderKey, value: string) => {
    if (canFill(key)) {
      header[key] = value;
      marks[key] = 'ai';
    } else kept++;
  };
  if (inv?.invoice_number) offer('invoice_number', inv.invoice_number);
  if (inv?.invoice_date) {
    if (isIsoDate(inv.invoice_date)) offer('invoice_date', inv.invoice_date);
    else unreadable.push(`invoice date read as "${inv.invoice_date}" — type it in`);
  }
  if (inv?.invoice_amount != null && Number.isFinite(Number(inv.invoice_amount))) {
    offer('invoice_amount', String(inv.invoice_amount));
  }

  const split = splitInvoiceLines(input.readLines, input.lines.map((l) => l.po_item_id));
  const doubled = new Set(split.duplicates.map((l) => l.po_item_id as string));
  const byPo = new Map(split.ordered.map((l) => [l.po_item_id as string, l]));

  const lines = input.lines.map((l) => {
    const ex = byPo.get(l.po_item_id);
    if (!ex) return l;
    const touched = input.touched.has(l.po_item_id);
    let uncertain = !!ex.uncertain || doubled.has(l.po_item_id);
    const patch: Partial<MergeableLine> = {};
    let keptHere = false;

    const qty = Number(ex.invoice_quantity);
    if (ex.invoice_quantity != null && Number.isFinite(qty) && qty >= 0) {
      if (touched) keptHere = true;
      else {
        patch.invoice_quantity = qty;
        patch.received_quantity = qty;
        patch.accepted_quantity = Math.max(0, qty - (Number(l.rejected_quantity) || 0));
      }
    }
    if (ex.batch_number) {
      if (!touched || !l.batch_number?.trim()) patch.batch_number = ex.batch_number;
      else keptHere = true;
    }
    for (const [field, label] of [
      ['expiry_date', 'expiry'],
      ['manufacturing_date', 'mfg'],
    ] as const) {
      const raw = ex[field];
      if (!raw) continue;
      if (!isIsoDate(raw)) {
        uncertain = true;
        unreadable.push(`"${l.item_name}": ${label} date read as "${raw}" — type it in`);
      } else if (!touched || !l[field]) patch[field] = raw;
      else keptHere = true;
    }
    if (ex.invoice_unit_price != null) {
      if (!touched || l.cost == null) patch.cost = ex.invoice_unit_price;
      else keptHere = true;
    }

    if (keptHere) kept++;
    if (!touched || Object.keys(patch).length) {
      marks[`line:${l.po_item_id}`] = uncertain ? 'uncertain' : 'ai';
    }
    return { ...l, ...patch };
  });

  return {
    header,
    lines,
    marks,
    notOrdered: split.notOrdered,
    duplicates: split.duplicates,
    unreadable,
    kept,
    matched: split.ordered.length,
  };
}
