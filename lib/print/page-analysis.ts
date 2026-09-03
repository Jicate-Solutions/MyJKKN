// lib/print/page-analysis.ts
//
// Turns a rendered PDF into the two numbers a print job is actually billed on:
// how many pages, and which of them need colour toner.
//
// WHY THIS IS NOT "COUNT THE PAGES".
// Pricing a print job needs three facts the page count alone does not carry:
//
//   - Colour vs mono. Colour toner costs several times what black does, so a
//     single flat per-page rate either overcharges the learner printing lecture
//     notes or undercharges the one printing a poster. Every counter prices
//     these differently already; the software has to as well or it will be
//     overridden by hand, and a rate that is overridden by hand is not a record.
//   - Blank pages. Word documents routinely end in a trailing empty page, and a
//     learner charged for it will say so at the counter. Detecting it costs
//     nothing here and removes a whole category of argument.
//   - That the numbers came from the file, not from a person. This runs
//     server-side on the rendered PDF precisely so the attendant cannot type a
//     page count. If the count is typeable the reconciliation is theatre.
//
// HOW COLOUR IS DECIDED. Ghostscript's `inkcov` device reports per-page CMYK
// coverage. A greyscale page comes back with C, M and Y equal to each other
// (a neutral tone has no hue to separate them); a page with any real colour
// separates them. So the signal is the SPREAD across C/M/Y, not their size.
//
// Measured on the fixtures in scripts/print-spike (a page of red and blue text
// vs a page of pure black):
//
//   colour page   C 0.00305  M 0.00778  Y 0.00473  ->  spread 0.00473, ratio 0.61
//   mono page     C 0.00622  M 0.00622  Y 0.00622  ->  spread 0.00000, ratio 0.00
//
// The spread is compared as a RATIO of the largest channel rather than as an
// absolute, because absolute spread scales with how much ink is on the page: a
// full-bleed photo and a single coloured word are both colour, but their
// absolute spreads differ by orders of magnitude. A ratio separates them at the
// same threshold. The absolute floor below it exists only to stop a nearly
// blank page — where the ratio is noise divided by noise — from being read as
// colour.
//
// SCANS ARE THE AWKWARD CASE. A photocopied "black and white" handout scanned
// on a cheap flatbed carries a slight colour cast, and a naive detector bills it
// as colour. That is a real dispute at a real counter, so COLOUR_RATIO_THRESHOLD
// is deliberately well above any cast we have seen rather than just above zero.
// It is exported so a counter can be retuned against its own scanner without
// editing this file.

/** Per-page ink coverage as Ghostscript's inkcov device reports it: 0..1 per channel. */
export interface PageInkCoverage {
  cyan: number;
  magenta: number;
  yellow: number;
  black: number;
}

export type PageClass = 'colour' | 'mono' | 'blank';

/**
 * Hue spread, as a fraction of the strongest chromatic channel, above which a
 * page is billed as colour. 0.15 sits far above the cast of the scanners we
 * measured and far below a genuinely coloured page (0.61 on the fixture).
 */
export const COLOUR_RATIO_THRESHOLD = 0.15;

/**
 * Total coverage at or below which a page is treated as blank. Ghostscript
 * reports an untouched page as exactly zero; the floor is not zero only so that
 * a stray antialiased pixel does not make a blank page billable.
 */
export const BLANK_COVERAGE_FLOOR = 1e-5;

/**
 * Absolute spread below which the colour ratio is not trusted. On a page with
 * almost no ink, the ratio is the quotient of two rounding errors.
 */
const MIN_ABSOLUTE_SPREAD = 1e-4;

/** Classify one page from its ink coverage. Pure — no Ghostscript, no files. */
export function classifyPage(ink: PageInkCoverage): PageClass {
  const total = ink.cyan + ink.magenta + ink.yellow + ink.black;
  if (total <= BLANK_COVERAGE_FLOOR) return 'blank';

  const chroma = [ink.cyan, ink.magenta, ink.yellow];
  const max = Math.max(...chroma);
  const spread = max - Math.min(...chroma);

  if (spread < MIN_ABSOLUTE_SPREAD) return 'mono';
  if (max <= 0) return 'mono';

  return spread / max > COLOUR_RATIO_THRESHOLD ? 'colour' : 'mono';
}

/**
 * Parse the stdout of `gs -o - -sDEVICE=inkcov <file>`.
 *
 * The device prints one line per page and nothing else that ends in "CMYK OK",
 * which is what anchors the match — Ghostscript also writes banners, page
 * markers and, on some builds, font warnings to the same stream, and a looser
 * pattern picks those up as pages. Getting the page COUNT wrong here would be
 * worse than getting a colour wrong, because it is what the learner is charged
 * per unit of.
 */
export function parseInkCoverage(stdout: string): PageInkCoverage[] {
  const line =
    /^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+CMYK\s+OK\s*$/;

  const pages: PageInkCoverage[] = [];
  for (const raw of stdout.split('\n')) {
    const m = line.exec(raw);
    if (!m) continue;
    pages.push({
      cyan: Number(m[1]),
      magenta: Number(m[2]),
      yellow: Number(m[3]),
      black: Number(m[4]),
    });
  }
  return pages;
}

export interface PageBreakdown {
  /** Every page in file order, including blanks. */
  pages: PageClass[];
  /** Pages the printer will actually put toner on — what the learner pays for. */
  billablePages: number;
  colourPages: number;
  monoPages: number;
  blankPages: number;
}

/**
 * Reduce per-page classes to the counts pricing consumes.
 *
 * Blank pages are excluded from `billablePages` but kept in `pages`, because the
 * attendant still prints them — a blank page 4 in the middle of a document is
 * part of the document's pagination and dropping it silently would misalign
 * double-sided output.
 */
export function summarisePages(pages: PageClass[]): PageBreakdown {
  const colourPages = pages.filter((p) => p === 'colour').length;
  const monoPages = pages.filter((p) => p === 'mono').length;
  const blankPages = pages.filter((p) => p === 'blank').length;

  return {
    pages,
    billablePages: colourPages + monoPages,
    colourPages,
    monoPages,
    blankPages,
  };
}

/** Convenience: raw inkcov stdout straight to a breakdown. */
export function analyseInkCoverage(stdout: string): PageBreakdown {
  return summarisePages(parseInkCoverage(stdout).map(classifyPage));
}
