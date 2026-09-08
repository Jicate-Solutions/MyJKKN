import { describe, expect, it } from 'vitest';
import { buildBackElement, parseBackLayout, type BackRenderInput } from '@/lib/id-cards/render-card';
import type { CardPersonData } from '@/lib/id-cards/render-data';

// 1x1 white PNG — enough for "artwork present" (icon mode); the compositor only
// needs a data URL here, not real pixels.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const person: CardPersonData = {
  kind: 'learner',
  fullName: 'A LEARNER',
  rollNumber: 'EC25011',
  registerNumber: null,
  designation: null,
  courseName: 'B.E. ECE',
  departmentName: 'ECE',
  institutionName: 'JKKN',
  isSchool: false,
  qrValue: 'x',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: 'A1B',
  dateOfBirthLabel: '02 May 1987',
  guardianName: null,
  guardianPhone: null,
  address: '2-209/1, SHIVAN KOVIL STREET, SALEM, TAMILNADU, 637504',
  contactPhone: '9894848882',
  idCode: 'EC25011',
  studyPeriod: null,
  staffId: null,
  courseEndDate: null
};

// The live Engineering back: heading static_text above each value at the same x.
const ELEMENTS = [
  { x: 44, y: 70, text: 'BLOOD GROUP', field: 'static_text', font_size: 17 },
  { x: 44, y: 96, field: 'blood_group', font_size: 36, font_weight: 800 },
  { x: 44, y: 180, text: 'DATE OF BIRTH', field: 'static_text', font_size: 17 },
  { x: 44, y: 206, field: 'date_of_birth', width: 550, font_size: 27 },
  { x: 44, y: 470, text: 'CONTACT', field: 'static_text', font_size: 17 },
  { x: 44, y: 496, field: 'contact_phone', width: 550, font_size: 27 },
  { x: 44, y: 800, text: 'PH: 99659 39333', field: 'static_text', font_size: 17 }
];

/** Collect absolutely positioned text nodes: text → {left, top, width}. */
function positioned(node: unknown, out: Array<{ text: string; left: number; top: number; width?: number }> = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => positioned(n, out));
    return out;
  }
  const rec = node as { props?: Record<string, unknown> };
  const props = rec.props;
  if (props) {
    const style = props.style as Record<string, unknown> | undefined;
    const child = props.children;
    if (style?.position === 'absolute' && typeof child === 'string') {
      out.push({
        text: child,
        left: Number(style.left),
        top: Number(style.top),
        width: typeof style.width === 'number' ? style.width : undefined
      });
    }
    positioned(props.children, out);
  }
  return out;
}

function render(overrides: Record<string, unknown>, artwork: string | null): ReturnType<typeof positioned> {
  const layout = parseBackLayout({
    orientation: 'portrait',
    show_blood_group: false,
    show_dob: false,
    show_guardian: false,
    show_address: false,
    show_barcode: false,
    show_contact: false,
    show_institution_contact: false,
    elements: ELEMENTS,
    ...overrides
  })!;
  const input: BackRenderInput = {
    person,
    backgroundDataUrl: artwork,
    barcodeDataUrl: null,
    layout,
    mappings: [],
    validUntilLabel: 'x'
  };
  return positioned(buildBackElement(input, { upright: true }));
}

