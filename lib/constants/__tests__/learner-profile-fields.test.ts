import { describe, it, expect } from 'vitest';
import {
  LEARNER_PROFILE_FIELDS,
  PROFILE_FIELD_GROUPS,
  PROFILE_FIELD_GROUP_LABELS,
  FIELD_BY_KEY,
  fieldsInGroup,
  groupRollupKey,
  isGroupRollupKey,
  parseGroupRollupKey,
  isKnownFieldKey,
  GROUP_ROLLUP_PREFIX,
  PROFILE_REQUIRED_FIELD_KEYS,
} from '../learner-profile-fields';

describe('learner profile field catalogue', () => {
  it('has exactly 33 fields', () => {
    expect(LEARNER_PROFILE_FIELDS).toHaveLength(33);
  });

  it('has unique keys', () => {
    const keys = LEARNER_PROFILE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the DB column name as the key', () => {
    // The key doubles as the query-string value and the RPC field_key, so
    // keeping it identical to the column removes a whole mapping layer.
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(field.key).toBe(field.column);
    }
  });

  it('never collides with the group-rollup namespace', () => {
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(field.key.startsWith(GROUP_ROLLUP_PREFIX)).toBe(false);
    }
  });

  it('declares 5 groups with these exact sizes', () => {
    expect(PROFILE_FIELD_GROUPS).toEqual([
      'admin_assignment',
      'basic_details',
      'academic_information',
      'contact_details',
      'accommodation',
    ]);
    expect(fieldsInGroup('admin_assignment')).toHaveLength(5);
    expect(fieldsInGroup('basic_details')).toHaveLength(12);
    expect(fieldsInGroup('academic_information')).toHaveLength(4);
    expect(fieldsInGroup('contact_details')).toHaveLength(7);
    expect(fieldsInGroup('accommodation')).toHaveLength(5);
  });

  it('labels every group', () => {
    for (const group of PROFILE_FIELD_GROUPS) {
      expect(PROFILE_FIELD_GROUP_LABELS[group]).toBeTruthy();
    }
  });

  it('assigns every field to a declared group and a non-empty label', () => {
    for (const field of LEARNER_PROFILE_FIELDS) {
      expect(PROFILE_FIELD_GROUPS).toContain(field.group);
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it('gives marks fields their sub-keys and no other field marksKeys', () => {
    const tenth = FIELD_BY_KEY.get('tenth_marks')!;
    const twelfth = FIELD_BY_KEY.get('twelfth_marks')!;
    expect(tenth.blankRule).toBe('marks');
    expect(tenth.marksKeys).toEqual(['max_marks', 'obtained_marks', 'percentage']);
    expect(twelfth.blankRule).toBe('marks');
    expect(twelfth.marksKeys).toEqual(['group', 'max_marks', 'obtained_marks', 'percentage']);

    for (const field of LEARNER_PROFILE_FIELDS) {
      if (field.blankRule === 'marks') expect(field.marksKeys?.length).toBeGreaterThan(0);
      else expect(field.marksKeys).toBeUndefined();
    }
  });

  it('marks exactly the four conditional accommodation fields', () => {
    const conditional = LEARNER_PROFILE_FIELDS.filter((f) => f.appliesWhen !== 'always');
    expect(conditional.map((f) => f.key).sort()).toEqual([
      'hostel_category_id',
      'mess_category_id',
      'transport_route_id',
      'transport_stop_id',
    ]);
    expect(FIELD_BY_KEY.get('hostel_category_id')!.appliesWhen).toBe('hostel');
    expect(FIELD_BY_KEY.get('mess_category_id')!.appliesWhen).toBe('hostel');
    expect(FIELD_BY_KEY.get('transport_route_id')!.appliesWhen).toBe('day_scholar_with_bus');
    expect(FIELD_BY_KEY.get('transport_stop_id')!.appliesWhen).toBe('day_scholar_with_bus');
  });

  it('keeps the four completeness-defining fields present and text/uuid ruled', () => {
    // Frozen by the spec (D4): these four still define complete/incomplete.
    for (const key of ['college_email', 'academic_year_id', 'semester_id', 'section_id']) {
      expect(FIELD_BY_KEY.has(key)).toBe(true);
    }
    expect(FIELD_BY_KEY.get('college_email')!.blankRule).toBe('text');
    expect(FIELD_BY_KEY.get('academic_year_id')!.blankRule).toBe('uuid');
  });

  it('gives every group at least one always-applicable field', () => {
    // The group rollup's applicable population is the full learner count, which
    // is only honest if the group can never be entirely inapplicable.
    for (const group of PROFILE_FIELD_GROUPS) {
      expect(fieldsInGroup(group).some((f) => f.appliesWhen === 'always')).toBe(true);
    }
  });

  describe('group rollup keys', () => {
    it('round-trips', () => {
      for (const group of PROFILE_FIELD_GROUPS) {
        const key = groupRollupKey(group);
        expect(isGroupRollupKey(key)).toBe(true);
        expect(parseGroupRollupKey(key)).toBe(group);
      }
    });

    it('rejects field keys and unknown groups', () => {
      expect(isGroupRollupKey('college_email')).toBe(false);
      expect(parseGroupRollupKey('college_email')).toBeNull();
      expect(parseGroupRollupKey('group:nope')).toBeNull();
    });
  });

  describe('isKnownFieldKey', () => {
    it('accepts catalogue keys only', () => {
      expect(isKnownFieldKey('student_email')).toBe(true);
      expect(isKnownFieldKey('group:basic_details')).toBe(false);
      expect(isKnownFieldKey('drop table learners_profiles')).toBe(false);
    });
  });

  it('freezes the four completeness-defining keys, excluding admission year', () => {
    // A complete profile can legitimately lack an admission year, and most do —
    // so it is filterable but never part of the completeness definition.
    expect([...PROFILE_REQUIRED_FIELD_KEYS].sort()).toEqual([
      'academic_year_id',
      'college_email',
      'section_id',
      'semester_id',
    ]);
    expect(PROFILE_REQUIRED_FIELD_KEYS.has('admission_year_id')).toBe(false);
  });
});
