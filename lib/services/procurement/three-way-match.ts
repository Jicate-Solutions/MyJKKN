// lib/services/procurement/three-way-match.ts
//
// The three-way match engine (PRD step 8) — PURE, side-effect-free logic so it can
// be unit-tested and reused by both the service (on verify) and the UI (live preview
// as a receiver types quantities). It reconciles the three independent quantities a
// GRN line carries:
//
//   1. ordered_remaining  — what the PO still expects (ordered − already received)
//   2. invoice_quantity   — what the supplier billed on their invoice
//   3. received_quantity  — what was physically counted at the dock
//
// A line is fully "matched" only when all three agree. Any disagreement raises the
// mismatch flag and classifies the discrepancy so approvers can act (short-supply,
// over-supply, or an invoice that disagrees with the physical count).

import type { GrnMatchStatus } from '@/types/procurement';

export interface MatchInput {
  /** PO ordered qty minus what prior GRNs already received for this PO line. */
  orderedRemaining: number;
  /** Supplier invoice qty for the line (null when no invoice captured yet). */
  invoiceQty?: number | null;
  /** Physically received qty at the dock. */
  receivedQty: number;
  /** Awarded PO unit price (for the price axis). */
  poUnitPrice?: number | null;
  /** Supplier invoice unit price (for the price axis). */
  invoiceUnitPrice?: number | null;
  /**
   * Reviewer-set variance (percent) below which a qty/price gap is EXPECTED rather than a
   * mismatch — "a 2% swing on this order is normal, flag only beyond that". Omit (or 0) for
   * the strict default: any difference beyond float noise is a mismatch.
   *
   * Applies to the qty and price axes ONLY. Over-supply is a physical-stock fact, not a
   * rounding opinion, so it stays on the strict EPS comparison no matter what is set here.
   */
  tolerancePct?: number | null;
}

export interface MatchResult {
  match_status: GrnMatchStatus;
  mismatch_flag: boolean;
  /** Human-readable reason, or null when fully matched. */
  reason: string | null;
}

/** Small tolerance so float noise (e.g. 9.999999) doesn't read as a mismatch. */
const EPS = 0.001;

/**
 * Classify one GRN line against the three PRD axes (verify.md §9), which are INDEPENDENT:
 *
 *   1. Quantity mismatch  = supplier invoice qty ≠ physically received qty  (the PRIMARY,
 *      always-evaluated mismatch — invoice says 20, you got 18).
 *   2. Price mismatch     = supplier invoice unit price ≠ awarded PO unit price.
 *   3. Fulfilment         = received vs PO outstanding → 'short' (partial delivery) / 'over'.
 *
 * A **partial delivery** (received < ordered but invoice == received) is NORMAL per the PRD —
 * the PO simply stays "partially received" — so it is classified 'short' but is NOT a mismatch.
 * Only over-supply, an invoice-vs-received disagreement, or a price disagreement raise the flag.
 */
export function matchLine({
  orderedRemaining,
  invoiceQty,
  receivedQty,
  poUnitPrice,
  invoiceUnitPrice,
  tolerancePct,
}: MatchInput): MatchResult {
  const received = Number(receivedQty) || 0;
  const remaining = Number(orderedRemaining) || 0;
  const invoice = invoiceQty == null ? null : Number(invoiceQty);
  const poPrice = poUnitPrice == null ? null : Number(poUnitPrice);
  const invPrice = invoiceUnitPrice == null ? null : Number(invoiceUnitPrice);

  // The reviewer's expected variance. Clamped to 0-100 so a stray keystroke cannot widen the
  // bar past "everything matches". At 0 this degrades to the strict EPS comparison, so a call
  // that omits tolerancePct behaves exactly as it did before this option existed.
  const pct = Math.min(100, Math.max(0, Number(tolerancePct) || 0));
  /** Symmetric: the allowance scales with the larger of the two values being compared. */
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= Math.max(EPS, (pct / 100) * Math.max(Math.abs(a), Math.abs(b)));
  /** Suffix naming the bar that was applied, so the verifier reading mismatch_remarks knows it. */
  const bar = pct > 0 ? ` (beyond the ${pct}% variance allowed at receipt)` : '';

  // A match requires a supplier invoice to compare against (verify.md §9). With no
  // invoice captured the line is NOT matchable — do not read it as 'matched'. Surface
  // an explicit 'awaiting_invoice' state so the receiver knows the invoice is still
  // owed, rather than a misleading green pass. (Invoice fields are mandatory at GRN
  // creation — this also covers legacy GRNs and the replacement path always supplies
  // a qty, so it never lands here.)
  if (invoice == null) {
    return {
      match_status: 'awaiting_invoice',
      mismatch_flag: true,
      reason: 'No supplier invoice captured — match cannot be confirmed until an invoice is provided.',
    };
  }

  const qtyMismatch = !near(invoice, received);
  // Over/partial deliberately stay on strict EPS — see tolerancePct's doc comment.
  const over = received > remaining + EPS;
  const partial = received < remaining - EPS;
  const priceMismatch =
    poPrice != null && invPrice != null && invPrice > 0 && !near(poPrice, invPrice);

  // Precedence for the single badge (mismatch axes first, then fulfilment):
  if (over) {
    return {
      match_status: 'over',
      mismatch_flag: true,
      reason: `Over supply: received ${received}, only ${remaining} outstanding.`,
    };
  }
  if (qtyMismatch) {
    return {
      match_status: 'qty_mismatch',
      mismatch_flag: true,
      reason: `Invoice billed ${invoice} but ${received} physically received${bar}.`,
    };
  }
  if (priceMismatch) {
    return {
      match_status: 'price_mismatch',
      mismatch_flag: true,
      reason: `Invoice unit price ${invPrice} differs from PO price ${poPrice}${bar}.`,
    };
  }
  if (partial) {
    // Expected partial delivery — NOT a mismatch; the PO stays partially received.
    return {
      match_status: 'short',
      mismatch_flag: false,
      reason: `Partial delivery: received ${received} of ${remaining} outstanding.`,
    };
  }

  return { match_status: 'matched', mismatch_flag: false, reason: null };
}

export interface VerifyLineOptions {
  /**
   * Reviewer opt-in: demand batch + expiry on EVERY accepted line, not just chemicals.
   * Used when the receiver declares up front that this delivery must be fully traceable.
   */
  requireBatchExpiry?: boolean;
}

/**
 * Validate a line for verification. Chemical items MUST carry batch + expiry before
 * their accepted qty can post to inventory (PRD step 10 — chemical validation), and the
 * receiver can widen that gate to every line via `requireBatchExpiry`.
 * Returns an array of blocking errors ([] means the line is clear to post).
 */
export function validateLineForVerify(
  line: {
    item_name: string;
    is_chemical: boolean;
    accepted_quantity: number;
    batch_number?: string | null;
    expiry_date?: string | null;
  },
  opts?: VerifyLineOptions
): string[] {
  const errors: string[] = [];
  if (line.accepted_quantity <= 0) return errors;

  const gated = line.is_chemical || opts?.requireBatchExpiry === true;
  if (!gated) return errors;

  // Name the reason the gate applies, so the receiver knows whether it came from the item
  // itself or from the expectation they set — the two are fixed in different places.
  const because = line.is_chemical ? 'is a chemical' : 'needs batch tracking (required at receipt)';
  if (!line.batch_number?.trim()) {
    errors.push(`"${line.item_name}" ${because} — a batch number is required.`);
  }
  if (!line.expiry_date) {
    errors.push(`"${line.item_name}" ${because} — an expiry date is required.`);
  }
  return errors;
}
