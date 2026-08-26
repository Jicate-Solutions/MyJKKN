// ============================================================================
// Guard: the seeded card templates for the seven colleges that had none.
// Covers supabase/migrations/20261012043000_id_card_templates_seven_colleges.sql
// Created: 2026-10-12.
//
// Sibling of nattraja-template-seed.test.ts, and it exists for the same reason:
// a layout element whose `field` the renderer does not recognise is not an
// error — parseElements `continue`s past it and the element simply never draws.
// A seeded template can be JSON-valid, pass every SQL gate, apply cleanly, and
// still print a card with the roll number missing; the first sign of it is a
// spoiled plastic card. This file runs the PRODUCTION parsers over the exact
// JSON the migration inserts, so nothing can be silently dropped.
//
// It reads the .sql file rather than a TS fixture for the same reason too: a
// fixture is a second copy of the payload, and a second copy drifts. The
// migration is the only source. No database, no secret, no network.
//
// THE THREE RULES WORTH BREAKING A BUILD OVER
//   1. All seven ship DARK (active = false). None has artwork, six have no
//      contact details on file, and no verification print has been eyeballed.
//   2. No JKKN College of Engineering identity travels with the copied design —
//      not the artwork, not the phone block, not the email, not the site.
//   3. No PLACEHOLDER contact detail is printed. Six of the seven institutions
//      carry '9876543210' / 'admin@jkkn.ac.in' / 'https://www.jkkn.ac.in/' on
//      their institutions row — a fake number shared by eight institutions and
//      a group-wide inbox. Those three strings must never reach a card. This is
//      the rule the migration was written around, so it is the rule most worth
//      a test: filling the gap with a plausible-looking wrong number is a worse
//      outcome than leaving the line off.
// ============================================================================

import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { parseBackLayout, parseFrontLayout } from '@/lib/id-cards/render-card';
import { parseFieldMappings } from '@/lib/id-cards/render-data';

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/20261012043000_id_card_templates_seven_colleges.sql'
);

const SQL = readFileSync(MIGRATION, 'utf8');

const ENGINEERING_INSTITUTION = '5de4fba1-4564-41ed-8c73-5d948b74b843';

/** institution id -> the template id and name the migration seeds for it. */
const SEVEN: ReadonlyArray<{ institution: string; template: string; name: string }> = [
  {
    institution: 'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
    template: 'fa2c6cf0-19dd-5f6c-9941-2f9ce81ef06d',
    name: 'JKKN College of Arts and Science (Self) Learner — Tall (2026)'
  },
  {
    institution: '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334',
    template: 'ff878e29-e924-572b-b602-08b0eb945e82',
    name: 'JKKN College of Pharmacy Learner — Tall (2026)'
  },
  {
    institution: 'e04b8a7f-1445-4ef1-92e9-bde3d32b1f44',
    template: 'b504f973-2093-520c-a8fc-a521a9a92fbe',
    name: 'JKKN Matric Higher Secondary School Learner — Tall (2026)'
  },
  {
    institution: 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
    template: '84759bb7-0778-52e3-91f7-7e138da0dab2',
    name: 'JKKN Dental College and Hospital Learner — Tall (2026)'
  },
  {
    institution: 'a33138b6-4eea-4675-941f-1071bf88b127',
    template: 'bfde2083-26fe-5fd5-ad3a-34e3e97cb74e',
    name: 'JKKN College of Arts and Science (Aided) Learner — Tall (2026)'
  },
  {
    institution: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
    template: '45898dc7-c4c4-5d38-bdba-585a31916bfb',
    name: 'JKKN College of Allied Health Sciences Learner — Tall (2026)'
  },
  {
    institution: '70e54e51-9b98-4e07-9534-a85310609bfd',
    template: '53e0d3ba-446c-5894-87d8-aa4d287567d1',
    name: 'JKKN College of Nursing and Research Learner — Tall (2026)'
  }
];

/** Pull one `$tag$ … $tag$` dollar-quoted payload out of the migration. */
function dollarQuoted(tag: string): unknown {
  const open = `$${tag}$`;
  const start = SQL.indexOf(open);
  const end = SQL.indexOf(open, start + open.length);
  expect(start, `no opening $${tag}$ block in the migration`).toBeGreaterThan(-1);
  expect(end, `no closing $${tag}$ block in the migration`).toBeGreaterThan(start);
  return JSON.parse(SQL.slice(start + open.length, end));
}

type El = { field: string; text?: string; x: number; y: number };

const front = dollarQuoted('front') as Record<string, unknown>;
const back = dollarQuoted('back') as Record<string, unknown>;
const mappings = dollarQuoted('mappings');
/** The three contact lines appended for the ONE college that has real ones. */
const contact = dollarQuoted('contact') as El[];

