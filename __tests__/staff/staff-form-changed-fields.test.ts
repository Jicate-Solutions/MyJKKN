// pickChangedStaffFields: what an EDIT of a team-member record sends (2026-10-03).
import { describe, expect, it } from 'vitest';
import { pickChangedStaffFields } from '@/app/(routes)/staff/list/_components/staff-form-changed-fields';

const PAYLOAD = {
  phone: '9111111111', gender: 'male', marital_status: 'single', status: 'published',
  biometric_id: '42', biometric_institution_id: 'inst-1', state: 'Tamil Nadu', district: 'Namakkal',
  emergency_contact_relationship: 'Aunt', category_id: 'cat-1', department_id: null, qualifications: [{ degree: 'MSc' }],
};

describe('pickChangedStaffFields', () => {
  it('sends only the dirty fields, never the defaults the form filled in', () => {
    expect(pickChangedStaffFields(PAYLOAD, { phone: true })).toEqual({ phone: '9111111111' });
  });

  it('keeps coupled columns together', () => {
    expect(pickChangedStaffFields(PAYLOAD, { biometric_id: true })).toEqual({ biometric_id: '42', biometric_institution_id: 'inst-1' });
    expect(pickChangedStaffFields(PAYLOAD, { district: true })).toEqual({ state: 'Tamil Nadu', district: 'Namakkal' });
    expect(pickChangedStaffFields(PAYLOAD, { emergency_contact_relationship_other: true }))
      .toEqual({ emergency_contact_relationship: 'Aunt' });
    expect(pickChangedStaffFields(PAYLOAD, { category_id: true })).toEqual({ category_id: 'cat-1', department_id: null });
    // a college move sends the cleared department with it
    expect(pickChangedStaffFields({ ...PAYLOAD, institution_id: 'inst-2' }, { institution_id: true }))
      .toEqual({ institution_id: 'inst-2', department_id: null });
  });

  it('reads nested dirtiness (lists), ignores untouched entries, and adds what the caller names', () => {
    expect(pickChangedStaffFields(PAYLOAD, { qualifications: [{ degree: true }] })).toEqual({ qualifications: [{ degree: 'MSc' }] });
    expect(pickChangedStaffFields(PAYLOAD, { qualifications: [{ degree: false }], gender: false })).toEqual({});
    expect(pickChangedStaffFields(PAYLOAD, {}, ['status'])).toEqual({ status: 'published' });
  });
});
