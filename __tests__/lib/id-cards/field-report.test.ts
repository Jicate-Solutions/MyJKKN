// __tests__/lib/id-cards/field-report.test.ts
// 2026-09-07 — the per-field report behind the red highlighting in every ID-card
// preview. Two promises are pinned: a value the card prints blank is reported
// with value=null, and a permanent address the Address Check page would flag
// is reported with `problem` set — from the SAME classifier, so the two screens
// can never disagree about a record.

import { describe, it, expect } from 'vitest';
import { addressProblemOf, buildFieldReport, missingFields, problemFields } from '@/lib/id-cards/field-report';
import { assessAddress } from '@/lib/id-cards/address-quality';
import type { CardPersonData } from '@/lib/id-cards/render-data';

const CLEAN_ADDRESS = {
  street: '12 Bharathi Street',
  taluk: 'Kumarapalayam',
  district: 'Namakkal',
  state: 'Tamil Nadu',
  pinCode: '638183'
};

const learner = (over: Partial<CardPersonData> = {}): CardPersonData => ({
  kind: 'learner',
  fullName: 'DHIVYABHARATHI M',
  rollNumber: 'EC25011',
  registerNumber: null,
  designation: null,
  courseName: 'B.E. ECE',
  departmentName: 'ECE',
  institutionName: 'JKKN College of Engineering and Technology',
  isSchool: false,
  institutionEmail: 'info@jkkn.ac.in',
  institutionPhone: '04288 274741',
  institutionAddress: 'Kumarapalayam, Namakkal 638183',
  qrValue: '348295-7',
  photoCandidates: [],
  valueBag: {},
  bloodGroup: 'O+',
  dateOfBirthLabel: '01 Jan 2007',
  guardianName: 'Father',
  guardianPhone: '9876543210',
  address: '12 Bharathi Street, Kumarapalayam, Namakkal, Tamil Nadu, 638183',
  addressParts: CLEAN_ADDRESS,
  contactPhone: '9876543211',
  idCode: 'EC25011',
  studyPeriod: '2025-2029',
  staffId: null,
  courseEndDate: null,
  ...over
});

const complete = (person: CardPersonData, over: Partial<Parameters<typeof buildFieldReport>[0]> = {}) =>
  buildFieldReport({
    person,
    validUntilLabel: '30 May 2029',
    photoResolved: true,
    qrResolved: true,
    signatureResolved: true,
    backConfigured: true,
    ...over
  });

describe('buildFieldReport — blanks', () => {
  it('a complete learner on a two-sided template reports nothing missing or wrong', () => {
    const fields = complete(learner());
    expect(missingFields(fields)).toEqual([]);
    expect(problemFields(fields)).toEqual([]);
    expect(fields.map((f) => f.key)).toEqual([
      'name',
      'roll_number',
      'course',
      'department',
      'institution',
      'study_period',
      'valid_until',
      'photo',
      'qr_code',
      'blood_group',
      'date_of_birth',
      'guardian',
      'guardian_phone',
      'address',
      'contact_phone',
      'barcode',
      'institution_email',
      'institution_phone',
      'institution_address'
    ]);
  });

  it('reports every blank the card would print, front and back', () => {
    const fields = complete(learner({ rollNumber: '  ', studyPeriod: null, bloodGroup: null, institutionEmail: null }), {
      photoResolved: false,
      qrResolved: false
    });
    expect(missingFields(fields).map((f) => `${f.side}:${f.key}`)).toEqual([
      'front:roll_number',
      'front:study_period',
      'front:photo',
      'front:qr_code',
      'back:blood_group',
      'back:institution_email'
    ]);
  });

  it('back rows are not reported when the template has no back side', () => {
    const fields = complete(learner({ bloodGroup: null, address: null }), { backConfigured: false });
    expect(fields.every((f) => f.side === 'front')).toBe(true);
    expect(missingFields(fields)).toEqual([]);
  });

  it('principal rows appear only when the template intends a principal block', () => {
    expect(complete(learner()).some((f) => f.key === 'principal_signature')).toBe(false);
    const withPrincipal = complete(learner({ principalName: 'Dr. X', principalSignatureUrl: 'sig.png' }), {
      signatureResolved: false
    });
    expect(missingFields(withPrincipal).map((f) => f.key)).toEqual(['principal_signature']);
  });

  it('team members report Staff ID / Designation instead of Roll Number / Course', () => {
    const fields = complete(
      learner({ kind: 'employee', staffId: null, designation: 'Assistant Professor', addressParts: null })
    );
    expect(fields.some((f) => f.key === 'roll_number')).toBe(false);
    expect(missingFields(fields).map((f) => f.key)).toEqual(['staff_id']);
  });
});

describe('buildFieldReport — address check integration', () => {
  it('a clean address has no problem', () => {
    const row = complete(learner()).find((f) => f.key === 'address');
    expect(row?.value).not.toBeNull();
    expect(row?.problem).toBeUndefined();
  });

  it('two different PIN codes is reported as a critical problem with the fix', () => {
    const parts = { ...CLEAN_ADDRESS, street: '12 Bharathi Street, Namakkal 636005' };
    const row = complete(learner({ addressParts: parts })).find((f) => f.key === 'address');
    expect(row?.value).not.toBeNull();
    expect(row?.problem).toContain('Two different PIN codes');
    expect(row?.problem).toContain('636005');
    expect(row?.problem).toContain('638183');
    expect(row?.problem_severity).toBe('critical');
    expect(row?.problem_fix).toMatch(/PIN code/);
    expect(problemFields(complete(learner({ addressParts: parts }))).map((f) => f.key)).toEqual(['address']);
  });

  it('a phone number inside the street is a problem', () => {
    const parts = { ...CLEAN_ADDRESS, street: '12 Bharathi Street, mobile 9876543210' };
    const row = complete(learner({ addressParts: parts })).find((f) => f.key === 'address');
    expect(row?.problem).toContain('Phone number inside the address');
  });

  it('an address that is merely long or repeats the district does NOT turn red', () => {
    // Over the 60-char default-back cut, under the 80-char every-layout cut,
    // and the district repeated in the street — readable, prints in full on a
    // designed back. Flagging this would paint most of a college red.
    const parts = { ...CLEAN_ADDRESS, street: '12 Bharathi St, Namakkal' };
    const assessment = assessAddress(parts);
    expect(assessment.overDefaultBack).toBe(true);
    expect(assessment.overCustomBack).toBe(false);
    expect(assessment.issues).toContain('duplicated_part');
    expect(addressProblemOf(assessment)).toBeNull();
  });

  it('an address cut off on EVERY layout is a problem (medium)', () => {
    const parts = {
      ...CLEAN_ADDRESS,
      street: '12 Bharathi Street, Behind the old Panchayat office, Near the government hospital road'
    };
    const found = addressProblemOf(assessAddress(parts));
    expect(found?.severity).toBe('medium');
    expect(found?.problem).toContain('Too long');
  });

  it('an empty address is a blank, not a problem', () => {
    const row = complete(
      learner({ address: null, addressParts: { street: '', taluk: '', district: '', state: '', pinCode: '' } })
    ).find((f) => f.key === 'address');
    expect(row?.value).toBeNull();
    expect(problemFields([row!])).toEqual([]);
  });
});
