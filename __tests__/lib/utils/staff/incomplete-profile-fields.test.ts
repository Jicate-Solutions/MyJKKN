import { describe, it, expect } from 'vitest';
import {
  STAFF_REQUIRED_FIELDS,
  STAFF_OPTIONAL_FIELDS,
  STAFF_ALL_FIELDS,
  STAFF_FIELD_LABELS,
  fieldsForScope,
  isFieldMissing,
  computeMissingFields,
} from '@/lib/utils/staff/incomplete-profile-fields';

const COMPLETE_ROW = {
  first_name: 'Asha', last_name: 'Kumar', email: 'asha@jkkn.ac.in',
  phone: '9876543210', designation: 'Professor', date_of_birth: '1985-04-02',
  date_of_joining: '2015-06-01', staff_id: 'JKKN001',
  profile_picture: 'https://example.test/a.png', address: '12 Main St',
  state: 'Tamil Nadu', district: 'Namakkal', pincode: '637503',
  institution_email: 'asha@jkkn.ac.in', blood_group: 'O+',
  biometric_id: 'BIO001', biometric_institution_id: 'inst-uuid-1',
};

describe('field lists', () => {
  it('holds 7 required and 10 optional fields, 17 in total', () => {
    expect(STAFF_REQUIRED_FIELDS).toHaveLength(7);
    expect(STAFF_OPTIONAL_FIELDS).toHaveLength(10);
    expect(STAFF_ALL_FIELDS).toHaveLength(17);
  });

  it('labels every tracked field', () => {
    for (const field of STAFF_ALL_FIELDS) {
      expect(STAFF_FIELD_LABELS[field]).toBeTruthy();
    }
  });

  it('has no field in both lists', () => {
    const overlap = STAFF_REQUIRED_FIELDS.filter((f) =>
      (STAFF_OPTIONAL_FIELDS as readonly string[]).includes(f)
    );
    expect(overlap).toEqual([]);
  });
});

describe('fieldsForScope', () => {
  it('returns the required list for "required"', () => {
    expect(fieldsForScope('required')).toEqual(STAFF_REQUIRED_FIELDS);
  });
  it('returns the optional list for "optional"', () => {
    expect(fieldsForScope('optional')).toEqual(STAFF_OPTIONAL_FIELDS);
  });
  it('returns all 17 for "all"', () => {
    expect(fieldsForScope('all')).toHaveLength(17);
  });
});

describe('isFieldMissing', () => {
  it('treats null and undefined as missing', () => {
    expect(isFieldMissing(null)).toBe(true);
    expect(isFieldMissing(undefined)).toBe(true);
  });
  it('treats an empty string as missing', () => {
    expect(isFieldMissing('')).toBe(true);
  });
  it('treats a whitespace-only string as missing', () => {
    expect(isFieldMissing('   ')).toBe(true);
  });
  it('treats a real value as present', () => {
    expect(isFieldMissing('O+')).toBe(false);
  });
  it('treats false and 0 as present, not missing', () => {
    expect(isFieldMissing(false)).toBe(false);
    expect(isFieldMissing(0)).toBe(false);
  });
});

describe('computeMissingFields', () => {
  it('returns nothing for a fully populated row', () => {
    expect(computeMissingFields(COMPLETE_ROW, 'all')).toEqual([]);
  });

  it('returns human labels, not column names', () => {
    const row = { ...COMPLETE_ROW, profile_picture: null };
    expect(computeMissingFields(row, 'all')).toEqual(['Profile Picture']);
  });

  it('ignores optional gaps when scope is "required"', () => {
    const row = { ...COMPLETE_ROW, blood_group: null, address: '' };
    expect(computeMissingFields(row, 'required')).toEqual([]);
  });

  it('ignores required gaps when scope is "optional"', () => {
    const row = { ...COMPLETE_ROW, phone: null };
    expect(computeMissingFields(row, 'optional')).toEqual([]);
  });

  it('reports both when scope is "all"', () => {
    const row = { ...COMPLETE_ROW, phone: null, blood_group: '  ' };
    expect(computeMissingFields(row, 'all')).toEqual(['Phone', 'Blood Group']);
  });

  it('defaults to the "all" scope', () => {
    const row = { ...COMPLETE_ROW, pincode: null };
    expect(computeMissingFields(row)).toEqual(['Pincode']);
  });

  it('reports "Biometric Code" when biometric_id is missing', () => {
    const row = { ...COMPLETE_ROW, biometric_id: null };
    expect(computeMissingFields(row, 'all')).toEqual(['Biometric Code']);
  });

  it('reports "Biometric Machine" when biometric_institution_id is missing', () => {
    const row = { ...COMPLETE_ROW, biometric_institution_id: null };
    expect(computeMissingFields(row, 'all')).toEqual(['Biometric Machine']);
  });
});