const frontEls = front.elements as El[];
const backEls = back.elements as El[];
/** The back exactly as the Matric Higher Secondary School row receives it. */
const backWithContact = { ...back, elements: [...backEls, ...contact] };

describe('all seven colleges are addressed, and only those seven', () => {
  it.each(SEVEN.map((c) => [c.name, c] as const))('seeds %s', (_label, college) => {
    expect(SQL).toContain(college.institution);
    expect(SQL).toContain(college.template);
    expect(SQL).toContain(college.name);
  });

  it('mints no card for the Engineering institution, which already has two', () => {
    expect(SQL).not.toContain(ENGINEERING_INSTITUTION);
  });

  it('gives every college its own template id — no two rows collide', () => {
    expect(new Set(SEVEN.map((c) => c.template)).size).toBe(SEVEN.length);
    expect(new Set(SEVEN.map((c) => c.institution)).size).toBe(SEVEN.length);
  });

  it('calls every card holder a learner', () => {
    for (const college of SEVEN) expect(college.name).toContain('Learner');
  });

  it('distinguishes the two Arts and Science colleges, which share a display name', () => {
    // institutions.display_name is 'JKKN College of Arts and Science
    // (Autonomous)' for BOTH the Self and Aided rows. Naming the templates from
    // display_name would produce two rows a human cannot tell apart.
    expect(SQL).toContain('Arts and Science (Self) Learner');
    expect(SQL).toContain('Arts and Science (Aided) Learner');
  });
});

describe('they all ship dark', () => {
  it('seeds active = FALSE', () => {
    // The literal in the INSERT's SELECT list, immediately before the guard.
    expect(SQL).toMatch(/c_mappings, FALSE\n\s*WHERE NOT EXISTS/);
    expect(SQL).not.toMatch(/c_mappings, TRUE\n\s*WHERE NOT EXISTS/);
  });

  it('raises rather than seeding an active row, if that literal is ever flipped', () => {
    expect(SQL).toMatch(/RAISE EXCEPTION\s*\n?\s*'ID card template % \(%\) was seeded ACTIVE/);
  });

  it('never switches an existing template on', () => {
    expect(SQL).not.toMatch(/\bUPDATE\s+public\.id_card_templates\b/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\s+public\.id_card_templates\b/i);
  });

  it('enqueues no print job', () => {
    expect(SQL).not.toMatch(/id_card_print_jobs/i);
  });
});

describe('it is safe to run twice', () => {
  it('guards on the primary key AND on (institution, name)', () => {
    expect(SQL).toMatch(/WHERE NOT EXISTS/);
    expect(SQL).toMatch(/t\.id = r\.template_id/);
    expect(SQL).toMatch(/t\.institution_id = r\.institution_id AND t\.name = r\.name/);
  });

  it('degrades rather than raising when an institution is absent', () => {
    expect(SQL).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.institutions/);
  });
});

describe('no Engineering identity travels with the shared design', () => {
  const payload = JSON.stringify({ front, back, contact, mappings });

  it.each([
    ['the Engineering artwork bucket path', 'id-card-assets'],
    ['the Engineering source template id', 'ad0642ec'],
    ['the Engineering email and site', 'engg.jkkn.ac.in'],
    ['the Engineering phone block', '99659 39333']
  ])('drops %s', (_label, needle) => {
    expect(payload).not.toContain(needle);
  });

  it('carries no background artwork at all — none of the seven has any', () => {
    expect(front.background_image).toBeUndefined();
    expect(back.background_image).toBeUndefined();
    expect(parseFrontLayout(front)?.background_image).toBeUndefined();
    expect(parseBackLayout(back)?.background_image).toBeUndefined();
  });
});

describe('no placeholder contact detail is ever printed', () => {
  // '9876543210' sits on 8 of the 14 institutions rows, 'admin@jkkn.ac.in' on 9
  // and 'https://www.jkkn.ac.in/' on 7. They are defaults, not contacts. The
  // header comment discusses them by name, so these assertions run against the
  // parsed JSON payloads — what actually reaches a card — never the raw file.
  const payload = JSON.stringify({ front, back, contact });

  it.each([
    ['the placeholder phone number', '9876543210'],
    ['the group-wide inbox', 'admin@jkkn.ac.in'],
    ['the group website standing in for a college site', 'www.jkkn.ac.in']
  ])('keeps %s off every card', (_label, needle) => {
    expect(payload).not.toContain(needle);
  });

  it('leaves the six placeholder colleges with no contact block rather than a wrong one', () => {
    // The shared back stops at CONTACT/contact_phone: eight elements, none of
    // which is an institution contact line.
    expect(backEls).toHaveLength(8);
    expect(backEls.some((e) => (e.text ?? '').startsWith('PH:'))).toBe(false);
    expect(backEls.some((e) => (e.text ?? '').includes('@'))).toBe(false);
  });

  it('appends real contacts for the one college that has them', () => {
    // JKKN Matric Higher Secondary School — the only one of the seven whose
    // institutions row is not the shared placeholder trio. Taken verbatim from
    // that row; still to be eyeballed before the template is switched on.
    expect(contact).toHaveLength(3);
    expect(contact.map((e) => e.text)).toEqual([
      'PH: 99658 91999',
      'school@jkkn.org',
      'school.jkkn.ac.in'
    ]);
    expect(contact.every((e) => e.field === 'static_text')).toBe(true);
  });

  it('drops the three appended lines into the source template positions', () => {
    // Same y coordinates the Engineering back used for its contact block, so
    // the shared design is genuinely shared and nothing overlaps.
    expect(contact.map((e) => e.y)).toEqual([800, 836, 870]);
    expect(contact.every((e) => e.x === 44)).toBe(true);
    expect(Math.max(...backEls.map((e) => e.y))).toBeLessThan(800);
  });
});

