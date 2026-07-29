import { describe, expect, it } from 'vitest';
import {
  buildDivisionLabel,
  mapCustomAnswers,
  stringifyAnswer,
  type FormFieldDef,
} from '@/lib/services/events/shared/event-registrations-service';

describe('buildDivisionLabel', () => {
  it('joins sport, age band and gender', () => {
    expect(
      buildDivisionLabel({ sport: 'Volleyball', age_band: 'Age 19 to 22', gender: 'male' })
    ).toBe('Volleyball · Age 19 to 22 · male');
  });

  it('omits gender when it is open, since that is the implicit default', () => {
    expect(
      buildDivisionLabel({ sport: 'Volleyball', age_band: 'Age 19 to 22', gender: 'open' })
    ).toBe('Volleyball · Age 19 to 22');
  });

  it('omits a missing age band', () => {
    expect(buildDivisionLabel({ sport: 'Chess', age_band: null, gender: 'female' })).toBe(
      'Chess · female'
    );
  });

  it('falls back to the sport alone', () => {
    expect(buildDivisionLabel({ sport: 'Kabaddi', age_band: null, gender: null })).toBe('Kabaddi');
  });
});

describe('stringifyAnswer', () => {
  it('renders an em dash for empty values', () => {
    expect(stringifyAnswer(null)).toBe('—');
    expect(stringifyAnswer(undefined)).toBe('—');
    expect(stringifyAnswer('')).toBe('—');
    expect(stringifyAnswer('   ')).toBe('—');
    expect(stringifyAnswer([])).toBe('—');
  });

  it('joins multi-select arrays', () => {
    expect(stringifyAnswer(['Small', 'Medium'])).toBe('Small, Medium');
  });

  it('renders booleans as Yes / No', () => {
    expect(stringifyAnswer(true)).toBe('Yes');
    expect(stringifyAnswer(false)).toBe('No');
  });

  it('passes plain values through', () => {
    expect(stringifyAnswer('18-24')).toBe('18-24');
    expect(stringifyAnswer(42)).toBe('42');
  });
});

// Mirrors the real volleyball form: field_order restarts at 0 in the second
// section, which is exactly what makes sorting on it alone wrong.
const DEFS: FormFieldDef[] = [
  { field_key: 'field', field_label: 'Team Name?', section_order: 0, field_order: 0 },
  { field_key: 'team_captain_name', field_label: 'Team Captain Name?', section_order: 0, field_order: 1 },
  { field_key: 'team_captain_phone_number', field_label: 'Team Captain Phone Number?', section_order: 0, field_order: 2 },
  { field_key: 'college_name', field_label: 'College name?', section_order: 1, field_order: 0 },
  { field_key: 'players_name_details', field_label: 'Players Name Details?', section_order: 1, field_order: 1 },
  { field_key: 'age_category_-_is_it_18-24', field_label: 'Age Category - Is it 18-24?', section_order: 1, field_order: 2 },
];

describe('mapCustomAnswers', () => {
  it('returns nothing when there are no answers', () => {
    expect(mapCustomAnswers(null, DEFS)).toEqual([]);
    expect(mapCustomAnswers(undefined, DEFS)).toEqual([]);
    expect(mapCustomAnswers({}, DEFS)).toEqual([]);
  });

  it('resolves slug keys to the labels the registrant saw', () => {
    const result = mapCustomAnswers({ 'age_category_-_is_it_18-24': '18-24' }, DEFS);
    expect(result).toEqual([{ label: 'Age Category - Is it 18-24?', value: '18-24' }]);
  });

  it('orders by section first, then field — not by field order alone', () => {
    // Deliberately supplied out of order, and spanning both sections.
    const result = mapCustomAnswers(
      {
        college_name: 'JKKN Pharmacy',
        team_captain_phone_number: '9000000000',
        field: 'Eagles',
        players_name_details: 'A, B, C',
      },
      DEFS
    );
    expect(result.map((r) => r.label)).toEqual([
      'Team Name?', // section 0, field 0
      'Team Captain Phone Number?', // section 0, field 2
      'College name?', // section 1, field 0
      'Players Name Details?', // section 1, field 1
    ]);
  });

  it('keeps an answer whose field definition was deleted, labelled with its raw key, sorted last', () => {
    const result = mapCustomAnswers(
      { removed_question: 'still answered', field: 'Eagles' },
      DEFS
    );
    expect(result).toEqual([
      { label: 'Team Name?', value: 'Eagles' },
      { label: 'removed_question', value: 'still answered' },
    ]);
  });

  it('falls back to raw keys for every answer when no definitions exist', () => {
    const result = mapCustomAnswers({ some_key: 'value' }, []);
    expect(result).toEqual([{ label: 'some_key', value: 'value' }]);
  });

  it('stringifies values through stringifyAnswer', () => {
    const result = mapCustomAnswers({ field: ['A', 'B'], college_name: null }, DEFS);
    expect(result).toEqual([
      { label: 'Team Name?', value: 'A, B' },
      { label: 'College name?', value: '—' },
    ]);
  });
});
