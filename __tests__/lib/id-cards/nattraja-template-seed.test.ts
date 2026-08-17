// ============================================================================
// Guard: the seeded Nattraja Vidhyalya CBSE card template.
// Covers supabase/migrations/20260904010000_id_card_template_nattraja_vidhyalya.sql
// Created: 2026-09-04.
//
// WHY A TEST AT ALL FOR A SEED ROW. A layout element whose `field` the renderer
// does not recognise is not an error — parseElements `continue`s past it. The
// element simply never draws. A seeded template can therefore be JSON-valid,
// pass every SQL gate, apply cleanly, and still print a card with the roll
// number missing, and the first sign of it is a spoiled plastic card. This file
// runs the PRODUCTION parsers (parseFrontLayout / parseBackLayout /
// parseFieldMappings) over the exact JSON the migration inserts and asserts
// nothing is silently dropped.
//
// WHY IT PARSES THE .sql FILE INSTEAD OF A TS FIXTURE. A fixture would be a
// second copy of the payload, and a second copy is a thing that drifts. The
// migration file is the only source; the JSON is read out of it. This also
// means the test needs NO database, NO secret and NO network, so it runs on a
// fork exactly like the sibling picker guard does.
//
// THE TWO RULES WORTH BREAKING A BUILD OVER
//   1. The template ships DARK (active = false). Nattraja has no card artwork
//      yet and no verification print has been eyeballed. A card printed from an
//      unverified template is plastic, ink and a ribbon panel spent per learner.
//   2. No JKKN College of Engineering identity travels with the copied design.
//      The layout is deliberately shared between the two colleges; the branding
//      is not. The Engineering artwork URL, email, site and phone block are the
//      four things that must not come along.
// ============================================================================

import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { parseBackLayout, parseFrontLayout } from '@/lib/id-cards/render-card';
import { parseFieldMappings } from '@/lib/id-cards/render-data';

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/20260904010000_id_card_template_nattraja_vidhyalya.sql'
);

const SQL = readFileSync(MIGRATION, 'utf8');

const NATTRAJA_INSTITUTION = '29c221d1-b918-4c46-9d67-857273b0b553';
const ENGINEERING_INSTITUTION = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const TEMPLATE_ID = 'ed3fb150-2f08-5284-8ad0-f3c7def6658c';

/** Pull one `$tag$ … $tag$` dollar-quoted payload out of the migration. */
function dollarQuoted(tag: string): unknown {
  const open = `$${tag}$`;
  const start = SQL.indexOf(open);
  const end = SQL.indexOf(open, start + open.length);
  expect(start, `no opening $${tag}$ block in the migration`).toBeGreaterThan(-1);
  expect(end, `no closing $${tag}$ block in the migration`).toBeGreaterThan(start);
  return JSON.parse(SQL.slice(start + open.length, end));
}

const front = dollarQuoted('front') as Record<string, unknown>;
const back = dollarQuoted('back') as Record<string, unknown>;
const mappings = dollarQuoted('mappings');

type El = { field: string; text?: string; x: number; y: number };
const frontEls = front.elements as El[];
const backEls = back.elements as El[];

describe('the seeded template is addressed to Nattraja Vidhyalya CBSE', () => {
  it('names the Nattraja institution and not the Engineering one', () => {
    expect(SQL).toContain(NATTRAJA_INSTITUTION);
    expect(SQL).not.toContain(ENGINEERING_INSTITUTION);
  });

  it('uses a fixed template id, so a replay cannot mint a second row', () => {
    expect(SQL).toContain(TEMPLATE_ID);
  });

  it('calls the card holder a learner', () => {
    expect(SQL).toContain('Nattraja Vidhyalya CBSE Learner');
  });
});

describe('it ships dark', () => {
  it('seeds active = FALSE', () => {
    // The literal in the INSERT's SELECT list, immediately before the guard.
    expect(SQL).toMatch(/\n\s*FALSE\n\s*WHERE NOT EXISTS/);
    expect(SQL).not.toMatch(/\n\s*TRUE\n\s*WHERE NOT EXISTS/);
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
    expect(SQL).toMatch(/t\.id = c_template_id/);
    expect(SQL).toMatch(/t\.institution_id = c_institution_id AND t\.name = c_name/);
  });

  it('degrades rather than raising when the institution is absent', () => {
    expect(SQL).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.institutions/);
  });
});

describe('no Engineering identity travels with the shared design', () => {
  const payload = JSON.stringify({ front, back, mappings });

  it.each([
    ['the Engineering artwork bucket path', 'id-card-assets'],
    ['the Engineering source template id', 'ad0642ec'],
    ['the Engineering email and site', 'engg.jkkn.ac.in'],
    ['the Engineering phone block', '99659 39333']
  ])('drops %s', (_label, needle) => {
    expect(payload).not.toContain(needle);
  });

  it('carries no background artwork at all — Nattraja has none yet', () => {
    expect(front.background_image).toBeUndefined();
    expect(back.background_image).toBeUndefined();
    expect(parseFrontLayout(front)?.background_image).toBeUndefined();
    expect(parseBackLayout(back)?.background_image).toBeUndefined();
  });

  it('carries the Nattraja contact lines instead', () => {
    const texts = backEls.map((e) => e.text);
    expect(texts).toContain('PH: 99943 44986');
    expect(texts).toContain('nattrajavidhyalya@jkkn.ac.in');
    expect(texts).toContain('nv.jkkn.ac.in');
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

  it('keeps all 11 back elements — none is silently dropped', () => {
    const parsed = parseBackLayout(back);
    expect(parsed).not.toBeNull();
    expect(parsed?.orientation).toBe('portrait');
    expect(backEls).toHaveLength(11);
    expect(parsed?.elements).toHaveLength(backEls.length);
    expect(parsed?.elements?.map((e) => e.field)).toEqual(backEls.map((e) => e.field));
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
    const check = (
      source: El[],
      parsed: { x: number; y: number }[] | undefined
    ) => {
      expect(parsed).toBeDefined();
      source.forEach((el, i) => {
        expect(parsed?.[i]?.x, `element ${i} (${el.field}) x was clamped`).toBe(el.x);
        expect(parsed?.[i]?.y, `element ${i} (${el.field}) y was clamped`).toBe(el.y);
      });
    };
    check(frontEls, parseFrontLayout(front)?.elements);
    check(backEls, parseBackLayout(back)?.elements);
  });
});

describe('the duplicate-label defect is not inherited', () => {
  // The live Engineering templates print every label twice: their artwork bakes
  // '<STUDENT NAME>' and three 'Text here' placeholders into the bitmap while
  // the template draws its own text over them. This template has no artwork, so
  // its static_text elements are the only source of those labels. What must
  // never happen is the SAME label appearing twice on one side.
  const labels = (els: El[]) =>
    els.filter((e) => e.field === 'static_text').map((e) => (e.text ?? '').trim());

  it.each([
    ['front', () => labels(frontEls)],
    ['back', () => labels(backEls)]
  ])('draws no label twice on the %s', (_side, get) => {
    const list = get();
    expect(new Set(list).size).toBe(list.length);
  });

  it('carries no placeholder text from the Engineering artwork', () => {
    const all = [...labels(frontEls), ...labels(backEls)].join('|').toLowerCase();
    expect(all).not.toContain('text here');
    expect(all).not.toContain('<');
  });

  it('gives every static_text element something to say', () => {
    for (const el of [...frontEls, ...backEls]) {
      if (el.field !== 'static_text') continue;
      expect((el.text ?? '').trim().length, `empty static_text at ${el.x},${el.y}`)
        .toBeGreaterThan(0);
    }
  });
});
