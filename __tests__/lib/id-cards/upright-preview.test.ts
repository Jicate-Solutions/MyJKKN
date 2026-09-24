import { describe, expect, it } from 'vitest';
import {
  backCanvasSize,
  buildCardElement,
  CARD_HEIGHT,
  CARD_WIDTH,
  frontCanvasSize,
  parseFrontLayout,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  type CardRenderInput
} from '@/lib/id-cards/render-card';
import type { CardPersonData } from '@/lib/id-cards/render-data';

const person: CardPersonData = {
  kind: 'learner',
  fullName: 'DHIVYABHARATHI M',
  rollNumber: 'EC25011',
  registerNumber: null,
  designation: null,
  courseName: 'B.E. Electronics and Communication Engineering',
  departmentName: 'ECE',
  institutionName: 'JKKN College of Engineering and Technology',
  isSchool: false, qrId: null, academicYearLabel: null,
  qrValue: 'x',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: null,
  dateOfBirthLabel: null,
  guardianName: null,
  guardianPhone: null,
  address: null,
  contactPhone: null,
  idCode: 'EC25011',
  studyPeriod: '2025-2029',
  staffId: null,
  courseEndDate: null
};

const input = (layout: CardRenderInput['layout']): CardRenderInput => ({
  person,
  photoDataUrl: null,
  qrDataUrl: null,
  backgroundDataUrl: null,
  layout,
  mappings: [],
  validUntilLabel: '30 May 2029'
});

/** Does any node in the tree carry a rotate() transform? */
function hasRotation(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasRotation);
  const rec = node as Record<string, unknown>;
  const style = (rec.props as Record<string, unknown> | undefined)?.style as
    | Record<string, unknown>
    | undefined;
  if (style && typeof style.transform === 'string' && /rotate\(/.test(style.transform)) return true;
  return Object.values(rec).some(hasRotation);
}

describe('upright preview mode (portrait templates)', () => {
  const portrait = parseFrontLayout({ orientation: 'portrait' });

  it('printer path: portrait composition is rotated into the 1014x638 landscape canvas', () => {
    expect(hasRotation(buildCardElement(input(portrait)))).toBe(true);
    expect(frontCanvasSize(portrait)).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT });
  });

  it('upright preview: no rotation, and the canvas is the portrait 638x1014', () => {
    expect(hasRotation(buildCardElement(input(portrait), { upright: true }))).toBe(false);
    expect(frontCanvasSize(portrait, { upright: true })).toEqual({
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT
    });
    expect(backCanvasSize({ orientation: 'portrait' }, { upright: true })).toEqual({
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT
    });
  });

  it('landscape templates are unaffected by upright', () => {
    expect(hasRotation(buildCardElement(input(null), { upright: true }))).toBe(false);
    expect(frontCanvasSize(null, { upright: true })).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT });
    expect(backCanvasSize({}, { upright: true })).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT });
  });
});

describe('card-printer back flip (duplex long-edge)', () => {
  const rotationOf = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const n of node) { const r = rotationOf(n); if (r) return r; } return null; }
    const rec = node as { props?: Record<string, unknown> };
    const style = rec.props?.style as Record<string, unknown> | undefined;
    if (style && typeof style.transform === 'string' && /rotate\(/.test(style.transform)) return style.transform;
    return rotationOf(rec.props?.children);
  };
  const back = { orientation: 'portrait' as const };
  const input = { person, backgroundDataUrl: null, barcodeDataUrl: null, layout: back, mappings: [], validUntilLabel: 'x' };
  it('printer path rotates the back the OPPOSITE way to the preview path (180° apart)', async () => {
    const { buildBackElement } = await import('@/lib/id-cards/render-card');
    const preview = rotationOf(buildBackElement(input));
    const printer = rotationOf(buildBackElement(input, { printerBack: true }));
    expect(preview).not.toBeNull();
    expect(printer).not.toBeNull();
    expect(printer).not.toBe(preview);
  });
});