describe('back icon mode — values sit beside the artwork icons', () => {
  it('with artwork: headings gone, values re-anchor onto the heading row and shift right by the gutter', () => {
    const nodes = render({}, TINY_PNG);
    const texts = nodes.map((n) => n.text);
    expect(texts).not.toContain('BLOOD GROUP');
    expect(texts).not.toContain('CONTACT');

    const blood = nodes.find((n) => n.text === 'A1B')!;
    expect(blood.left).toBe(44 + 80);
    // Block centred on the icon: heading.y + 30 − (36 × 1.15) / 2 ≈ 79, not the authored y=96
    expect(blood.top).toBe(79);

    const dob = nodes.find((n) => n.text === '02 May 1987')!;
    expect(dob.left).toBe(124);
    expect(dob.top).toBe(Math.round(180 + 30 - (27 * 1.15) / 2)); // 195
    expect(dob.width).toBe(550 - 80); // box narrows so it still ends at the same right edge

    const phone = nodes.find((n) => n.text === '9894848882')!;
    expect(phone.top).toBe(Math.round(470 + 30 - (27 * 1.15) / 2)); // 485

    // Non-heading static text keeps its row but also clears the icon column.
    const ph = nodes.find((n) => n.text === 'PH: 99659 39333')!;
    expect(ph.left).toBe(124);
    expect(ph.top).toBe(800);
  });

  it('a wrapped address centres its whole block on the icon (middle line level with it)', () => {
    const elements = [
      ...ELEMENTS,
      { x: 44, y: 290, text: 'ADDRESS', field: 'static_text', font_size: 17 },
      { x: 44, y: 316, field: 'address', width: 556, font_size: 18 }
    ];
    const nodes = render({ elements }, TINY_PNG);
    const addr = nodes.find((n) => n.text.startsWith('2-209/1'))!;
    // Three lines at the fitted size: block height = lines × size × 1.15, so the
    // top sits ABOVE the icon centre by half of that (well above a 1-line anchor).
    expect(addr.top).toBeLessThan(290 + 30 - (18 * 1.15) / 2);
    expect(addr.top).toBeGreaterThan(200);
    expect(addr.left).toBe(124);
  });

  it('live-template shape: value authored RIGHT of its heading still anchors and gets the uniform left edge', () => {
    const elements = [
      { x: 44, y: 70, text: 'BLOOD GROUP', field: 'static_text', font_size: 17 },
      { x: 120, y: 110, field: 'blood_group', font_size: 36, font_weight: 800 },
      { x: 44, y: 180, text: 'CONTACT', field: 'static_text', font_size: 17 },
      { x: 160, y: 220, field: 'contact_phone', width: 400, font_size: 27 },
      // static contact line already to the right: NOT shifted a second time
      { x: 200, y: 800, text: '99659 39333', field: 'static_text', font_size: 20 }
    ];
    const nodes = render({ elements }, TINY_PNG);
    const blood = nodes.find((n) => n.text === 'A1B')!;
    expect(blood.left).toBe(44 + 80);
    expect(blood.top).toBe(79);
    const phone = nodes.find((n) => n.text === '9894848882')!;
    expect(phone.left).toBe(124);
    expect(phone.width).toBe(400 - (124 - 160)); // box grows back by the leftward move
    const ph = nodes.find((n) => n.text === '99659 39333')!;
    expect(ph.left).toBe(200);
  });

  it('icon_gutter is tunable (0 disables the shift, anchoring still applies)', () => {
    const nodes = render({ icon_gutter: 0 }, TINY_PNG);
    const blood = nodes.find((n) => n.text === 'A1B')!;
    expect(blood.left).toBe(44);
    expect(blood.top).toBe(79);
  });

  it('without artwork there is no icon column: headings hidden, positions untouched', () => {
    const nodes = render({}, null);
    const blood = nodes.find((n) => n.text === 'A1B')!;
    expect(blood.left).toBe(44);
    expect(blood.top).toBe(96);
    expect(nodes.map((n) => n.text)).not.toContain('BLOOD GROUP');
  });

  it('show_field_labels: true keeps the authored layout exactly (headings + positions)', () => {
    const nodes = render({ show_field_labels: true }, TINY_PNG);
    expect(nodes.map((n) => n.text)).toContain('BLOOD GROUP');
    const blood = nodes.find((n) => n.text === 'A1B')!;
    expect(blood.left).toBe(44);
    expect(blood.top).toBe(96);
  });
});

describe('institution rows', () => {
  it('institution_* rows render from the template institution block, website exactly as entered', () => {
    const elements = [
      { x: 44, y: 684, field: 'institution_phone', width: 556, font_size: 20 },
      { x: 44, y: 770, field: 'institution_email', width: 556, font_size: 20 },
      { x: 44, y: 856, field: 'institution_website', width: 556, font_size: 20 }
    ];
    const layout = parseBackLayout({ orientation: 'portrait', show_blood_group: false, show_dob: false, show_guardian: false, show_address: false, show_barcode: false, show_contact: false, show_institution_contact: false, elements })!;
    const nodes = positioned(
      buildBackElement(
        {
          person: { ...person, institutionPhone: '99659 39333, 99653 63999', institutionEmail: 'engg@jkkn.ac.in', institutionWebsite: 'https://engg.jkkn.ac.in/' },
          backgroundDataUrl: TINY_PNG,
          barcodeDataUrl: null,
          layout,
          mappings: [],
          validUntilLabel: 'x'
        },
        { upright: true }
      )
    );
    const www = nodes.find((n) => n.text === 'https://engg.jkkn.ac.in/')!;
    expect(www).toBeDefined();
    expect(www.top).toBe(856); // no heading nearby → keeps its own y
    expect(nodes.find((n) => n.text === 'engg@jkkn.ac.in')!.top).toBe(770);
    expect(nodes.find((n) => n.text.startsWith('99659'))!.top).toBe(684);
  });
});
