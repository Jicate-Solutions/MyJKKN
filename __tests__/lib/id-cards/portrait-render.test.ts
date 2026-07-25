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
  staffId: null
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
    const tree = buildCardElement(baseInput()) as {
      props: { style: Record<string, unknown>; children: { props: { style: Record<string, unknown> } } };
    };
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

  it('team-member card: STAFF ID / DEPT / DESIG lines, no learner lines', () => {
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

  it('full-bleed portrait artwork suppresses the header band and paints 638x1014', () => {
    const bg = 'data:image/png;base64,Zm9v';
    const tree = buildCardElement(baseInput({ backgroundDataUrl: bg }));
    const text = collectText(tree).join(' | ');
    expect(text).not.toContain('JKKN College of Engineering'); // header gone
    expect(collectImgSrcs(tree)).toContain(bg);
    const bgStyle = collectStyles(tree).find((s) => s.objectFit === 'cover');
    expect(bgStyle.width).toBe(PORTRAIT_WIDTH);
    expect(bgStyle.height).toBe(PORTRAIT_HEIGHT);
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
