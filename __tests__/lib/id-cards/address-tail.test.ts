// __tests__/lib/id-cards/address-tail.test.ts
//
// The card back must never print an address that has lost its district, state
// or PIN code — those are the parts that make it deliverable, and they sit at
// the END of the joined string (street → taluk → district → state → PIN).
//
// MEASURED ON PRODUCTION, 2026-08-14 (787 active Engineering learners):
//   • average joined address 83 chars, p90 111, p99 149, max 214
//   • 402 of 787 (51.1%) exceeded the generic 80-character element cap
//   • the district+state+PIN tail is at most 35 chars (p99 = 34)
//   • exactly 1 of 787 exceeds the 210-char budget the live Engineering box
//     yields, so 786 now render in full and the last one keeps its tail
//
// The live Engineering back (template ad0642ec-…) draws the address at
// x=44 y=316 width=556 font_size=18. Under the old generic cap the worst case
// printed "… VTC: BHAVANI, PO: SE…" — cut mid-word, with the district, the
// state and the PIN all gone.
//
// The fixtures below use that real geometry and that real address string.

import { describe, it, expect } from 'vitest';
import {
  buildBackElement,
  buildCardElement,
  type BackLayout,
  type BackLayoutElement,
  type BackRenderInput,
  type CardRenderInput
} from '@/lib/id-cards/render-card';
import {
  CARD_FIELDS,
  truncateForCard,
  truncateAddressForCard,
  ADDRESS_TAIL_CHARS,
  type CardPersonData
} from '@/lib/id-cards/render-data';

// The real production record (learners_profiles 66670340-…, MANIKANDAN A).
// Note the junk it carries: a stray reference number, a MOBILE number and a
// SECOND, contradictory PIN (608501 vs the structured 638501). Cleaning that
// up is a different job — this file only asserts the card degrades sensibly.
const WORST_ADDRESS =
  'NO 2/124, KOOTHADIYUR, A.SEMPULICHAMPALAYAM, BHAVANITALUK, VTC: BHAVANI, ' +
  'PO: SEMBULICHAMPALAYAM, DISTRICT: ERODE, STATE: TAMIL NADU, 108126636 ' +
  'PIN CODE: 608501 MOBILE: 9345864573, BHAVANI, ERODE, TAMIL NADU, 638501';

// The real short case (learners_profiles 846aabc6-…, PRABAKARAN K), 39 chars.
const SHORT_ADDRESS = '25, ANTHIYUR, ERODE, TAMIL NADU, 638501';

// A typical over-cap address: past 80, inside the live box's budget.
const TYPICAL_ADDRESS =
  '4/271 NORTH STREET, THOTTIPALAYAM PIRIVU, KUMARAPALAYAM, ' +
  'NAMAKKAL, TAMIL NADU, 638183';

const LIVE_ADDRESS_ELEMENT: BackLayoutElement = {
  field: 'address',
  x: 44,
  y: 316,
  width: 556,
  font_size: 18,
  font_weight: 600,
  color: '#111827'
};

const person: CardPersonData = {
  kind: 'learner',
  fullName: 'MANIKANDAN A',
  rollNumber: '23ECE001',
  registerNumber: null,
  designation: null,
  courseName: 'B.E. ECE',
  departmentName: 'ECE',
  institutionName: 'JKKN College of Engineering and Technology',
  isSchool: false,
  qrValue: 'learner-uuid',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: 'A-',
  dateOfBirthLabel: '12 Mar 2005',
  guardianName: null,
  guardianPhone: null,
  address: WORST_ADDRESS,
  contactPhone: '9345864573',
  idCode: '23ECE001',
  studyPeriod: '2023-2027',
  staffId: null,
  courseEndDate: null
};

/**
 * Walk every value of the element tree and collect the leaf strings. Written
 * as a generic value-walk rather than a props/child walk so it stays a plain
 * data traversal with no React-shape assumptions.
 */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => collectText(entry, out));
    return out;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectText(value, out);
    }
  }
  return out;
}

function backInput(overrides: Partial<BackRenderInput> = {}): BackRenderInput {
  return {
    person,
    backgroundDataUrl: null,
    barcodeDataUrl: null,
    layout: {},
    mappings: [],
    validUntilLabel: '31 May 2028',
    ...overrides
  };
}

