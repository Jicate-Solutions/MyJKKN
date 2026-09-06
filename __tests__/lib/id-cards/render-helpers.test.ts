// __tests__/lib/id-cards/render-helpers.test.ts
// Phase 2 — pure-helper coverage for the ID-card render engine.

import { describe, it, expect } from 'vitest';
import {
  initialsFromName,
  defaultValidUntilLabel,
  yearlyValidUntilLabel,
  parseYearEndMmdd,
  parseValidityPolicy,
  resolveValidUntilLabel,
  svgCoverImageDataUrl,
  DEFAULT_VALIDITY_POLICY,
  truncateForCard,
  parseFieldMappings,
  resolveMappedValue
} from '@/lib/id-cards/render-data';
import { parseFrontLayout, CARD_WIDTH, CARD_HEIGHT } from '@/lib/id-cards/render-card';

describe('initialsFromName', () => {
  it('takes first letters of the first two words, uppercased', () => {
    expect(initialsFromName('Anitha Kumari')).toBe('AK');
    expect(initialsFromName('  ravi  ')).toBe('R');
    expect(initialsFromName('A B C D')).toBe('AB');
  });

  it('falls back to ID for empty / null names', () => {
    expect(initialsFromName('')).toBe('ID');
    expect(initialsFromName(null)).toBe('ID');
    expect(initialsFromName(undefined)).toBe('ID');
    expect(initialsFromName('   ')).toBe('ID');
  });
});

describe('defaultValidUntilLabel', () => {
  it('June onward → 31 May of the NEXT year (academic year runs Jun→May)', () => {
    expect(defaultValidUntilLabel(new Date('2026-07-24T10:00:00Z'))).toBe('31 May 2027');
    expect(defaultValidUntilLabel(new Date('2026-06-01T00:00:00Z'))).toBe('31 May 2027');
    expect(defaultValidUntilLabel(new Date('2026-12-31T00:00:00Z'))).toBe('31 May 2027');
  });

  it('January–May → 31 May of the CURRENT year', () => {
    expect(defaultValidUntilLabel(new Date('2027-02-10T00:00:00Z'))).toBe('31 May 2027');
    expect(defaultValidUntilLabel(new Date('2027-05-20T00:00:00Z'))).toBe('31 May 2027');
  });
});

