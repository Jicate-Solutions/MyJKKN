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
 * Classify one GRN line. Precedence matters:
 *   short/over (goods vs PO) is reported FIRST because it drives replacement and PO
 *   closure; only when goods match the PO do we surface an invoice-vs-goods mismatch.
 */
export function matchLine({ orderedRemaining, invoiceQty, receivedQty }: MatchInput): MatchResult {
  const received = Number(receivedQty) || 0;
  const remaining = Number(orderedRemaining) || 0;
  const invoice = invoiceQty == null ? null : Number(invoiceQty);

  if (received < remaining - EPS) {
    return {
      match_status: 'short',
      mismatch_flag: true,
      reason: `Short supply: received ${received} of ${remaining} outstanding.`,
    };
  }

  if (received > remaining + EPS) {
    return {
      match_status: 'over',
      mismatch_flag: true,
      reason: `Over supply: received ${received}, only ${remaining} outstanding.`,
    };
  }

  // Goods match the PO. Now check the invoice against the physical count.
  if (invoice != null && !eq(invoice, received)) {
    return {
      match_status: 'qty_mismatch',
      mismatch_flag: true,
      reason: `Invoice billed ${invoice} but ${received} physically received.`,
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
