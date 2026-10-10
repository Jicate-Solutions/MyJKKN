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
 * Normalise an invoice number for comparison: compatibility-folded (NFKC, so full-width
 * "ＩＮＶ－００１" is "INV-001"), case-folded, and with every space, dash and INVISIBLE
 * character removed. "INV-2041", " inv 2041 ", "inv–2041" (en dash) and "INV-2041" with a
 * zero-width space or soft hyphen hidden in it all become "inv2041". Other visible
 * punctuation (a slash) is kept: it is part of the number.
 * Returns null for an empty or missing number — an empty number never matches anything.
 *
 * MUST stay identical to fn_procurement_normalise_invoice_number (migration
 * 20261009120000): the strip set below is an explicit list of code points, the same list
 * in both, because Postgres's character classes follow the server's C library and match
 * no JS class (measured on production: 840 BMP code points only Postgres's [[:alnum:]]
 * counts, 419 only JS [\p{L}\p{N}] counts). Pinned by the "agrees with
 * fn_procurement_normalise_invoice_number" test.
 */
// C0 controls + space, hyphen-minus, DEL + C1 controls + no-break space, soft hyphen,
// combining grapheme joiner, Arabic letter mark, Hangul fillers, Khmer inherent vowels,
// Mongolian selectors, the Unicode spaces / zero-widths / bidi marks / dashes
// (U+2000-2015), line + paragraph separators and bidi embeddings (U+2028-202F), word
// joiner + invisible operators (U+205F-2064), bidi isolates + deprecated format
// (U+2066-206F), minus sign, ideographic space, variation selectors, BOM, interlinear
// annotation marks and tag characters.
const INVOICE_NUMBER_STRIP =
  /[\u0000-\u0020\u002d\u007f-\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u2015\u2028-\u202f\u205f-\u2064\u2066-\u206f\u2212\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff9-\ufffb\u{e0000}-\u{e007f}]+/gu;

export function normaliseInvoiceNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const n = raw.normalize('NFKC').toLowerCase().replace(INVOICE_NUMBER_STRIP, '');
  return n || null;
}

// ── Invoice-number format, D2 + D3 (Director, 2026-10-10) ─────────────────────

/**
 * D3: a saved invoice number holds only A-Z, a-z, 0-9, "-" and "/", and at least one
 * letter or digit (decisions round, red team: "---" passed the charset but normalised to
 * blank, so the receipt could never be verified). The database's
 * procurement_grn_invoice_number_charset CHECK uses the same pattern; both allow exactly
 * these 64 characters (checked on Postgres 15.6 and 16, and in the tests here).
 * The normaliser above stays as defence in depth.
 */
export const INVOICE_NUMBER_ALLOWED = /^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$/;

export const INVOICE_NUMBER_FORMAT_MESSAGE =
  'An invoice number can only have letters (A–Z), digits (0–9), "-" and "/", and must have at least one letter or digit. Retype it as printed on the bill, without spaces or other symbols.';

/** D3: is this (already trimmed) invoice number allowed to be saved? */
export function invoiceNumberFormatOk(value: string | null | undefined): boolean {
  return typeof value === 'string' && INVOICE_NUMBER_ALLOWED.test(value);
}

export const BLANK_INVOICE_MESSAGE =
  'This delivery has no invoice number, so it cannot be added to stock. Cancel it and record the delivery again with the invoice number from the bill.';

/**
 * D2: a receipt with no invoice number never goes into stock. Replacement receipts are
 * exempt, but they are created already in stock (receiveReplacement) and never pass
 * through verify, so every receipt that reaches verify needs a number. Same test as the
 * database guard: nothing left after normalising.
 */
export function blankInvoiceBlocksStock(invoiceNumber: string | null | undefined): boolean {
  return normaliseInvoiceNumber(invoiceNumber) === null;
}

/**
 * E1 (Director 2026-10-10 afternoon): self-check banned. Whoever received a delivery
 * (procurement_grn.received_by) never checks it into stock, whatever their rights —
 * admins and super admins included. The database verify guard refuses it too
 * (fn_procurement_guard_approval, migration 20261009120000).
 */
export const SELF_CHECK_MESSAGE =
  'You received this delivery, so someone else must check this delivery before it is added to stock.';

/** E1, replacement arm: the original delivery's receiver neither claims nor receives its replacement. */
export const REPLACEMENT_SELF_CHECK_MESSAGE =
  'You received the original delivery, so someone else must receive and check its replacement.';

/** E1: is `viewerId` the person who received this delivery? Then they may not check it. */
export function selfCheckBlocks(
  receivedBy: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  return !!viewerId && !!receivedBy && receivedBy === viewerId;
}

/** The fields of an existing GRN the duplicate check (and the side-by-side) needs. */
export interface DuplicateCandidate {
  id: string;
  supplier_id: string;
  invoice_number: string | null;
  status?: string | null;
  created_at?: string | null;
  received_by?: string | null;
}

/**
 * GRN statuses whose accepted goods are already in stock — the same set the DB verify
 * guard (fn_procurement_guard_approval) and fn_procurement_grn_has_duplicate treat as
 * posted.
 */
export const POSTED_GRN_STATUSES: readonly string[] = [
  'accepted',
  'partially_accepted',
  'replacement_requested',
  'completed',
];

