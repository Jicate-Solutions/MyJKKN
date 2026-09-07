// __tests__/lib/id-cards/sheet-layout.test.ts
// 2026-09-07 — the A4 sheet layout shared by the preview, the print frame and
// the PDF. The contract under test is ORDER: the student-wise layout must read
// "Student 1 front, Student 1 back, Student 2 front, Student 2 back …" row by
// row, and a flagged card must carry the same red frame + caption on every
// surface, because the preview is the single source of truth.

import { describe, it, expect } from 'vitest';
import {
  buildPrintDocument,
  buildSheetPages,
  isFlagged,
  pairsGeometry,
  pageSequence,
  sheetGeometry,
  slotCaption,
  slotOrigin,
  SHEET_W_MM,
  SHEET_H_MM,
  type SheetPage
} from '@/lib/id-cards/sheet-layout';
import type { RenderedCard } from '@/lib/services/id-cards/card-preview-client';
import type { CardFieldReport } from '@/types/id-cards';

const field = (
  key: string,
  side: 'front' | 'back',
  value: string | null,
  problem?: string
): CardFieldReport => ({
  key,
  label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  side,
  value,
  ...(problem ? { problem, problem_severity: 'critical' as const, problem_fix: 'fix it' } : {})
});

function card(
  n: number,
  opts: { back?: boolean; portrait?: boolean; missing?: CardFieldReport[]; problems?: CardFieldReport[]; mismatch?: boolean } = {}
): RenderedCard {
  const back = opts.back ?? true;
  return {
    learnerId: `L${n}`,
    profileId: `P${n}`,
    templateId: 'T',
    templateName: 'Learners',
    name: `Learner ${n}`,
    rollNumber: `R${n}`,
    frontDataUrl: `data:image/png;base64,F${n}`,
    backDataUrl: back ? `data:image/png;base64,B${n}` : null,
    frontRotation: opts.portrait ? -90 : 0,
    backRotation: opts.portrait ? -90 : 0,
    fields: [],
    missing: opts.missing ?? [],
    problems: opts.problems ?? [],
    templateInstitutionId: 'I1',
    learnerInstitutionId: 'I1',
    institutionName: 'JKKN',
    institutionMismatch: opts.mismatch ?? false
  };
}

/** Reading order of a page as "L1:front", "L1:back", … */
const reading = (page: SheetPage) =>
  pageSequence(page).map(({ slot }) => `${slot.card.learnerId}:${slot.side}`);

describe('student-wise (pairs) layout — the default', () => {
  it('reads Student 1 front, Student 1 back, Student 2 front, Student 2 back …', () => {
    const cards = [card(1), card(2), card(3)];
    const pages = buildSheetPages(cards);
    expect(pages).toHaveLength(1);
    expect(pages[0].side).toBe('pairs');
    expect(reading(pages[0])).toEqual([
      'L1:front',
      'L1:back',
      'L2:front',
      'L2:back',
      'L3:front',
      'L3:back'
    ]);
  });

  it('puts one learner per row: front in column 0, back in column 1', () => {
    const pages = buildSheetPages([card(1), card(2)]);
    const geo = pages[0].geometry;
    expect(geo.cols).toBe(2);
    const seq = pageSequence(pages[0]);
    expect(seq[0].index).toBe(0); // row 0 col 0
    expect(seq[1].index).toBe(1); // row 0 col 1
    expect(seq[2].index).toBe(2); // row 1 col 0
    expect(seq[3].index).toBe(3); // row 1 col 1
  });

  it('landscape cards: 5 learners per sheet; the 6th starts sheet 2 in order', () => {
    const cards = Array.from({ length: 7 }, (_, i) => card(i + 1));
    const pages = buildSheetPages(cards);
    expect(pages).toHaveLength(2);
    expect(reading(pages[0])).toHaveLength(10);
    expect(reading(pages[1])).toEqual(['L6:front', 'L6:back', 'L7:front', 'L7:back']);
    expect(pages.map((p) => p.number)).toEqual([1, 2]);
  });

  it('portrait cards: 3 learners per sheet, still front | back per row', () => {
    const cards = Array.from({ length: 4 }, (_, i) => card(i + 1, { portrait: true }));
    const pages = buildSheetPages(cards);
    expect(pages).toHaveLength(2);
    expect(pages[0].geometry.portrait).toBe(true);
    expect(pages[0].geometry.rows).toBe(3);
    expect(reading(pages[0])).toEqual(['L1:front', 'L1:back', 'L2:front', 'L2:back', 'L3:front', 'L3:back']);
    expect(reading(pages[1])).toEqual(['L4:front', 'L4:back']);
  });

  it('falls back to a plain fronts grid (learner order kept) when no template has a back', () => {
    const cards = Array.from({ length: 12 }, (_, i) => card(i + 1, { back: false }));
    const pages = buildSheetPages(cards);
    expect(pages[0].side).toBe('front');
    expect(reading(pages[0])).toEqual(Array.from({ length: 10 }, (_, i) => `L${i + 1}:front`));
    expect(reading(pages[1])).toEqual(['L11:front', 'L12:front']);
  });

  it('a learner whose template has no back still keeps their row (back slot empty)', () => {
    const pages = buildSheetPages([card(1), card(2, { back: false }), card(3)]);
    expect(reading(pages[0])).toEqual(['L1:front', 'L1:back', 'L2:front', 'L3:front', 'L3:back']);
    // L2's back cell (index 3) is empty; L3 starts row 2 (index 4).
    expect(pages[0].slots[3]).toBeNull();
    expect(pages[0].slots[4]?.card.learnerId).toBe('L3');
  });
});

