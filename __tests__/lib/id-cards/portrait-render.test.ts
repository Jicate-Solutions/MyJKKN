// __tests__/lib/id-cards/portrait-render.test.ts
// Portrait-engine coverage (dark, template-opt-in — 2026-07-25):
//   • orientation parsing (exact lowercase opt-in strings only)
//   • landscape-unchanged guarantee (absent orientation = current behavior)
//   • new render-data derivations (study period, staff id, dept)
//   • portrait element-tree spot checks (rotation wrapper + default design)

import { describe, it, expect } from 'vitest';
import {
  parseFrontLayout,
  parseBackLayout,
  buildCardElement,
  CARD_WIDTH,
  CARD_HEIGHT,
  PORTRAIT_WIDTH,
  PORTRAIT_HEIGHT,
  type CardRenderInput
} from '@/lib/id-cards/render-card';
import {
  CARD_FIELDS,
  deriveStudyPeriodLabel,
  parseFieldMappings,
  imageDimensionsFromDataUrl,
  coverPlacement,
  svgCoverImageDataUrl,
  type CardPersonData
} from '@/lib/id-cards/render-data';

// ─────────────────────────────────────────────────────────────────────────────
// Tree-walking helpers (self-contained — mirrors back-render.test.ts style)
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function collectText(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return out;
  }
  if (node.props) collectText(node.props.children, out);
  return out;
}

function collectImgSrcs(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectImgSrcs(child, out));
    return out;
  }
  if (node.type === 'img' && node.props?.src) out.push(node.props.src);
  if (node.props) collectImgSrcs(node.props.children, out);
  return out;
}

function collectStyles(node: any, out: any[] = []): any[] {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectStyles(child, out));
    return out;
  }
  if (node.props?.style) out.push(node.props.style);
  if (node.props) collectStyles(node.props.children, out);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const learner: CardPersonData = {
  kind: 'learner',
  fullName: 'Anitha Kumari',
  rollNumber: '21AI042',
  registerNumber: 'REG-9921',
  designation: null,
  courseName: 'B.Tech AI',
  departmentName: 'CSE',
  institutionName: 'JKKN College of Engineering',
  isSchool: false,
  qrValue: 'learner-uuid',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: 'B+',
  dateOfBirthLabel: '09 Nov 2001',
  guardianName: 'R. Kumar',
  guardianPhone: '9876543210',
  address: '12 Main Street, Komarapalayam',
  contactPhone: '9123456780',
  idCode: '21AI042',
  studyPeriod: '2025-2028',
  staffId: null,
  // Pre-existing omission, surfaced only now: the PR-scoped typecheck compiles
  // test files, but tsconfig.json excludes __tests__ so a local `tsc` never
  // reaches them. This fixture has been missing a required field since
  // courseEndDate was added, invisibly, because no PR had touched this file.
  courseEndDate: null
};

const teamMember: CardPersonData = {
  ...learner,
  kind: 'employee',
  fullName: 'Meena Devi',
  rollNumber: null,
  registerNumber: null,
  designation: 'Associate Professor',
  courseName: null,
  departmentName: 'Pharmacology',
  qrValue: 'profile-uuid',
  idCode: 'JK00417',
  studyPeriod: null,
  staffId: 'JK00417'
};

const QR_URL = 'data:image/png;base64,QQ==';