const isPosted = (g: { status?: string | null }) =>
  !!g.status && POSTED_GRN_STATUSES.includes(g.status);

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
 * Other GRNs from the SAME supplier with the same normalised invoice number that hold
 * this one.
 *
 * Cancelled receipts are excluded: a cancelled GRN was undone, and re-recording the same
 * invoice is the expected way to fix it. `excludeGrnId` skips the record being edited.
 *
 * `earlierThan` (an already-saved receipt) keeps only receipts that are already POSTED
 * (whenever they were recorded) or were recorded BEFORE it — the same rule as
 * fn_procurement_grn_has_duplicate. A posted one always counts, so cancelling the
 * original, verifying the repeat and reviving the original holds the original. Recording
 * order only decides which of two never-posted receipts is the original: the original is
 * never held by a later, unposted repeat of it — only the repeat is. Omit it for a
 * receipt not saved yet (every other non-cancelled one counts).
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
      (!earlierThan || isPosted(g) || recordedBefore(g, earlierThan)),
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
 * A receipt whose invoice number repeats another from the same supplier (one already
 * posted, or recorded earlier — see findDuplicateGrns) is SAVED, but held: it cannot be verified (added to stock) until a verifier confirms it
 * is a different invoice. The verifier must not be the person who received it.
 *
 *   held        — a duplicate exists and nobody has confirmed it yet, or the
 *                 confirmation does not count (confirmationVoid)
 *   canConfirm  — the viewer may press "this is a different invoice" now
 *   blocksVerify — verify must be refused (same as held)
 *   confirmationVoid — D4: the confirmer received this delivery or another one with
 *                 this number, so a third person must confirm again
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
  /**
   * D4 (Director 2026-10-10), third-person rule: did the viewer receive the OTHER
   * delivery this one repeats? Then they may not confirm either.
   */
  viewerReceivedMatch?: boolean;
  /**
   * D4 at verify time (decisions round, red team): did the person who CONFIRMED receive
   * another delivery with this number (in any status)? Then the confirmation does not
   * count, as in the database verify guard.
   */
  confirmerReceivedMatch?: boolean;
}): {
  held: boolean;
  canConfirm: boolean;
  blocksVerify: boolean;
  viewerIsParty: boolean;
  confirmationVoid: boolean;
} {
  const confirmationVoid =
    input.hasDuplicate &&
    !!input.confirmedBy &&
    (input.confirmedBy === input.receivedBy || !!input.confirmerReceivedMatch);
  const held = (input.hasDuplicate && !input.confirmedBy) || confirmationVoid;
  const viewerIsParty =
    !!input.viewerId && (input.viewerId === input.receivedBy || !!input.viewerReceivedMatch);
  const canConfirm = held && input.viewerCanVerify && !!input.viewerId && !viewerIsParty;
  return { held, canConfirm, blocksVerify: held, viewerIsParty, confirmationVoid };
}

/**
 * D4: of the receipts the caller can see, did `userId` receive ANY other one from the
 * same supplier with the same normalised invoice number — whatever its status (cancelled
 * included) and whenever it was recorded? Not the findDuplicateGrns hold set (decisions
 * round, red team: a later, unposted or cancelled receipt of the confirmer's can be
 * posted or revived after the confirmation). Same question as
 * fn_procurement_grn_has_duplicate with p_received_by; the database answer also covers
 * colleges the caller cannot see.
 */
export function receivedMatchingDelivery<T extends DuplicateCandidate>(
  candidates: readonly T[],
  grn: { id: string; supplier_id: string; invoice_number: string | null },
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  const key = normaliseInvoiceNumber(grn.invoice_number);
  if (!key || !grn.supplier_id) return false;
  return candidates.some(
    (g) =>
      g.supplier_id === grn.supplier_id &&
      g.id !== grn.id &&
      g.received_by === userId &&
      normaliseInvoiceNumber(g.invoice_number) === key,
  );
}

export const THIRD_PERSON_MESSAGE =
  'You received the other delivery that carries this invoice number, so you cannot confirm it. A third person, who received neither delivery, must confirm.';

export const CONFIRMATION_VOID_MESSAGE =
  'The person who confirmed this repeated invoice number received one of the deliveries that carry it, so the confirmation does not count. A third person, who received neither delivery, must confirm it before stock is added.';

// ── Reusing a finished read (review round 2, 2026-10-09) ─────────────────────

/**
 * The invoice-read result contract version this app understands. The Max-lane runner
 * stamps it on every result as `version`; bump it whenever the contract changes, so an
 * older (or malformed) stored read of a PDF is read again instead of being replayed.
 * Same pattern as EXTRACT_RESULT_VERSION for quotations.
 */
export const INVOICE_READ_RESULT_VERSION = 1;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * May a stored, finished invoice read be handed out again for the same PDF + order?
 * Only when it is the current contract version and has the documented shape:
 * `invoice` an object or null/absent, `lines` an array of objects or absent. Anything
 * else is read again, so one bad result is never replayed to every later upload.
 */
export function isReusableInvoiceRead(result: unknown): boolean {
  if (!isPlainObject(result)) return false;
  if (!(Number(result.version) >= INVOICE_READ_RESULT_VERSION)) return false;
  if (result.invoice != null && !isPlainObject(result.invoice)) return false;
  if (result.lines != null && !(Array.isArray(result.lines) && result.lines.every(isPlainObject)))
    return false;
  return true;
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