describe('duplex layout — fronts sheet, then mirrored backs sheet', () => {
  it('sheet N is fronts in order, sheet N+1 the same learners mirrored by column (long-edge)', () => {
    const pages = buildSheetPages([card(1), card(2), card(3)], { mode: 'duplex', flip: 'long' });
    expect(pages.map((p) => p.side)).toEqual(['front', 'back']);
    expect(reading(pages[0])).toEqual(['L1:front', 'L2:front', 'L3:front']);
    // 2 columns: L1 (col 0) ↔ L2 (col 1) swap; L3 (row 1 col 0) → row 1 col 1.
    const backs = pages[1].slots;
    expect(backs[0]?.card.learnerId).toBe('L2');
    expect(backs[1]?.card.learnerId).toBe('L1');
    expect(backs[3]?.card.learnerId).toBe('L3');
  });

  it('short-edge flip mirrors rows and turns the back 180°', () => {
    const pages = buildSheetPages([card(1)], { mode: 'duplex', flip: 'short' });
    const backs = pages[1].slots;
    const geo = pages[1].geometry;
    const lastRowFirstCol = (geo.rows - 1) * geo.cols;
    expect(backs[lastRowFirstCol]?.card.learnerId).toBe('L1');
    expect(backs[lastRowFirstCol]?.rotation).toBe(180);
  });

  it('the original flip-only argument still means duplex (back-compat)', () => {
    const pages = buildSheetPages([card(1)], 'long');
    expect(pages.map((p) => p.side)).toEqual(['front', 'back']);
  });
});

describe('geometry', () => {
  it('every grid fits inside A4 with positive margins', () => {
    for (const geo of [sheetGeometry(false), sheetGeometry(true), pairsGeometry(false), pairsGeometry(true)]) {
      expect(geo.padX).toBeGreaterThan(0);
      expect(geo.padY).toBeGreaterThan(0);
      const w = geo.cols * geo.cellW + (geo.cols - 1) * geo.colGap + 2 * geo.padX;
      const h = geo.rows * geo.cellH + (geo.rows - 1) * geo.rowGap + 2 * geo.padY;
      expect(w).toBeCloseTo(SHEET_W_MM, 6);
      expect(h).toBeCloseTo(SHEET_H_MM, 6);
    }
  });

  it('slotOrigin walks the grid row-major in mm', () => {
    const geo = pairsGeometry(false);
    expect(slotOrigin(geo, 0)).toEqual({ x: geo.padX, y: geo.padY });
    expect(slotOrigin(geo, 1)).toEqual({ x: geo.padX + geo.cellW + geo.colGap, y: geo.padY });
    expect(slotOrigin(geo, 2)).toEqual({ x: geo.padX, y: geo.padY + geo.cellH + geo.rowGap });
  });
});

describe('issue annotations — identical on preview, print and PDF', () => {
  const missingPhoto = field('photo', 'front', null);
  const badAddress = field('address', 'back', '12 Main St, 636005 636006', 'Two different PIN codes (636005 / 636006)');

  it('flags a card with a blank field, a wrong value, or the wrong template', () => {
    expect(isFlagged(card(1))).toBe(false);
    expect(isFlagged(card(1, { missing: [missingPhoto] }))).toBe(true);
    expect(isFlagged(card(1, { problems: [badAddress] }))).toBe(true);
    expect(isFlagged(card(1, { mismatch: true }))).toBe(true);
  });

  it('captions name the fields on THAT side only; the template warning rides on the front', () => {
    const c = card(1, { missing: [missingPhoto], problems: [badAddress], mismatch: true });
    const pages = buildSheetPages([c]);
    const [front, back] = pageSequence(pages[0]).map(({ slot }) => slot);
    expect(slotCaption(front)).toBe('Wrong institution template. Missing: Photo');
    expect(slotCaption(back)).toBe('Check: Address (Two different PIN codes (636005 / 636006))');
    expect(slotCaption({ ...front, card: card(1) })).toBe('');
  });

  it('the print document carries the red frame and caption for flagged cards only', () => {
    const html = buildPrintDocument(buildSheetPages([card(1), card(2, { missing: [missingPhoto] })]));
    expect(html.match(/class="idc-card idc-flagged"/g)).toHaveLength(2); // L2 front + back cells framed
    expect(html).toContain('Missing: Photo');
    expect(html).toContain('#dc2626');
  });

  it('every sheet but the last ends with a page break', () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(i + 1)); // 5 per sheet → 2 sheets
    const html = buildPrintDocument(buildSheetPages(cards));
    expect(html.match(/page-break-after:always/g)).toHaveLength(1);
  });

  it('a clean batch prints with no red anywhere', () => {
    const html = buildPrintDocument(buildSheetPages([card(1), card(2)]));
    expect(html).not.toContain('class="idc-card idc-flagged"');
    expect(html).not.toContain('Missing:');
  });
});
