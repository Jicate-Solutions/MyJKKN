// lib/procurement/quotation-math.ts
//
// Does what the AI read add up? A quotation prints its own arithmetic — qty × rate = amount,
// and a total at the bottom. Checking the reading against that catches a misread price or a
// missed line without trusting the AI a second time. Pure, no I/O.

export interface MathLine {
  unit_price?: number | null;
  /** Quantity printed on the line. null/absent = not printed (counted as 1). */
  quantity?: number | null;
  /** Amount printed for the line, before GST. null/absent = not printed. */
  line_total?: number | null;
  /** Rate before the line discount, and the discount %, when the quotation prints them. */
  list_price?: number | null;
  discount_percent?: number | null;
  gst_percent?: number | null;
  item_name?: string | null;
}

export interface MathInput {
  lines?: MathLine[] | null;
  /** The grand total printed on the quotation. */
  stated_total?: number | null;
  /** True when that total already includes GST; null = not clear. */
  total_includes_gst?: boolean | null;
  /** The serial number of the last item line, when lines are numbered — a count to check against. */
  last_serial_no?: number | null;
}

export interface MathCheck {
  /** Sum of every line's amount (rate × qty, or the printed line total). */
  lines_sum: number;
  stated_total: number | null;
  /** True when the printed total agrees with the lines (with or without GST); null = nothing to compare. */
  total_agrees: boolean | null;
  issues: string[];
  /** Lines the quotation numbers but the reading lacks (0 = none / not numbered). */
  lines_missing?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Rounding on a printed total: ₹2, or 0.5% of it, whichever is larger. */
const tolerance = (n: number) => Math.max(2, Math.abs(n) * 0.005);
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function checkQuotationMath(input: MathInput): MathCheck {
  const lines = (input.lines ?? []).filter((l) => Number(l.unit_price) > 0);
  const issues: string[] = [];

  let sum = 0;
  let gstSum = 0;
  for (const l of lines) {
    const rate = Number(l.unit_price);
    const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
    const printed = Number(l.line_total) > 0 ? Number(l.line_total) : null;
    const computed = rate * qty;

    // qty × rate must give the amount printed on that line.
    // A per-line total that already carries the line's GST is the same price, not an error.
    const withGst = computed * (1 + (Number(l.gst_percent) || 0) / 100);
    if (
      printed != null &&
      Number(l.quantity) > 0 &&
      Math.abs(computed - printed) > tolerance(printed) &&
      Math.abs(withGst - printed) > tolerance(printed)
    ) {
      issues.push(
        `${l.item_name || 'A line'}: ${qty} × ${rupees(rate)} is ${rupees(computed)}, but the quotation prints ${rupees(printed)}`
      );
    }
    // list rate less the printed discount must give the net rate that was read.
    const list = Number(l.list_price) > 0 ? Number(l.list_price) : null;
    const disc = Number(l.discount_percent) > 0 ? Number(l.discount_percent) : null;
    if (list != null && disc != null) {
      const net = list * (1 - disc / 100);
      if (Math.abs(net - rate) > Math.max(0.05, rate * 0.005)) {
        issues.push(
          `${l.item_name || 'A line'}: ${rupees(list)} less ${disc}% is ${rupees(net)}, but the price read is ${rupees(rate)}`
        );
      }
    }
    // Use the pre-GST amount in the running sum, whichever column the reader copied.
    const amount = printed != null && Math.abs(withGst - printed) <= tolerance(printed) && Math.abs(computed - printed) > tolerance(printed) ? computed : printed ?? computed;
    sum += amount;
    gstSum += amount * (1 + (Number(l.gst_percent) || 0) / 100);
  }
  sum = round2(sum);
  gstSum = round2(gstSum);

  const stated = Number(input.stated_total) > 0 ? Number(input.stated_total) : null;
  let agrees: boolean | null = null;
  if (stated != null && lines.length) {
    // The total may carry the line GST rates, or one standard rate the reader did not capture.
    const close = (n: number) => Math.abs(n - stated) <= tolerance(stated);
    agrees = close(sum) || close(gstSum) || [5, 12, 18, 28].some((g) => close(sum * (1 + g / 100)));
    if (!agrees) {
      issues.push(`The lines add up to ${rupees(sum)}, but the quotation's total is ${rupees(stated)} — a price or a line may be misread`);
    }
  }

  // Numbered lines: fewer read than the last S.No means lines were skipped — the one
  // check left when a quotation prints no grand total.
  const lastNo = Number(input.last_serial_no);
  const missing = lastNo > 0 ? Math.round(lastNo) - lines.length : 0;
  if (missing >= Math.max(2, lastNo * 0.05)) {
    issues.unshift(`The quotation numbers ${Math.round(lastNo)} lines, but ${lines.length} were read — ${missing} may be missing`);
  }
  return { lines_sum: sum, stated_total: stated, total_agrees: agrees, issues, lines_missing: missing > 0 ? missing : 0 };
}

/**
 * How badly a reading disagrees with the quotation's own numbers, 0 = clean.
 * A wrong printed total counts heavily (lines were dropped or misread); each line
 * whose qty × rate ≠ amount counts once; no lines at all is the worst.
 */
export function readingTrouble(input: MathInput, pages = 0): number {
  if (!input.lines?.length) return 100;
  const m = checkQuotationMath(input);
  // A model that stops early on a long PDF returns a line or two and nothing to check
  // them against: fewer than two lines a page is never a real multi-page quotation.
  const tooFew = pages >= 2 && input.lines.length < pages * 2 ? 10 : 0;
  return (m.total_agrees === false ? 10 : 0) + ((m.lines_missing ?? 0) >= 2 ? 10 : 0) + tooFew + m.issues.length;
}

/** Pages in a PDF, from its page objects; 0 when it can't tell (compressed object streams). */
export function pdfPageCount(bytes: Uint8Array): number {
  let text = '';
  for (let i = 0; i < bytes.length; i += 65536) text += String.fromCharCode(...bytes.subarray(i, i + 65536));
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/**
 * Worth a second read with the steadier model: the total disagrees, or several
 * lines don't add up. One odd line is left to the person (it is shown to them).
 */
export const needsReread = (input: MathInput, pages = 0) => readingTrouble(input, pages) >= 3;