describe('the production renderer accepts every seeded element', () => {
  it('keeps all 11 front elements — none is silently dropped', () => {
    const parsed = parseFrontLayout(front);
    expect(parsed).not.toBeNull();
    expect(parsed?.orientation).toBe('portrait');
    expect(frontEls).toHaveLength(11);
    expect(parsed?.elements).toHaveLength(frontEls.length);
    expect(parsed?.elements?.map((e) => e.field)).toEqual(frontEls.map((e) => e.field));
  });

  it('keeps all 8 shared back elements — none is silently dropped', () => {
    const parsed = parseBackLayout(back);
    expect(parsed).not.toBeNull();
    expect(parsed?.orientation).toBe('portrait');
    expect(parsed?.elements).toHaveLength(backEls.length);
    expect(parsed?.elements?.map((e) => e.field)).toEqual(backEls.map((e) => e.field));
  });

  it('keeps all 11 back elements on the one card that gets contact lines', () => {
    const parsed = parseBackLayout(backWithContact);
    expect(parsed).not.toBeNull();
    expect(backWithContact.elements).toHaveLength(11);
    expect(parsed?.elements).toHaveLength(11);
    expect(parsed?.elements?.map((e) => e.field)).toEqual(
      backWithContact.elements.map((e) => e.field)
    );
  });

  it('keeps the roll-number field mapping', () => {
    expect(parseFieldMappings(mappings)).toEqual([
      { card_field: 'roll_number', db_column: 'learners_profiles.roll_number' }
    ]);
  });

  it('positions every element inside the portrait canvas, uncorrected', () => {
    // parseElements CLAMPS out-of-range coordinates rather than rejecting them,
    // so an element that drifted off-card would be quietly pulled to the edge.
    // Comparing parsed coordinates against the source catches that.
    const check = (source: El[], parsed: { x: number; y: number }[] | undefined) => {
      expect(parsed).toBeDefined();
      source.forEach((el, i) => {
        expect(parsed?.[i]?.x, `element ${i} (${el.field}) x was clamped`).toBe(el.x);
        expect(parsed?.[i]?.y, `element ${i} (${el.field}) y was clamped`).toBe(el.y);
      });
    };
    check(frontEls, parseFrontLayout(front)?.elements);
    check(backEls, parseBackLayout(back)?.elements);
    check(backWithContact.elements, parseBackLayout(backWithContact)?.elements);
  });
});

describe('the duplicate-label defect is not inherited', () => {
  // The live Engineering templates print every label twice: their artwork bakes
  // '<STUDENT NAME>' and three 'Text here' placeholders into the bitmap while
  // the template draws its own text over them. These templates have no artwork,
  // so their static_text elements are the only source of those labels. What
  // must never happen is the SAME label appearing twice on one side.
  const labels = (els: El[]) =>
    els.filter((e) => e.field === 'static_text').map((e) => (e.text ?? '').trim());

  it.each([
    ['front', () => labels(frontEls)],
    ['shared back', () => labels(backEls)],
    ['back with contact lines', () => labels(backWithContact.elements)]
  ])('draws no label twice on the %s', (_side, get) => {
    const list = get();
    expect(new Set(list).size).toBe(list.length);
  });

  it('carries no placeholder text from the Engineering artwork', () => {
    const all = [...labels(frontEls), ...labels(backWithContact.elements)]
      .join('|')
      .toLowerCase();
    expect(all).not.toContain('text here');
    expect(all).not.toContain('<');
  });

  it('gives every static_text element something to say', () => {
    for (const el of [...frontEls, ...backWithContact.elements]) {
      if (el.field !== 'static_text') continue;
      expect((el.text ?? '').trim().length, `empty static_text at ${el.x},${el.y}`)
        .toBeGreaterThan(0);
    }
  });
});
