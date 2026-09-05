// __tests__/lib/id-cards/back-render.test.ts
// Back-side (DARK) coverage: Code 39 encoder, parseBackLayout defenses,
// buildBackElement element-tree assertions.

import { describe, it, expect } from 'vitest';
import {
  CODE39_PATTERNS,
  normalizeCode39Value,
  encodeCode39,
  makeCode39SvgDataUrl
} from '@/lib/id-cards/barcode';
import {
  parseBackLayout,
  buildBackElement,
  type BackRenderInput
} from '@/lib/id-cards/render-card';
import { formatDateLabel, type CardPersonData } from '@/lib/id-cards/render-data';

// ─────────────────────────────────────────────────────────────────────────────
// Code 39 encoder
// ─────────────────────────────────────────────────────────────────────────────

function decodeSvg(dataUrl: string): string {
  const base64 = dataUrl.replace('data:image/svg+xml;base64,', '');
  return Buffer.from(base64, 'base64').toString('utf8');
}

describe('CODE39_PATTERNS table', () => {
  it('holds known standard encodings', () => {
    // Spot-checks against the published Code 39 table
    // (bar/space interleave, n = narrow, w = wide).
    expect(CODE39_PATTERNS['A']).toBe('wnnnnwnnw');
    expect(CODE39_PATTERNS['0']).toBe('nnnwwnwnn');
    expect(CODE39_PATTERNS['1']).toBe('wnnwnnnnw');
    expect(CODE39_PATTERNS['Z']).toBe('nwwnwnnnn');
    expect(CODE39_PATTERNS['-']).toBe('nwnnnnwnw');
    expect(CODE39_PATTERNS['*']).toBe('nwnnwnwnn');
  });

  it('every pattern is 9 elements with exactly 3 wide', () => {
    for (const [char, pattern] of Object.entries(CODE39_PATTERNS)) {
      expect(pattern, char).toHaveLength(9);
      expect(pattern.split('').filter((c) => c === 'w'), char).toHaveLength(3);
      expect(pattern.replace(/[nw]/g, ''), char).toBe('');
    }
  });
});

describe('normalizeCode39Value / encodeCode39', () => {
  it('uppercases and trims; frames with start/stop asterisks', () => {
    expect(normalizeCode39Value('  ab-12 ')).toBe('AB-12');
    const encoded = encodeCode39('a1');
    expect(encoded).not.toBeNull();
    expect(encoded).toHaveLength(4); // * A 1 *
    expect(encoded![0]).toBe(CODE39_PATTERNS['*']);
    expect(encoded![1]).toBe(CODE39_PATTERNS['A']);
    expect(encoded![2]).toBe(CODE39_PATTERNS['1']);
    expect(encoded![3]).toBe(CODE39_PATTERNS['*']);
  });

  it('rejects empty, over-long, asterisk-bearing and unencodable input', () => {
    expect(normalizeCode39Value('')).toBeNull();
    expect(normalizeCode39Value('   ')).toBeNull();
    expect(normalizeCode39Value(null)).toBeNull();
    expect(normalizeCode39Value(undefined)).toBeNull();
    expect(normalizeCode39Value('X'.repeat(33))).toBeNull();
    expect(normalizeCode39Value('AB*CD')).toBeNull();
    expect(normalizeCode39Value('ROLL#1')).toBeNull();
    expect(normalizeCode39Value('தமிழ்')).toBeNull();
    expect(encodeCode39('ROLL#1')).toBeNull();
  });
});