/**
 * Render ONE address element on an otherwise-bare back and return the exact
 * string that reached the card. Every default block is off and the footer is
 * a neutral sentinel, so the address is the only real text on the canvas.
 */
function renderAddressElement(address: string, element: BackLayoutElement): string {
  const layout: BackLayout = {
    show_blood_group: false,
    show_dob: false,
    show_guardian: false,
    show_address: false,
    show_barcode: false,
    show_contact: false,
    footer_text: 'ZZFOOTER',
    elements: [element]
  };
  const tree = buildBackElement(
    backInput({ person: { ...person, address }, layout })
  );
  const strings = collectText(tree).filter(
    (s) => typeof s === 'string' && s.includes(address.slice(0, 8))
  );
  expect(strings).toHaveLength(1);
  return strings[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// truncateAddressForCard — the helper on its own
// ─────────────────────────────────────────────────────────────────────────────

describe('truncateAddressForCard', () => {
  it('passes a value within the cap through untouched, exactly like truncateForCard', () => {
    expect(truncateAddressForCard(SHORT_ADDRESS, 80)).toBe(SHORT_ADDRESS);
    expect(truncateAddressForCard(SHORT_ADDRESS, 80)).toBe(truncateForCard(SHORT_ADDRESS, 80));
    expect(truncateAddressForCard('  25, ANTHIYUR  ', 80)).toBe('25, ANTHIYUR');
  });

  it('treats null / undefined as empty', () => {
    expect(truncateAddressForCard(null, 80)).toBe('');
    expect(truncateAddressForCard(undefined, 80)).toBe('');
  });

  it('KEEPS the district, state and PIN when the value is over the cap', () => {
    const out = truncateAddressForCard(WORST_ADDRESS, 80);
    expect(out).toContain('ERODE');
    expect(out).toContain('TAMIL NADU');
    expect(out).toContain('638501');
    // And it really did have to drop something.
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain('…');
  });

  it('ends on the last character of the source — the tail is never cut', () => {
    const out = truncateAddressForCard(WORST_ADDRESS, 80);
    const parts = out.split(' … ');
    // A head-only cut yields ONE part; this assertion must not pass vacuously.
    expect(parts).toHaveLength(2);
    const tail = parts[1];
    expect(tail.length).toBeGreaterThanOrEqual(25); // district + state + PIN
    expect(WORST_ADDRESS.endsWith(tail)).toBe(true);
  });

  it('never opens or closes a fragment mid-word', () => {
    for (const max of [40, 60, 80, 120, 160, 200]) {
      const out = truncateAddressForCard(WORST_ADDRESS, max);
      const [head, tail] = out.split(' … ');
      expect(WORST_ADDRESS.startsWith(head), `head@${max}`).toBe(true);
      expect(WORST_ADDRESS.endsWith(tail), `tail@${max}`).toBe(true);
      // The character just before the kept tail is a separator, so the tail
      // begins on a whole token rather than halfway through one.
      const tailStart = WORST_ADDRESS.length - tail.length;
      expect(' ,'.includes(WORST_ADDRESS[tailStart - 1]), `boundary@${max}`).toBe(true);
    }
  });

  it('respects the cap at every size it is asked for', () => {
    for (const max of [40, 60, 80, 120, 160, 200, 210]) {
      expect(truncateAddressForCard(WORST_ADDRESS, max).length, `max=${max}`).toBeLessThanOrEqual(
        max
      );
    }
  });

  it('falls back to a plain head-cut when there is no room for a head, a gap and a tail', () => {
    const out = truncateAddressForCard(WORST_ADDRESS, 12);
    expect(out).toBe(truncateForCard(WORST_ADDRESS, 12));
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('degrades sensibly on junk with no separators at all', () => {
    const junk = 'X'.repeat(300);
    const out = truncateAddressForCard(junk, 80);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(junk.startsWith(out.split(' … ')[0])).toBe(true);
  });

  it('reserves enough tail for the widest real district+state+PIN (35 chars measured)', () => {
    expect(ADDRESS_TAIL_CHARS).toBeGreaterThanOrEqual(35);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The live Engineering geometry, end to end through buildBackElement
// ─────────────────────────────────────────────────────────────────────────────

describe('back address element — live Engineering geometry (556px @ 18px)', () => {
  it('prints the district, state and PIN of the 214-char worst case', () => {
    const out = renderAddressElement(WORST_ADDRESS, LIVE_ADDRESS_ELEMENT);
    expect(out).toContain('DISTRICT: ERODE');
    expect(out).toContain('638501');
    expect(out.endsWith('BHAVANI, ERODE, TAMIL NADU, 638501')).toBe(true);
    // The regression this file exists for: the old cap stopped inside "SE…".
    expect(out).not.toMatch(/PO: SE…$/);
  });

  it('renders a typical over-80 address in FULL — no ellipsis at all', () => {
    expect(TYPICAL_ADDRESS.length).toBeGreaterThan(80);
    const out = renderAddressElement(TYPICAL_ADDRESS, LIVE_ADDRESS_ELEMENT);
    expect(out).toBe(TYPICAL_ADDRESS);
    expect(out).not.toContain('…');
  });

  it('leaves a short address byte-identical', () => {
    expect(renderAddressElement(SHORT_ADDRESS, LIVE_ADDRESS_ELEMENT)).toBe(SHORT_ADDRESS);
  });

  it('keeps the generic cap when the template pins no width (a box that cannot wrap)', () => {
    const unbounded: BackLayoutElement = { ...LIVE_ADDRESS_ELEMENT, width: undefined };
    const out = renderAddressElement(WORST_ADDRESS, unbounded);
    expect(out.length).toBeLessThanOrEqual(80);
    // Still deliverable, even at the narrow cap.
    expect(out).toContain('638501');
  });

  it('scales the budget down for a narrow box, never below the generic cap', () => {
    const narrow: BackLayoutElement = { ...LIVE_ADDRESS_ELEMENT, width: 120 };
    const out = renderAddressElement(WORST_ADDRESS, narrow);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toContain('638501');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blast radius — nothing but the address may change
// ─────────────────────────────────────────────────────────────────────────────

describe('the address fix does not reach any other field', () => {
  it('leaves a long NON-address back element on the generic 80-char head-cut', () => {
    const longCourse = 'BACHELOR OF ENGINEERING IN ELECTRONICS AND COMMUNICATION ENGINEERING (AUTONOMOUS PROGRAMME)';
    const layout: BackLayout = {
      show_blood_group: false,
      show_dob: false,
      show_guardian: false,
      show_address: false,
      show_barcode: false,
      show_contact: false,
      footer_text: 'ZZFOOTER',
      elements: [{ field: 'course', x: 44, y: 316, width: 556, font_size: 18 }]
    };
    const tree = buildBackElement(
      backInput({ person: { ...person, courseName: longCourse }, layout })
    );
    const rendered = collectText(tree).find((s) => s.startsWith('BACHELOR OF'));
    expect(rendered).toBe(truncateForCard(longCourse, 80));
    expect(rendered!.endsWith('…')).toBe(true);
  });

  it('keeps the default back address row deliverable too (the 60-char path)', () => {
    const tree = buildBackElement(backInput({ layout: { footer_text: 'ZZFOOTER' } }));
    const rendered = collectText(tree).find((s) => s.startsWith('NO 2/124'));
    expect(rendered).toBeDefined();
    expect(rendered!.length).toBeLessThanOrEqual(60);
    expect(rendered).toContain('638501');
  });

  it('the FRONT cannot render an address at all — it is not a front card field', () => {
    expect(CARD_FIELDS as readonly string[]).not.toContain('address');

    const frontInput: CardRenderInput = {
      person,
      photoDataUrl: null,
      qrDataUrl: null,
      backgroundDataUrl: null,
      // A template that tries to place the address on the FRONT: the field is
      // outside the front alphabet, so it must resolve to nothing.
      layout: {
        elements: [
          { field: 'address' as unknown as 'course', x: 44, y: 316, width: 556, font_size: 18 }
        ]
      },
      mappings: [],
      validUntilLabel: '31 May 2028'
    };
    const text = collectText(buildCardElement(frontInput)).join(' | ');
    expect(text).not.toContain('KOOTHADIYUR');
    expect(text).not.toContain('638501');
  });
});
