// __tests__/lib/id-cards/render-helpers.test.ts
// Phase 2 — pure-helper coverage for the ID-card render engine.

import { describe, it, expect } from 'vitest';
import {
  initialsFromName,
  defaultValidUntilLabel,
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