describe('makeCode39SvgDataUrl', () => {
  it('returns a base64 SVG data URL with one bar rect per dark bar', () => {
    const url = makeCode39SvgDataUrl('AB-12');
    expect(url).not.toBeNull();
    expect(url!.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = decodeSvg(url!);
    expect(svg).toContain('<svg');
    // 5 bars per character × (5 chars + start + stop) + 1 background rect.
    const rects = svg.match(/<rect /g) ?? [];
    expect(rects).toHaveLength(5 * 7 + 1);
  });

  it('includes the human-readable value by default, omits it when showText:false', () => {
    const withText = decodeSvg(makeCode39SvgDataUrl('AB12')!);
    expect(withText).toContain('<text');
    expect(withText).toContain('AB12');
    const without = decodeSvg(makeCode39SvgDataUrl('AB12', { showText: false })!);
    expect(without).not.toContain('<text');
  });

  it('lowercase input encodes identically to uppercase', () => {
    expect(makeCode39SvgDataUrl('ab12')).toBe(makeCode39SvgDataUrl('AB12'));
  });

  it('height and scale change the SVG dimensions', () => {
    const small = decodeSvg(makeCode39SvgDataUrl('A', { height: 40, scale: 1, showText: false })!);
    const large = decodeSvg(makeCode39SvgDataUrl('A', { height: 200, scale: 4, showText: false })!);
    expect(small).toContain('height="40"');
    expect(large).toContain('height="200"');
    const widthOf = (svg: string) => Number(/width="(\d+)"/.exec(svg)![1]);
    expect(widthOf(large)).toBeGreaterThan(widthOf(small));
  });

  it('returns null for unencodable values (card renders without a barcode)', () => {
    expect(makeCode39SvgDataUrl('BAD#VALUE')).toBeNull();
    expect(makeCode39SvgDataUrl('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatDateLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('formatDateLabel', () => {
  it('formats ISO prefixes and passes non-ISO strings through as stored', () => {
    expect(formatDateLabel('2001-11-09')).toBe('09 Nov 2001');
    expect(formatDateLabel('2006-06-12T00:00:00')).toBe('12 Jun 2006');
    expect(formatDateLabel('+042607-01')).toBe('+042607-01'); // prod junk value — printed as stored
    expect(formatDateLabel('2001-13-09')).toBe('2001-13-09'); // invalid month → as stored
    expect(formatDateLabel(null)).toBe('');
    expect(formatDateLabel('  ')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseBackLayout
// ─────────────────────────────────────────────────────────────────────────────

describe('parseBackLayout', () => {
  it('returns null only for non-object junk; {} is a valid enabled layout', () => {
    expect(parseBackLayout(null)).toBeNull();
    expect(parseBackLayout(undefined)).toBeNull();
    expect(parseBackLayout([])).toBeNull();
    expect(parseBackLayout('{}')).toBeNull();
    expect(parseBackLayout(42)).toBeNull();
    // {} = back enabled with the default design (unlike parseFrontLayout).
    const empty = parseBackLayout({});
    expect(empty).not.toBeNull();
    expect(empty!.elements).toBeUndefined();
    expect(empty!.footer_text).toBeUndefined();
  });

  it('parses booleans, footer_text and colors defensively', () => {
    const layout = parseBackLayout({
      show_blood_group: false,
      show_barcode: true,
      show_dob: 'yes', // non-boolean → ignored
      footer_text: '  ERODE, TAMIL NADU  ',
      background_color: '#fbfbee',
      unknown_key: 'ignored'
    });
    expect(layout!.show_blood_group).toBe(false);
    expect(layout!.show_barcode).toBe(true);
    expect(layout!.show_dob).toBeUndefined();
    expect(layout!.footer_text).toBe('ERODE, TAMIL NADU');
    expect(layout!.background_color).toBe('#fbfbee');
    expect(parseBackLayout({ background_color: 'url(javascript:x)' })!.background_color).toBeUndefined();
    expect(parseBackLayout({ footer_text: '   ' })!.footer_text).toBeUndefined();
  });

  it('accepts https background_image shapes only (route enforces the bucket allowlist)', () => {
    const good = parseBackLayout({
      background_image:
        ' https://example.supabase.co/storage/v1/object/public/id-card-assets/back-backgrounds/t1/a.png '
    });
    expect(good!.background_image).toBe(
      'https://example.supabase.co/storage/v1/object/public/id-card-assets/back-backgrounds/t1/a.png'
    );
    expect(parseBackLayout({ background_image: 'http://insecure/x.png' })!.background_image).toBeUndefined();
    expect(parseBackLayout({ background_image: 'javascript:alert(1)' })!.background_image).toBeUndefined();
    expect(parseBackLayout({ background_image: 42 })!.background_image).toBeUndefined();
  });

  it('parses elements with the back alphabet; photo/qr_code and malformed entries drop', () => {
    const layout = parseBackLayout({
      elements: [
        { field: 'blood_group', x: 40, y: 40 },
        { field: 'barcode', x: 300, y: 400, width: 400, height: 90 },
        { field: 'static_text', text: 'www.jkkn.ac.in', x: 20, y: 560 },
        { field: 'photo', x: 0, y: 0 }, // front-only field → dropped
        { field: 'qr_code', x: 0, y: 0 }, // front-only field → dropped
        { field: 'blood_group', x: 'NaN', y: 10 }, // bad coords → dropped
        { field: 'guardian', x: -20, y: 99999, font_size: 999 } // clamped
      ]
    });
    expect(layout!.elements).toHaveLength(4);
    const fields = layout!.elements!.map((e) => e.field);
    expect(fields).toEqual(['blood_group', 'barcode', 'static_text', 'guardian']);
    const guardian = layout!.elements![3];
    expect(guardian.x).toBe(0);
    expect(guardian.y).toBe(638);
    expect(guardian.font_size).toBe(120);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildBackElement — element-tree assertions
// ─────────────────────────────────────────────────────────────────────────────

const person: CardPersonData = {
  kind: 'learner',
  fullName: 'Anitha Kumari',
  rollNumber: '21AI042',
  registerNumber: 'REG-9921',
  designation: null,
  courseName: 'B.Tech AI',
  departmentName: 'CSE',
  institutionName: 'JKKN College of Engineering',
  // Completed 2026-09-03: isSchool is new; studyPeriod / staffId /
  // courseEndDate were missing since they were added to CardPersonData —
  // invisible because tsconfig excludes __tests__ from a local tsc run.
  isSchool: false,
  studyPeriod: null,
  staffId: null,
  courseEndDate: null,
  qrValue: 'learner-uuid',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: 'B+',
  dateOfBirthLabel: '09 Nov 2001',
  guardianName: 'R. Kumar',
  guardianPhone: '9876543210',
  address: '12 Main Street, Komarapalayam, Namakkal, Tamil Nadu, 638183',
  contactPhone: '9123456780',
  idCode: '21AI042'
};

const BARCODE_URL = makeCode39SvgDataUrl('21AI042', { showText: false })!;

function baseInput(overrides: Partial<BackRenderInput> = {}): BackRenderInput {
  return {
    person,
    backgroundDataUrl: null,
    barcodeDataUrl: BARCODE_URL,
    layout: {},
    mappings: [],
    validUntilLabel: '31 May 2027',
    ...overrides
  };
}

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
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('buildBackElement — default design', () => {
  it('renders blood group, DOB, guardian, address, contact, barcode + value, footer', () => {
    const tree = buildBackElement(baseInput());
    const text = collectText(tree).join(' | ');
    expect(text).toContain('BLOOD GROUP');
    expect(text).toContain('B+');
    expect(text).toContain('09 Nov 2001');
    expect(text).toContain('R. Kumar');
    expect(text).toContain('9876543210');
    expect(text).toContain('12 Main Street');
    expect(text).toContain('9123456780');
    expect(text).toContain('21AI042'); // human-readable barcode value (satori text)
    expect(text).toContain('TAMIL NADU, INDIA');
    expect(collectImgSrcs(tree)).toContain(BARCODE_URL);
  });

  it('omits blocks when data is missing (fail-soft, never invented)', () => {
    const sparse: CardPersonData = {
      ...person,
      bloodGroup: null,
      dateOfBirthLabel: null,
      guardianName: null,
      guardianPhone: null,
      address: null,
      contactPhone: null,
      idCode: null
    };
    const tree = buildBackElement(baseInput({ person: sparse, barcodeDataUrl: null }));
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('BLOOD GROUP');
    expect(text).not.toContain('DATE OF BIRTH');
    expect(text).not.toContain('GUARDIAN');
    expect(text).not.toContain('ADDRESS');
    expect(text).not.toContain('CONTACT');
    expect(collectImgSrcs(tree)).toHaveLength(0);
    expect(text).toContain('TAMIL NADU, INDIA'); // footer still there
  });

  it('honors show_* switches and footer_text override', () => {
    const tree = buildBackElement(
      baseInput({
        layout: {
          show_blood_group: false,
          show_barcode: false,
          footer_text: 'ERODE, TAMIL NADU'
        }
      })
    );
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('BLOOD GROUP');
    expect(collectImgSrcs(tree)).toHaveLength(0);
    expect(text).toContain('ERODE, TAMIL NADU');
    expect(text).not.toContain('TAMIL NADU, INDIA');
  });

  it('full-bleed artwork suppresses the footer band and paints the background image', () => {
    const bg = 'data:image/png;base64,QQ==';
    const tree = buildBackElement(baseInput({ backgroundDataUrl: bg }));
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('TAMIL NADU, INDIA');
    expect(collectImgSrcs(tree)).toContain(bg);
  });

  it('overlay elements ADD to the default design (static institution lines)', () => {
    const tree = buildBackElement(
      baseInput({
        layout: {
          elements: [
            { field: 'static_text', text: 'info@jkkn.ac.in', x: 40, y: 500 },
            { field: 'static_text', text: 'www.jkkn.ac.in', x: 40, y: 530 }
          ]
        }
      })
    );
    const text = collectText(tree).join(' | ');
    expect(text).toContain('info@jkkn.ac.in');
    expect(text).toContain('www.jkkn.ac.in');
    expect(text).toContain('BLOOD GROUP'); // default blocks remain
  });

  it('positioned barcode overlay renders the barcode image at the element spot', () => {
    const tree = buildBackElement(
      baseInput({
        layout: {
          show_barcode: false, // default centered barcode off…
          elements: [{ field: 'barcode', x: 300, y: 400, width: 400, height: 90 }]
        }
      })
    );
    expect(collectImgSrcs(tree)).toContain(BARCODE_URL); // …but overlay places it
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Portrait backs (2026-08-13) — a portrait FRONT needs a portrait BACK, or the
// two faces print at 90° to each other on the same piece of plastic.
// ─────────────────────────────────────────────────────────────────────────────

/** Collect every style object in the tree, for geometry assertions. */
function collectStyles(node: any, out: Record<string, any>[] = []): Record<string, any>[] {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectStyles(child, out));
    return out;
  }
  if (node.props?.style) out.push(node.props.style);
  if (node.props) collectStyles(node.props.children, out);
  return out;
}

describe('parseBackLayout — orientation', () => {
  it('accepts both portrait values and ignores anything else', () => {
    expect(parseBackLayout({ orientation: 'portrait' })?.orientation).toBe('portrait');
    expect(parseBackLayout({ orientation: 'portrait-flipped' })?.orientation).toBe(
      'portrait-flipped'
    );
    expect(parseBackLayout({ orientation: 'landscape' })?.orientation).toBeUndefined();
    expect(parseBackLayout({ orientation: 42 })?.orientation).toBeUndefined();
    expect(parseBackLayout({})?.orientation).toBeUndefined();
  });

  it('clamps portrait element coordinates to the PORTRAIT canvas, not landscape', () => {
    // y=900 is legal on a 638x1014 portrait canvas; the landscape clamp (638)
    // would squash it onto the bottom edge and silently lose the layout.
    const portrait = parseBackLayout({
      orientation: 'portrait',
      elements: [{ field: 'address', x: 40, y: 900 }]
    });
    expect(portrait?.elements?.[0]).toMatchObject({ x: 40, y: 900 });

    const landscape = parseBackLayout({
      elements: [{ field: 'address', x: 40, y: 900 }]
    });
    expect(landscape?.elements?.[0].y).toBe(638); // clamped, as before
  });

  it('clamps x to the portrait width (638), not the landscape width', () => {
    const portrait = parseBackLayout({
      orientation: 'portrait',
      elements: [{ field: 'address', x: 900, y: 100 }]
    });
    expect(portrait?.elements?.[0].x).toBe(638);
  });
});

describe('buildBackElement — portrait rotation', () => {
  it('composes at 638x1014 and rotates into the unchanged 1014x638 output', () => {
    const tree = buildBackElement(baseInput({ layout: { orientation: 'portrait' } }));
    const styles = collectStyles(tree);

    // Outer wrapper is still the printer's landscape canvas.
    expect(styles[0]).toMatchObject({ width: 1014, height: 638 });
    // Something in the tree composes in portrait and carries the rotation.
    expect(
      styles.some((s) => s.width === 638 && s.height === 1014 && s.transform === 'rotate(90deg)')
    ).toBe(true);
  });

  it('portrait-flipped rotates the other way (same artwork, opposite direction)', () => {
    const tree = buildBackElement(
      baseInput({ layout: { orientation: 'portrait-flipped' } })
    );
    expect(
      collectStyles(tree).some((s) => s.transform === 'rotate(-90deg)')
    ).toBe(true);
  });

  it('landscape backs are untouched — no rotation wrapper', () => {
    const tree = buildBackElement(baseInput({ layout: {} }));
    expect(collectStyles(tree).some((s) => typeof s.transform === 'string')).toBe(false);
  });

  it('still renders the same content when portrait (rotation is geometry only)', () => {
    const text = collectText(
      buildBackElement(baseInput({ layout: { orientation: 'portrait' } }))
    ).join(' | ');
    expect(text).toContain('BLOOD GROUP');
    expect(text).toContain('B+');
    expect(text).toContain('TAMIL NADU, INDIA');
  });
});
