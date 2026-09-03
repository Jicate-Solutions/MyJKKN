// Colour classification and page counting for the print counter.
//
// The coverage figures below are not invented: they are what Ghostscript's
// inkcov device actually reported for the fixtures in scripts/print-spike,
// captured so a change to the threshold has to answer to real measurements
// rather than to a hand-picked example.

import { describe, it, expect } from 'vitest';
import {
  classifyPage,
  parseInkCoverage,
  summarisePages,
  analyseInkCoverage,
} from '@/lib/print/page-analysis';

// Measured: a page of red and blue text.
const MEASURED_COLOUR = { cyan: 0.00305, magenta: 0.00778, yellow: 0.00473, black: 0.0 };
// Measured: a page of pure black text.
const MEASURED_MONO = { cyan: 0.00622, magenta: 0.00622, yellow: 0.00622, black: 0.00622 };

describe('classifyPage', () => {
  it('calls the measured colour page colour', () => {
    expect(classifyPage(MEASURED_COLOUR)).toBe('colour');
  });

  it('calls the measured black-text page mono', () => {
    expect(classifyPage(MEASURED_MONO)).toBe('mono');
  });

  it('treats an untouched page as blank', () => {
    expect(classifyPage({ cyan: 0, magenta: 0, yellow: 0, black: 0 })).toBe('blank');
  });

  // The dispute this exists to prevent: a "black and white" handout scanned on a
  // cheap flatbed carries a slight cast. Billing it as colour is a real argument
  // at a real counter.
  it('does not bill a scanner colour cast as colour', () => {
    expect(
      classifyPage({ cyan: 0.0201, magenta: 0.0205, yellow: 0.0198, black: 0.31 })
    ).toBe('mono');
  });

  // A single coloured word on an otherwise black page is still a colour page,
  // and its absolute spread is tiny — which is why the threshold is a ratio.
  it('bills a page with one small coloured element as colour', () => {
    expect(
      classifyPage({ cyan: 0.00002, magenta: 0.0004, yellow: 0.00031, black: 0.02 })
    ).toBe('colour');
  });

  // A page far below the blank floor is blank, not a colour judgement at all.
  it('treats a page with only stray antialiasing as blank', () => {
    expect(
      classifyPage({ cyan: 0, magenta: 0.000002, yellow: 0, black: 0.000001 })
    ).toBe('blank');
  });

  // Above the blank floor but with a hue spread too small to trust: the ratio
  // would be noise over noise, so the absolute floor has to catch it first.
  it('does not read faint chroma noise on a real page as colour', () => {
    expect(
      classifyPage({ cyan: 0, magenta: 0.00002, yellow: 0, black: 0.001 })
    ).toBe('mono');
  });
});

describe('parseInkCoverage', () => {
  // Real Ghostscript stdout: banner lines share the stream with page lines.
  const REAL_STDOUT = [
    'GPL Ghostscript 10.02.1 (2023-11-01)',
    'Copyright (C) 2023 Artifex Software, Inc.  All rights reserved.',
    'Processing pages 1 through 2.',
    'Page 1',
    ' 0.00305  0.00778  0.00473  0.00000 CMYK OK',
    'Page 2',
    ' 0.00622  0.00622  0.00622  0.00622 CMYK OK',
  ].join('\n');

  it('extracts one entry per page and ignores banners and page markers', () => {
    const pages = parseInkCoverage(REAL_STDOUT);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(MEASURED_COLOUR);
  });

  it('returns nothing for output with no page lines', () => {
    expect(parseInkCoverage('Processing pages 1 through 0.\n')).toEqual([]);
  });

  it('classifies a real two-page mixed document end to end', () => {
    const breakdown = analyseInkCoverage(REAL_STDOUT);
    expect(breakdown.colourPages).toBe(1);
    expect(breakdown.monoPages).toBe(1);
    expect(breakdown.billablePages).toBe(2);
  });
});

describe('summarisePages', () => {
  it('excludes blanks from the billable count but keeps them in pagination', () => {
    const b = summarisePages(['mono', 'colour', 'blank', 'mono']);
    expect(b.billablePages).toBe(3);
    expect(b.blankPages).toBe(1);
    expect(b.pages).toHaveLength(4);
  });
});
