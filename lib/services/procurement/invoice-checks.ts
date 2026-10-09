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
}

/**
 * Earlier GRNs from the SAME supplier with the same normalised invoice number.
 *
 * Cancelled receipts are excluded: a cancelled GRN was undone, and re-recording the same
 * invoice is the expected way to fix it. `excludeGrnId` skips the record being edited.
 */
export function findDuplicateGrns<T extends DuplicateCandidate>(
  candidates: readonly T[],
  supplierId: string | null | undefined,
  invoiceNumber: string | null | undefined,
  excludeGrnId?: string | null,
): T[] {
  const key = normaliseInvoiceNumber(invoiceNumber);
  if (!key || !supplierId) return [];
  return candidates.filter(
    (g) =>
      g.supplier_id === supplierId &&
      g.id !== excludeGrnId &&
      g.status !== 'cancelled' &&
      normaliseInvoiceNumber(g.invoice_number) === key,
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
