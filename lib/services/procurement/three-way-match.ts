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
}

export interface MatchResult {
  match_status: GrnMatchStatus;
  mismatch_flag: boolean;
  /** Human-readable reason, or null when fully matched. */
  reason: string | null;
}

/** Small tolerance so float noise (e.g. 9.999999) doesn't read as a mismatch. */
const EPS = 0.001;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

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
}: MatchInput): MatchResult {
  const received = Number(receivedQty) || 0;
  const remaining = Number(orderedRemaining) || 0;
  const invoice = invoiceQty == null ? null : Number(invoiceQty);
  const poPrice = poUnitPrice == null ? null : Number(poUnitPrice);
  const invPrice = invoiceUnitPrice == null ? null : Number(invoiceUnitPrice);

  const qtyMismatch = invoice != null && !eq(invoice, received);
  const over = received > remaining + EPS;
  const partial = received < remaining - EPS;
  const priceMismatch = poPrice != null && invPrice != null && invPrice > 0 && !eq(poPrice, invPrice);

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
      reason: `Invoice billed ${invoice} but ${received} physically received.`,
    };
  }
  if (priceMismatch) {
    return {
      match_status: 'price_mismatch',
      mismatch_flag: true,
      reason: `Invoice unit price ${invPrice} differs from PO price ${poPrice}.`,
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

/**
 * Validate a line for verification. Chemical items MUST carry batch + expiry before
 * their accepted qty can post to inventory (PRD step 10 — chemical validation).
 * Returns an array of blocking errors ([] means the line is clear to post).
 */
export function validateLineForVerify(line: {
  item_name: string;
  is_chemical: boolean;
  accepted_quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}): string[] {
  const errors: string[] = [];
  if (line.accepted_quantity > 0 && line.is_chemical) {
    if (!line.batch_number?.trim()) {
      errors.push(`"${line.item_name}" is a chemical — a batch number is required.`);
    }
    if (!line.expiry_date) {
      errors.push(`"${line.item_name}" is a chemical — an expiry date is required.`);
    }
  }
  return errors;
}