describe('truncateForCard', () => {
  it('passes short strings through and trims whitespace', () => {
    expect(truncateForCard('  Anitha  ', 20)).toBe('Anitha');
  });

  it('hard-truncates long strings with an ellipsis', () => {
    const out = truncateForCard('A'.repeat(60), 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles null/undefined as empty', () => {
    expect(truncateForCard(null, 10)).toBe('');
    expect(truncateForCard(undefined, 10)).toBe('');
  });
});

describe('parseFieldMappings', () => {
  it('accepts the {card_field, db_column} array shape', () => {
    const parsed = parseFieldMappings([
      { id: '1', card_field: 'name_line_1', db_column: 'learners_profiles.first_name' },
      { card_field: 'qr_code', db_column: 'learners_profiles.id' }
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      card_field: 'name_line_1',
      db_column: 'learners_profiles.first_name'
    });
  });

  it('drops malformed entries and unknown card fields', () => {
    const parsed = parseFieldMappings([
      null,
      42,
      { card_field: 'not_a_field', db_column: 'x' },
      { card_field: 'roll_number' },
      { card_field: 'roll_number', db_column: 'learners_profiles.roll_number' }
    ]);
    expect(parsed).toEqual([
      { card_field: 'roll_number', db_column: 'learners_profiles.roll_number' }
    ]);
  });

  it('returns [] for non-array JSONB (object, null, string)', () => {
    expect(parseFieldMappings({})).toEqual([]);
    expect(parseFieldMappings(null)).toEqual([]);
    expect(parseFieldMappings('[]')).toEqual([]);
  });
});

describe('resolveMappedValue', () => {
  const bag = {
    'learners_profiles.first_name': 'Anitha',
    'learners_profiles.roll_number': ''
  };

  it('uses the mapped bag value when present and non-empty', () => {
    const value = resolveMappedValue(
      'name_line_1',
      [{ card_field: 'name_line_1', db_column: 'learners_profiles.first_name' }],
      bag,
      'Fallback Name'
    );
    expect(value).toBe('Anitha');
  });

  it('falls back to the built-in when the mapped value is empty or unknown', () => {
    expect(
      resolveMappedValue(
        'roll_number',
        [{ card_field: 'roll_number', db_column: 'learners_profiles.roll_number' }],
        bag,
        'BUILT-IN'
      )
    ).toBe('BUILT-IN');
    expect(
      resolveMappedValue(
        'course',
        [{ card_field: 'course', db_column: 'no.such.column' }],
        bag,
        'BUILT-IN'
      )
    ).toBe('BUILT-IN');
    expect(resolveMappedValue('department', [], bag, 'BUILT-IN')).toBe('BUILT-IN');
  });
});

describe('parseFrontLayout', () => {
  it('returns null for the prod reality today (empty object) and junk', () => {
    expect(parseFrontLayout({})).toBeNull();
    expect(parseFrontLayout(null)).toBeNull();
    expect(parseFrontLayout([])).toBeNull();
    expect(parseFrontLayout('{}')).toBeNull();
    expect(parseFrontLayout({ unknown_key: true })).toBeNull();
  });

  it('parses styling-only overrides (background + header)', () => {
    const layout = parseFrontLayout({
      background_color: '#fbfbee',
      header: { show: true, text: 'JKKN', background_color: '#0b6d41', text_color: '#ffffff' }
    });
    expect(layout).not.toBeNull();
    expect(layout?.background_color).toBe('#fbfbee');
    expect(layout?.header?.background_color).toBe('#0b6d41');
    expect(layout?.elements).toBeUndefined();
  });

  it('rejects unsafe color strings instead of passing them to satori', () => {
    const layout = parseFrontLayout({ background_color: 'url(javascript:x)' });
    expect(layout).toBeNull();
  });

  it('parses and clamps positioned elements, dropping malformed ones', () => {
    const layout = parseFrontLayout({
      elements: [
        { field: 'name_line_1', x: 400, y: 150, font_size: 999, font_weight: 700 },
        { field: 'photo', x: -50, y: 99999, width: 300, height: 380 },
        { field: 'static_text', text: 'ID CARD', x: 10, y: 10 },
        { field: 'not_a_field', x: 0, y: 0 },
        { field: 'roll_number', x: 'NaN', y: 20 }
      ]
    });
    expect(layout?.elements).toHaveLength(3);
    const [name, photo] = layout!.elements!;
    expect(name.font_size).toBe(120); // clamped to max
    expect(photo.x).toBe(0); // clamped into canvas
    expect(photo.y).toBe(CARD_HEIGHT);
    expect(photo.width).toBeLessThanOrEqual(CARD_WIDTH);
  });
});

describe('parseFrontLayout — background_image (Canva-background workflow)', () => {
  it('accepts an https URL and keeps other keys', () => {
    const layout = parseFrontLayout({
      background_image: ' https://example.supabase.co/storage/v1/object/public/id-card-assets/backgrounds/t1/a.png ',
      background_color: '#ffffff'
    });
    expect(layout?.background_image).toBe(
      'https://example.supabase.co/storage/v1/object/public/id-card-assets/backgrounds/t1/a.png'
    );
    expect(layout?.background_color).toBe('#ffffff');
  });

  it('background_image alone counts as content (layout is not null)', () => {
    const layout = parseFrontLayout({
      background_image: 'https://example.supabase.co/storage/v1/object/public/id-card-assets/x.png'
    });
    expect(layout).not.toBeNull();
  });

  it('rejects non-https, non-string and whitespace-embedded values', () => {
    expect(parseFrontLayout({ background_image: 'http://insecure.example/x.png' })).toBeNull();
    expect(parseFrontLayout({ background_image: 'javascript:alert(1)' })).toBeNull();
    expect(parseFrontLayout({ background_image: 'https://a b/x.png' })).toBeNull();
    expect(parseFrontLayout({ background_image: 42 })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// programs.card_short_name (2026-09-01) — the card's narrow COURSE line.
// The card prints "BTECH IT"; the DB holds "B.Tech. Information Technology".
// ─────────────────────────────────────────────────────────────────────────────

describe('card_short_name resolution via field mappings', () => {
  const bag = (short: string) => ({
    'learners_profiles.program_id': 'B.Tech. Information Technology',
    'programs.card_short_name': short
  });

  it('prints the short form when the programme has one', () => {
    expect(
      resolveMappedValue(
        'course',
        [{ card_field: 'course', db_column: 'programs.card_short_name' }],
        bag('BTECH IT'),
        'B.Tech. Information Technology'
      )
    ).toBe('BTECH IT');
  });

  it('falls back to the full programme name when the short form is empty', () => {
    // A programme with no short form must never print a blank COURSE line.
    expect(
      resolveMappedValue(
        'course',
        [{ card_field: 'course', db_column: 'programs.card_short_name' }],
        bag(''),
        'B.Tech. Information Technology'
      )
    ).toBe('B.Tech. Information Technology');
  });

  it('unmapped templates are unaffected — still the full name', () => {
    expect(
      resolveMappedValue('course', [], bag('BTECH IT'), 'B.Tech. Information Technology')
    ).toBe('B.Tech. Information Technology');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Card validity (2026-09-02) — the Director's rules, held in platform_policies.
//   • a learner's card lasts their whole course (batches.end_date)
//   • a team member's card lasts the academic year
//   • a learner with no batch falls back to the yearly rule
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-02T10:00:00');

describe('parseYearEndMmdd', () => {
  it('reads a MM-DD string', () => {
    expect(parseYearEndMmdd('05-31')).toEqual({ month: 5, day: 31 });
    expect(parseYearEndMmdd(' 06-30 ')).toEqual({ month: 6, day: 30 });
  });

  it('falls back to 31 May for anything malformed — a card always carries a date', () => {
    expect(parseYearEndMmdd('')).toEqual({ month: 5, day: 31 });
    expect(parseYearEndMmdd(null)).toEqual({ month: 5, day: 31 });
    expect(parseYearEndMmdd('rubbish')).toEqual({ month: 5, day: 31 });
    expect(parseYearEndMmdd('13-01')).toEqual({ month: 5, day: 31 });
    expect(parseYearEndMmdd('00-00')).toEqual({ month: 5, day: 31 });
  });
});

describe('yearlyValidUntilLabel', () => {
  it('at the built-in 31 May year end it reproduces the historic label exactly', () => {
    expect(yearlyValidUntilLabel(new Date('2026-09-02T10:00:00'))).toBe(
      defaultValidUntilLabel(new Date('2026-09-02T10:00:00'))
    );
    expect(yearlyValidUntilLabel(new Date('2026-07-24T10:00:00'))).toBe('31 May 2027');
    expect(yearlyValidUntilLabel(new Date('2027-02-10T10:00:00'))).toBe('31 May 2027');
  });

  it('honours a different academic-year end from policy', () => {
    // Year end 30 June: in September the next occurrence is June of next year.
    expect(yearlyValidUntilLabel(new Date('2026-09-02T10:00:00'), '06-30')).toBe('30 Jun 2027');
    // In April the next occurrence is still this June.
    expect(yearlyValidUntilLabel(new Date('2027-04-02T10:00:00'), '06-30')).toBe('30 Jun 2027');
  });
});

describe('parseValidityPolicy', () => {
  it('reads the validity block out of the policy JSONB', () => {
    expect(
      parseValidityPolicy({
        validity: { learner_mode: 'yearly', team_member_mode: 'yearly', year_end_mmdd: '06-30' }
      })
    ).toEqual({ learnerMode: 'yearly', teamMemberMode: 'yearly', yearEndMmdd: '06-30' });
  });

  it('fails soft to the Director rules when the block is absent or junk', () => {
    // A database that predates migration 20260902010000 returns no validity key.
    expect(parseValidityPolicy({ ribbon_type: 'YMCKO' })).toEqual(DEFAULT_VALIDITY_POLICY);
    expect(parseValidityPolicy(null)).toEqual(DEFAULT_VALIDITY_POLICY);
    expect(parseValidityPolicy('not an object')).toEqual(DEFAULT_VALIDITY_POLICY);
    expect(parseValidityPolicy({ validity: { learner_mode: 'nonsense' } })).toEqual(
      DEFAULT_VALIDITY_POLICY
    );
  });
});

describe('resolveValidUntilLabel', () => {
  it('a learner with a batch gets their course end date, not one year', () => {
    expect(
      resolveValidUntilLabel({ kind: 'learner', courseEndDate: '2028-05-31', now: NOW })
    ).toBe('31 May 2028');
    // The card prints the real end date, whatever day it falls on.
    expect(
      resolveValidUntilLabel({ kind: 'learner', courseEndDate: '2029-06-30', now: NOW })
    ).toBe('30 Jun 2029');
    // …and that is NOT what the yearly rule would have said.
    expect(
      resolveValidUntilLabel({ kind: 'learner', courseEndDate: '2028-05-31', now: NOW })
    ).not.toBe(defaultValidUntilLabel(NOW));
  });

  it('a learner with no batch falls back to the yearly rule', () => {
    expect(resolveValidUntilLabel({ kind: 'learner', courseEndDate: null, now: NOW })).toBe(
      defaultValidUntilLabel(NOW)
    );
    expect(resolveValidUntilLabel({ kind: 'learner', courseEndDate: '  ', now: NOW })).toBe(
      defaultValidUntilLabel(NOW)
    );
  });

  it('a team member always gets the yearly rule, even carrying a course end date', () => {
    expect(resolveValidUntilLabel({ kind: 'employee', courseEndDate: null, now: NOW })).toBe(
      defaultValidUntilLabel(NOW)
    );
    expect(
      resolveValidUntilLabel({ kind: 'employee', courseEndDate: '2028-05-31', now: NOW })
    ).toBe(defaultValidUntilLabel(NOW));
  });

  it('a college moved back to yearly learner cards gets the yearly rule again', () => {
    expect(
      resolveValidUntilLabel({
        kind: 'learner',
        courseEndDate: '2028-05-31',
        policy: { learnerMode: 'yearly', teamMemberMode: 'yearly', yearEndMmdd: '05-31' },
        now: NOW
      })
    ).toBe('31 May 2027');
  });

  it('uses the policy year end for every fallback, learner and team member alike', () => {
    const policy = {
      learnerMode: 'course_end' as const,
      teamMemberMode: 'yearly' as const,
      yearEndMmdd: '06-30'
    };
    expect(resolveValidUntilLabel({ kind: 'learner', courseEndDate: null, policy, now: NOW })).toBe(
      '30 Jun 2027'
    );
    expect(
      resolveValidUntilLabel({ kind: 'employee', courseEndDate: null, policy, now: NOW })
    ).toBe('30 Jun 2027');
  });

  it('never prints a junk end date — a non-ISO value degrades to the yearly rule', () => {
    expect(
      resolveValidUntilLabel({ kind: 'learner', courseEndDate: 'sometime in 2028', now: NOW })
    ).toBe(defaultValidUntilLabel(NOW));
    expect(resolveValidUntilLabel({ kind: 'learner', courseEndDate: '2028', now: NOW })).toBe(
      defaultValidUntilLabel(NOW)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-13 — the inlined bitmap must be named ONCE.
// Naming it on both `href` and `xlink:href` doubled the payload: a 3.6 MB photo
// became ~10.2 MB of XML, the rasteriser refused it ("Buffer size limit
// exceeded") and the whole card 500-ed. 467 learner photos are over 2 MB.
// ─────────────────────────────────────────────────────────────────────────────
describe('svgCoverImageDataUrl payload size', () => {
  // A real 1x1 PNG — the helper parses the header for dimensions and returns
  // null for anything it cannot read, so a synthetic payload will not do.
  const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  function decode(dataUrl: string | null): string {
    expect(dataUrl).not.toBeNull();
    return Buffer.from(
      (dataUrl as string).replace('data:image/svg+xml;base64,', ''),
      'base64'
    ).toString('utf8');
  }

  it('inlines the bitmap exactly once, not twice', () => {
    const svg = decode(svgCoverImageDataUrl(PNG_1x1, 300, 380));
    expect(svg.split(PNG_1x1).length - 1).toBe(1);
  });

  it('never emits a bare href alongside xlink:href for the same bitmap', () => {
    const svg = decode(svgCoverImageDataUrl(PNG_1x1, 300, 380));
    expect(svg).toContain(`xlink:href="${PNG_1x1}"`);
    expect(svg).not.toContain(` href="${PNG_1x1}"`);
    expect(svg).toContain('xmlns:xlink=');
  });

  it('rounded variant also inlines the bitmap once', () => {
    const svg = decode(svgCoverImageDataUrl(PNG_1x1, 300, 380, 12));
    expect(svg.split(PNG_1x1).length - 1).toBe(1);
    expect(svg).toContain('clipPath');
  });
});
