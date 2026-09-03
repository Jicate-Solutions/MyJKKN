// lib/print/pricing.ts
//
// Prices a print job from the page breakdown produced by page-analysis.
//
// WHY THE RATE CARD IS AN ARGUMENT AND NOT A CONSTANT.
// Every counter charges differently, and the rate is a thing the institution
// changes without a deploy. Baking a number in here would mean either a code
// change per revision or — far likelier — an attendant quietly overriding the
// total, which destroys the only reason to compute it centrally. So the caller
// passes the card and this module never guesses. There is deliberately no
// default export of a rate: a missing rate must fail loudly at the call site,
// not silently price a job at someone's invented ₹2.
//
// IMPRESSIONS, NOT SHEETS. Duplex printing halves the PAPER but not the TONER,
// and toner is most of the marginal cost. Counters price per side for that
// reason, so `chargeable` counts impressions (sides with ink) while `sheets` is
// reported separately for paper stock accounting. Conflating the two is how a
// double-sided job ends up costing the same as a single-sided one.
//
// EVERYTHING IS PAISE. Rupee floats accumulate error across a day of ₹2 jobs
// and then the till does not reconcile. The branded Paise type from the
// payments layer is reused so a rupee figure cannot reach here by accident.

import type { Paise } from '@/lib/services/payments/amount';
import type { PageBreakdown } from './page-analysis';

/** Per-impression rates. Both are required — see the note on defaults above. */
export interface PrintRateCard {
  monoPaisePerImpression: number;
  colourPaisePerImpression: number;
}

export interface PrintJobSpec {
  copies: number;
  /** Double-sided. Affects sheet count and paper cost, never the per-side price. */
  duplex: boolean;
}

export interface PrintQuote {
  monoImpressions: number;
  colourImpressions: number;
  /** Physical sheets consumed — for paper stock, not for the price. */
  sheets: number;
  subtotal: Paise;
}

export class InvalidPrintJobError extends Error {}

/**
 * Quote a job.
 *
 * Blank pages are not charged (page-analysis already excluded them from
 * `billablePages`) but they ARE fed through the printer, so they count toward
 * `sheets`. A trailing blank page in a Word document costs the institution
 * paper even though billing it to the learner would be indefensible.
 */
export function quotePrintJob(
  breakdown: PageBreakdown,
  spec: PrintJobSpec,
  rates: PrintRateCard
): PrintQuote {
  if (!Number.isInteger(spec.copies) || spec.copies < 1) {
    throw new InvalidPrintJobError('copies must be a positive whole number');
  }
  for (const [name, rate] of Object.entries(rates)) {
    if (!Number.isInteger(rate) || rate < 0) {
      throw new InvalidPrintJobError(`${name} must be a non-negative whole number of paise`);
    }
  }

  const monoImpressions = breakdown.monoPages * spec.copies;
  const colourImpressions = breakdown.colourPages * spec.copies;

  // Sheets are counted over ALL pages including blanks, because the printer
  // pulls paper for them regardless of whether anyone is billed.
  const sidesPerCopy = breakdown.pages.length;
  const sheetsPerCopy = spec.duplex ? Math.ceil(sidesPerCopy / 2) : sidesPerCopy;

  const subtotal =
    monoImpressions * rates.monoPaisePerImpression +
    colourImpressions * rates.colourPaisePerImpression;

  return {
    monoImpressions,
    colourImpressions,
    sheets: sheetsPerCopy * spec.copies,
    subtotal: subtotal as Paise,
  };
}