/** Minimal PNG data URL — valid header bytes only (dimension parsing needs no pixels). */
function pngDataUrl(width: number, height: number): string {
  const buf = Buffer.alloc(24);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach((b, i) => (buf[i] = b));
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Minimal JPEG data URL — SOI + APP0 + SOF0 header bytes. */
function jpegDataUrl(width: number, height: number): string {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0)]);
  const sof0 = Buffer.alloc(12);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(9, 2); // segment length
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function baseInput(overrides: Partial<CardRenderInput> = {}): CardRenderInput {
  return {
    person: learner,
    photoDataUrl: null,
    qrDataUrl: QR_URL,
    backgroundDataUrl: null,
    layout: { orientation: 'portrait' },
    mappings: [],
    validUntilLabel: '31 May 2027',
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientation parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('parseFrontLayout — orientation', () => {
  it('accepts the two exact opt-in strings and counts them as content', () => {
    expect(parseFrontLayout({ orientation: 'portrait' })).toEqual({ orientation: 'portrait' });
    expect(parseFrontLayout({ orientation: 'portrait-flipped' })).toEqual({
      orientation: 'portrait-flipped'
    });
  });

  it('ignores landscape/casing variants/junk — existing templates cannot opt in by accident', () => {
    expect(parseFrontLayout({ orientation: 'landscape' })).toBeNull();
    expect(parseFrontLayout({ orientation: 'PORTRAIT' })).toBeNull();
    expect(parseFrontLayout({ orientation: 'Portrait' })).toBeNull();
    expect(parseFrontLayout({ orientation: 42 })).toBeNull();
    expect(parseFrontLayout({ orientation: null })).toBeNull();
    expect(parseFrontLayout({ orientation: ['portrait'] })).toBeNull();
    const styled = parseFrontLayout({ orientation: 'landscape', background_color: '#ffffff' });
    expect(styled).not.toBeNull();
    expect(styled!.orientation).toBeUndefined();
  });

  it('portrait layouts clamp elements to PORTRAIT bounds (638 wide, 1014 tall)', () => {
    const layout = parseFrontLayout({
      orientation: 'portrait',
      elements: [
        { field: 'name_line_1', x: 700, y: 900 },
        { field: 'photo', x: 10, y: 40, width: 900, height: 1200 }
      ]
    });
    expect(layout!.elements).toHaveLength(2);
    const [name, photo] = layout!.elements!;
    expect(name.x).toBe(PORTRAIT_WIDTH); // 700 clamps to 638
    expect(name.y).toBe(900); // 900 is legal in portrait (≤ 1014)
    expect(photo.width).toBe(PORTRAIT_WIDTH); // 900 clamps to 638
    expect(photo.height).toBe(PORTRAIT_HEIGHT); // 1200 clamps to 1014
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Landscape-unchanged guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe('landscape behavior is unchanged when orientation is absent', () => {
  it('parseFrontLayout({}) is still null (the prod reality today)', () => {
    expect(parseFrontLayout({})).toBeNull();
    expect(parseFrontLayout(null)).toBeNull();
    expect(parseFrontLayout({ unknown_key: true })).toBeNull();
  });

  it('landscape elements still clamp to the LANDSCAPE canvas', () => {
    const layout = parseFrontLayout({
      elements: [{ field: 'name_line_1', x: 1200, y: 900 }]
    });
    expect(layout!.elements![0].x).toBe(CARD_WIDTH); // 1014
    expect(layout!.elements![0].y).toBe(CARD_HEIGHT); // 638 — NOT the portrait 1014
  });

  it('back-layout elements still clamp to the LANDSCAPE canvas (bounds param regression)', () => {
    const layout = parseBackLayout({
      elements: [{ field: 'blood_group', x: 1200, y: 900 }]
    });
    expect(layout!.elements![0].x).toBe(CARD_WIDTH);
    expect(layout!.elements![0].y).toBe(CARD_HEIGHT);
  });

  it('default landscape design carries no transform and keeps the 1014x638 root', () => {
    const tree = buildCardElement(baseInput({ layout: null }));
    const root = (tree as { props: { style: Record<string, unknown> } }).props.style;
    expect(root.width).toBe(CARD_WIDTH);
    expect(root.height).toBe(CARD_HEIGHT);
    expect(collectStyles(tree).some((s) => s.transform !== undefined)).toBe(false);
  });

  it('landscape photos keep objectFit cover + overflow-hidden frames (byte-identical guarantee)', () => {
    const photo = jpegDataUrl(1241, 1754);
    // Default landscape design.
    const defaultTree = buildCardElement(baseInput({ layout: null, photoDataUrl: photo }));
    const defaultStyles = collectStyles(defaultTree);
    expect(defaultStyles.some((s) => s.objectFit === 'cover')).toBe(true);
    expect(defaultStyles.some((s) => s.overflow === 'hidden')).toBe(true);
    expect(collectImgSrcs(defaultTree)).toContain(photo); // raw bitmap, no SVG wrapper
    // Landscape custom photo element.
    const layout = parseFrontLayout({
      elements: [{ field: 'photo', x: 40, y: 100, width: 300, height: 380 }]
    });
    const customTree = buildCardElement(baseInput({ layout, photoDataUrl: photo }));
    const customStyles = collectStyles(customTree);
    expect(customStyles.some((s) => s.objectFit === 'cover')).toBe(true);
    expect(customStyles.some((s) => s.overflow === 'hidden')).toBe(true);
    expect(collectImgSrcs(customTree)).toContain(photo);
  });

  it('landscape custom layout carries no transform and keeps the 1014x638 root', () => {
    const layout = parseFrontLayout({
      elements: [{ field: 'name_line_1', x: 400, y: 150 }]
    });
    const tree = buildCardElement(baseInput({ layout }));
    const root = (tree as { props: { style: Record<string, unknown> } }).props.style;
    expect(root.width).toBe(CARD_WIDTH);
    expect(root.height).toBe(CARD_HEIGHT);
    expect(collectStyles(tree).some((s) => s.transform !== undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New field derivations
// ─────────────────────────────────────────────────────────────────────────────

describe('deriveStudyPeriodLabel', () => {
  it('uses batch_name when it already is a YYYY-YYYY span (prod reality)', () => {
    expect(deriveStudyPeriodLabel({ batch_name: '2025-2028' })).toBe('2025-2028');
    expect(deriveStudyPeriodLabel({ batch_name: ' 2023 – 2026 ' })).toBe('2023-2026'); // en-dash + spaces normalize
  });

  it('falls back to start/end-date years when batch_name is not a span', () => {
    expect(
      deriveStudyPeriodLabel({
        batch_name: 'UG Batch 25',
        start_date: '2025-06-01',
        end_date: '2028-05-30'
      })
    ).toBe('2025-2028');
  });

  it('returns null rather than inventing a period (fail-soft)', () => {
    expect(deriveStudyPeriodLabel(null)).toBeNull();
    expect(deriveStudyPeriodLabel(undefined)).toBeNull();
    expect(deriveStudyPeriodLabel({})).toBeNull();
    expect(deriveStudyPeriodLabel({ batch_name: 'UGB25' })).toBeNull();
    expect(deriveStudyPeriodLabel({ start_date: '2025-06-01' })).toBeNull(); // one year only
    expect(deriveStudyPeriodLabel({ batch_name: '2025' })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rotation-safe photo geometry (satori mispaints objectFit / overflow clips
// under a transformed ancestor — the crop must happen inside an SVG wrapper)
// ─────────────────────────────────────────────────────────────────────────────

describe('imageDimensionsFromDataUrl', () => {
  it('parses PNG and JPEG headers without decoding pixels', () => {
    expect(imageDimensionsFromDataUrl(pngDataUrl(1203, 1600))).toEqual({
      width: 1203,
      height: 1600
    });
    expect(imageDimensionsFromDataUrl(jpegDataUrl(1241, 1754))).toEqual({
      width: 1241,
      height: 1754
    });
  });

  it('parses GIF and WebP (VP8X) headers', () => {
    const gif = Buffer.alloc(24);
    gif.write('GIF89a', 0, 'ascii');
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(240, 8);
    expect(imageDimensionsFromDataUrl(`data:image/gif;base64,${gif.toString('base64')}`)).toEqual(
      { width: 320, height: 240 }
    );
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8X', 12, 'ascii');
    webp.writeUIntLE(639, 24, 3); // width - 1
    webp.writeUIntLE(1013, 27, 3); // height - 1
    expect(imageDimensionsFromDataUrl(`data:image/webp;base64,${webp.toString('base64')}`)).toEqual(
      { width: 640, height: 1014 }
    );
  });

  it('returns null for junk, truncated bytes and non-data URLs (fail-soft)', () => {
    expect(imageDimensionsFromDataUrl('data:image/png;base64,QQ==')).toBeNull();
    expect(imageDimensionsFromDataUrl('data:text/plain;base64,QQ==')).toBeNull();
    expect(imageDimensionsFromDataUrl('https://example.com/x.png')).toBeNull();
    expect(imageDimensionsFromDataUrl('')).toBeNull();
    expect(imageDimensionsFromDataUrl('data:image/png;base64,not-base64!!!')).toBeNull();
  });
});

describe('coverPlacement', () => {
  it('covers both axes and centers the overflow (object-fit cover semantics)', () => {
    // 1203x1600 into 292x372: the box is relatively WIDER than the bitmap
    // (0.785 vs 0.752 aspect) so the width axis rules; height overflows and
    // the vertical spill is centered.
    const p = coverPlacement(292, 372, 1203, 1600)!;
    expect(p.width).toBe(292);
    expect(p.height).toBe(389); // ceil(1600 * 292/1203)
    expect(p.left).toBe(0);
    expect(p.top).toBeLessThan(0);
    expect(p.top).toBe(Math.round((372 - p.height) / 2));
    // And the transposed case: box relatively TALLER → height rules.
    const q = coverPlacement(292, 372, 1600, 1203)!;
    expect(q.height).toBe(372);
    expect(q.width).toBeGreaterThan(292);
    expect(q.top).toBe(0);
    expect(q.left).toBeLessThan(0);
  });

  it('is the identity for an exact-fit bitmap and never leaves a seam', () => {
    expect(coverPlacement(300, 380, 300, 380)).toEqual({ left: 0, top: 0, width: 300, height: 380 });
    const p = coverPlacement(300, 380, 999, 1266)!; // near-exact aspect
    expect(p.width).toBeGreaterThanOrEqual(300);
    expect(p.height).toBeGreaterThanOrEqual(380);
  });

  it('rejects degenerate boxes and bitmaps', () => {
    expect(coverPlacement(0, 380, 100, 100)).toBeNull();
    expect(coverPlacement(300, 380, 0, 100)).toBeNull();
    expect(coverPlacement(300, -1, 100, 100)).toBeNull();
  });
});

describe('svgCoverImageDataUrl', () => {
  const decode = (url: string) => Buffer.from(url.split(',')[1], 'base64').toString('utf8');

  it('wraps the bitmap in an exact-size SVG viewport with the cover placement', () => {
    const photo = pngDataUrl(1203, 1600);
    const url = svgCoverImageDataUrl(photo, 292, 372)!;
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = decode(url);
    expect(svg).toContain('width="292" height="372"');
    expect(svg).toContain('viewBox="0 0 292 372"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain(photo); // bitmap rides inside, untouched
    expect(svg).not.toContain('clipPath'); // no radius requested
  });

  it('rounds corners via an SVG clipPath when cornerRadius is given', () => {
    const svg = decode(svgCoverImageDataUrl(pngDataUrl(600, 800), 292, 372, 10)!);
    expect(svg).toContain('<clipPath id="r">');
    expect(svg).toContain('rx="10"');
    expect(svg).toContain('clip-path="url(#r)"');
  });

  it('returns null when the bitmap header cannot be parsed (caller falls back)', () => {
    expect(svgCoverImageDataUrl('data:image/png;base64,QQ==', 292, 372)).toBeNull();
    expect(svgCoverImageDataUrl('', 292, 372)).toBeNull();
  });
});

describe('CARD_FIELDS — portrait-engine additions', () => {
  it('includes study_period and staff_id so layouts and mappings can reference them', () => {
    expect(CARD_FIELDS).toContain('study_period');
    expect(CARD_FIELDS).toContain('staff_id');
  });

  it('parseFieldMappings accepts the new card fields', () => {
    const parsed = parseFieldMappings([
      { card_field: 'study_period', db_column: 'batches.batch_name' },
      { card_field: 'staff_id', db_column: 'staff.staff_id' }
    ]);
    expect(parsed).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Portrait element-tree spot checks
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCardElement — portrait rotation wrapper', () => {
  it('keeps the OUTPUT canvas 1014x638 and rotates one inner 638x1014 wrapper (+90°)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = buildCardElement(baseInput()) as any;
    expect(tree.props.style.width).toBe(CARD_WIDTH);
    expect(tree.props.style.height).toBe(CARD_HEIGHT);
    const wrapper = tree.props.children.props.style;
    expect(wrapper.width).toBe(PORTRAIT_WIDTH);
    expect(wrapper.height).toBe(PORTRAIT_HEIGHT);
    expect(wrapper.left).toBe((CARD_WIDTH - PORTRAIT_WIDTH) / 2); // 188
    expect(wrapper.top).toBe((CARD_HEIGHT - PORTRAIT_HEIGHT) / 2); // -188
    expect(wrapper.transform).toBe('rotate(90deg)');
    // Exactly ONE transform in the whole tree — no per-element rotation.
    const transforms = collectStyles(tree).filter((s) => s.transform !== undefined);
    expect(transforms).toHaveLength(1);
  });

  it('portrait-flipped only flips the rotation direction (−90°)', () => {
    const cw = buildCardElement(baseInput());
    const ccw = buildCardElement(baseInput({ layout: { orientation: 'portrait-flipped' } }));
    const transformOf = (tree: unknown) =>
      collectStyles(tree).find((s) => s.transform !== undefined)!.transform;
    expect(transformOf(cw)).toBe('rotate(90deg)');
    expect(transformOf(ccw)).toBe('rotate(-90deg)');
    expect(collectText(cw).join(' | ')).toBe(collectText(ccw).join(' | '));
  });
});

describe('buildCardElement — portrait default design', () => {
  it('learner card: caps red name, ROLL NO / COURSE / YEAR lines, VALID UPTO, QR', () => {
    const tree = buildCardElement(baseInput());
    const text = collectText(tree).join(' | ');
    expect(text).toContain('ANITHA KUMARI'); // caps
    expect(text).toContain('ROLL NO');
    expect(text).toContain('21AI042');
    expect(text).toContain('COURSE');
    expect(text).toContain('B.Tech AI');
    expect(text).toContain('YEAR');
    expect(text).toContain('2025-2028');
    expect(text).toContain('VALID UPTO');
    expect(text).toContain('31 May 2027');
    expect(text).toContain('JKKN College of Engineering');
    expect(collectImgSrcs(tree)).toContain(QR_URL);
    const nameStyle = collectStyles(tree).find((s) => s.color === '#c8102e');
    expect(nameStyle).toBeDefined();
    expect(nameStyle.fontWeight).toBe(800);
  });

  it('team-member card: identity lines present, learner lines absent', () => {
    const tree = buildCardElement(baseInput({ person: teamMember }));
    const text = collectText(tree).join(' | ');
    expect(text).toContain('MEENA DEVI');
    expect(text).toContain('STAFF ID');
    expect(text).toContain('JK00417');
    expect(text).toContain('DEPT');
    expect(text).toContain('Pharmacology');
    expect(text).toContain('DESIG');
    expect(text).toContain('Associate Professor');
    expect(text).not.toContain('ROLL NO');
    expect(text).not.toContain('COURSE');
    expect(text).not.toContain('YEAR');
  });

  it('omits the YEAR line when studyPeriod is null (fail-soft — half of prod has no batch)', () => {
    const tree = buildCardElement(baseInput({ person: { ...learner, studyPeriod: null } }));
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('YEAR');
    expect(text).toContain('ROLL NO'); // other lines remain
  });

  it('renders the photo rotation-safe: SVG-wrapped, content-box sized, no objectFit/overflow around it', () => {
    const photo = jpegDataUrl(1241, 1754);
    const tree = buildCardElement(baseInput({ photoDataUrl: photo }));
    const styles = collectStyles(tree);
    expect(styles.some((s) => s.objectFit !== undefined)).toBe(false);
    expect(styles.some((s) => s.overflow === 'hidden')).toBe(false);
    const svgSrc = collectImgSrcs(tree).find((s) => s.startsWith('data:image/svg+xml;base64,'));
    expect(svgSrc).toBeDefined();
    const svg = Buffer.from(svgSrc!.split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain('width="292" height="372"'); // 300x380 frame minus 4px border per side
    expect(svg).toContain('rx="10"'); // rounded inside the SVG, not via satori overflow
  });

  it('keeps the (plain-div) initials placeholder inside the overflow-hidden frame when no photo exists', () => {
    const tree = buildCardElement(baseInput({ photoDataUrl: null }));
    const styles = collectStyles(tree);
    // Placeholder path may clip (divs are safe under rotation — proven live).
    expect(styles.some((s) => s.overflow === 'hidden')).toBe(true);
    expect(collectText(tree).join(' | ')).toContain('AK'); // initials
  });

  it('full-bleed portrait artwork suppresses the header band and paints 638x1014 rotation-safe', () => {
    const bg = pngDataUrl(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    const tree = buildCardElement(baseInput({ backgroundDataUrl: bg }));
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('JKKN College of Engineering'); // header gone
    // Background rides the SVG wrapper too — no objectFit under rotation.
    expect(collectStyles(tree).some((s) => s.objectFit !== undefined)).toBe(false);
    const svgSrc = collectImgSrcs(tree).find((s) => s.startsWith('data:image/svg+xml;base64,'));
    expect(svgSrc).toBeDefined();
    const svg = Buffer.from(svgSrc!.split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain(bg);
    expect(svg).toContain(`width="${PORTRAIT_WIDTH}" height="${PORTRAIT_HEIGHT}"`);
  });
});

describe('buildCardElement — portrait custom elements', () => {
  it('renders elements in portrait coordinates inside the rotated wrapper', () => {
    const layout = parseFrontLayout({
      orientation: 'portrait',
      elements: [
        { field: 'name_line_1', x: 40, y: 900, font_size: 30 },
        { field: 'study_period', x: 40, y: 950 },
        { field: 'static_text', text: 'ID CARD', x: 40, y: 20 }
      ]
    });
    const tree = buildCardElement(baseInput({ layout }));
    const text = collectText(tree).join(' | ');
    expect(text).toContain('Anitha Kumari'); // custom path: no forced caps
    expect(text).toContain('2025-2028'); // study_period element resolves
    expect(text).toContain('ID CARD');
    // Inner content canvas is portrait-dimensioned; wrapper still rotates it.
    const styles = collectStyles(tree);
    const content = styles.find(
      (s) => s.width === PORTRAIT_WIDTH && s.height === PORTRAIT_HEIGHT && s.position === 'relative'
    );
    expect(content).toBeDefined();
    expect(styles.filter((s) => s.transform !== undefined)).toHaveLength(1);
    // The y=900 element kept its portrait coordinate (landscape would clamp to 638).
    const positioned = styles.find((s) => s.top === 900);
    expect(positioned).toBeDefined();
  });

  it('rotation-safe photos: the portrait photo element renders an SVG-wrapped plain img, no objectFit, no overflow clip', () => {
    const photo = pngDataUrl(1200, 1600);
    const layout = parseFrontLayout({
      orientation: 'portrait',
      elements: [{ field: 'photo', x: 201, y: 165, width: 300, height: 380 }] // Lane H's repro
    });
    const tree = buildCardElement(baseInput({ layout, photoDataUrl: photo }));
    const styles = collectStyles(tree);
    // satori mispaints objectFit AND overflow-clipped bitmaps under the
    // rotated wrapper — neither may appear anywhere in a portrait tree.
    expect(styles.some((s) => s.objectFit !== undefined)).toBe(false);
    expect(styles.some((s) => s.overflow === 'hidden')).toBe(false);
    const srcs = collectImgSrcs(tree);
    const photoImg = srcs.find((s) => s.startsWith('data:image/svg+xml;base64,'));
    expect(photoImg).toBeDefined();
    // The wrapper crops to the frame's content box (border is 4px per side).
    const svg = Buffer.from(photoImg!.split(',')[1], 'base64').toString('utf8');
    expect(svg).toContain('width="292"');
    expect(svg).toContain('height="372"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain(photo);
  });

  it('staff_id element resolves for team members and is empty (dropped) for learners', () => {
    const layout = parseFrontLayout({
      orientation: 'portrait',
      elements: [{ field: 'staff_id', x: 40, y: 500 }]
    });
    const staffTree = buildCardElement(baseInput({ person: teamMember, layout }));
    expect(collectText(staffTree).join(' | ')).toContain('JK00417');
    const learnerTree = buildCardElement(baseInput({ layout }));
    expect(collectText(learnerTree).join(' | ')).not.toContain('JK00417');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// School vocabulary (2026-09-03)
// ─────────────────────────────────────────────────────────────────────────────
//
// Matric HSS and Nattraja Vidhyalya are institutions.entity_type = 'school'.
// Their "programme" IS a class — 552 Matric learners sit in Standard 11/12 —
// so a card printing "COURSE: Standard 12" read as nonsense. Every other screen
// in the app already swaps Program → Class and Department → Wing through
// lib/utils/school-label-adapter.ts; the card renderer was the one surface that
// never called it (grep: 10 call sites, none under lib/id-cards/).
//
// Only the LABEL changes. The value is correct either way.

describe('school cards use school vocabulary, not college vocabulary', () => {
  const schoolLearner: CardPersonData = {
    ...learner,
    isSchool: true,
    courseName: 'Standard 12',
    departmentName: 'Science',
    institutionName: 'JKKN Matric Higher Secondary School'
  };

  const textFor = (person: CardPersonData) =>
    collectText(buildCardElement(baseInput({ person }))).join(' | ');

  it('prints CLASS, never COURSE, for a school learner', () => {
    const text = textFor(schoolLearner);
    expect(text).toContain('CLASS');
    expect(text).not.toContain('COURSE');
    // The value is unchanged — this was never a data problem.
    expect(text).toContain('Standard 12');
  });

  it('prints WING, never DEPT, for a school TEAM MEMBER', () => {
    // DEPT lives in the team-member branch only — a learner card never carries
    // it, which is why the school learner above cannot exercise this label.
    const schoolTeacher: CardPersonData = {
      ...teamMember,
      isSchool: true,
      departmentName: 'Science',
      institutionName: 'JKKN Matric Higher Secondary School'
    };
    const text = textFor(schoolTeacher);
    expect(text).toContain('WING');
    expect(text).not.toContain('DEPT');
  });

  it('leaves a college card exactly as it was', () => {
    // Opposite control: 8 of 10 institutions are colleges and must not move.
    const text = textFor(learner);
    expect(text).toContain('COURSE');
    expect(text).not.toContain('CLASS');

    // …and a college team member keeps DEPT.
    const collegeText = textFor(teamMember);
    expect(collegeText).toContain('DEPT');
    expect(collegeText).not.toContain('WING');
  });
});
