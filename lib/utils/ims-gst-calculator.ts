/**
 * IMS GST Calculator
 *
 * Handles procurement-side GST breakdown (GRN items).
 * Determines CGST+SGST vs IGST automatically from supplier and store GSTINs.
 *
 * Indian GSTIN format: first 2 digits = state code (e.g. 33 = Tamil Nadu)
 * - Intra-state supply → CGST = rate/2, SGST = rate/2
 * - Inter-state supply → IGST = full rate
 *
 * Rounding: applied once at the final total, not per component.
 */

export type GstRate = 0 | 5 | 12 | 18 | 28;

export interface GstLineBreakdown {
  taxableAmount: number;   // cost_price × quantity (before GST)
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  igstPercent: number;
  igstAmount: number;
  totalGstAmount: number;  // cgst + sgst + igst
  totalAmount: number;     // taxableAmount + totalGstAmount (what you pay the supplier)
}

export interface GstInvoiceSummary {
  totalTaxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGst: number;
  grandTotal: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extract 2-digit state code from a GSTIN string.
 * Returns empty string if the GSTIN is too short to be valid.
 */
function stateCode(gstin: string): string {
  return gstin.trim().slice(0, 2);
}

// ─── Core calculation ────────────────────────────────────────────────────────

/**
 * Calculate GST breakdown for a single GRN line item.
 *
 * @param costPricePerUnit  Unit purchase price EXCLUDING GST
 * @param quantity          Quantity received
 * @param gstRate           GST percentage applicable to this item (0/5/12/18/28)
 * @param supplierGstin     Supplier's GSTIN — determines supply state
 * @param storeGstin        Store's GSTIN — determines receiving state
 */
export function calculateGstLine(
  costPricePerUnit: number,
  quantity: number,
  gstRate: number,
  supplierGstin: string | null,
  storeGstin: string | null
): GstLineBreakdown {
  const taxableAmount = r2(costPricePerUnit * quantity);

  // No GST: rate is 0 or GSTINs are unavailable
  if (gstRate === 0 || !supplierGstin || !storeGstin) {
    return {
      taxableAmount,
      cgstPercent: 0, cgstAmount: 0,
      sgstPercent: 0, sgstAmount: 0,
      igstPercent: 0, igstAmount: 0,
      totalGstAmount: 0,
      totalAmount: taxableAmount,
    };
  }

  const isInterState = stateCode(supplierGstin) !== stateCode(storeGstin);

  if (isInterState) {
    // Inter-state: IGST = full rate
    const igstAmount = r2(taxableAmount * gstRate / 100);
    return {
      taxableAmount,
      cgstPercent: 0,     cgstAmount: 0,
      sgstPercent: 0,     sgstAmount: 0,
      igstPercent: gstRate, igstAmount,
      totalGstAmount: igstAmount,
      totalAmount: r2(taxableAmount + igstAmount),
    };
  }

  // Intra-state: CGST + SGST = rate/2 each
  const halfRate = gstRate / 2;
  const cgstAmount = r2(taxableAmount * halfRate / 100);
  const sgstAmount = r2(taxableAmount * halfRate / 100);
  const totalGstAmount = r2(cgstAmount + sgstAmount);

  return {
    taxableAmount,
    cgstPercent: halfRate, cgstAmount,
    sgstPercent: halfRate, sgstAmount,
    igstPercent: 0,        igstAmount: 0,
    totalGstAmount,
    totalAmount: r2(taxableAmount + totalGstAmount),
  };
}

// ─── GRN-level summary ───────────────────────────────────────────────────────

/**
 * Aggregate line-level GST breakdowns into a GRN invoice summary.
 * Rounding happens once at this total level.
 */
export function summariseGstLines(lines: GstLineBreakdown[]): GstInvoiceSummary {
  const totalTaxableAmount = r2(lines.reduce((s, l) => s + l.taxableAmount, 0));
  const totalCgst          = r2(lines.reduce((s, l) => s + l.cgstAmount, 0));
  const totalSgst          = r2(lines.reduce((s, l) => s + l.sgstAmount, 0));
  const totalIgst          = r2(lines.reduce((s, l) => s + l.igstAmount, 0));
  const totalGst           = r2(totalCgst + totalSgst + totalIgst);
  const grandTotal         = r2(totalTaxableAmount + totalGst);

  return { totalTaxableAmount, totalCgst, totalSgst, totalIgst, totalGst, grandTotal };
}

// ─── Sales invoice total (no GST on customer bill) ──────────────────────────

/**
 * Calculate customer-facing invoice total.
 * No GST shown — rounding applied once at grand total.
 *
 * @param items  Array of { unitPrice, quantity } line items
 */
export function calculateSaleTotal(
  items: Array<{ unitPrice: number; quantity: number }>
): { subtotal: number; total: number } {
  const subtotal = r2(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  return { subtotal, total: subtotal };
}
