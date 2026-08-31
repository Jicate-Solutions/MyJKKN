import { describe, it, expect } from 'vitest';
import { createLearnerSchema, createLearnerWithDefaults } from '../learner-create-schema';

const validInput = {
  first_name: 'AARTHI',
  last_name: 'KUMAR',
  date_of_birth: '2004-08-15',
  gender: 'Female',
  religion: 'HINDU',
  community: 'BC',
  caste: 'VANNIYAR',
  father_name: 'KUMAR R',
  father_mobile: '9876543210',
  mother_name: 'LAKSHMI K',
  mother_mobile: '9876543211',
  institution_id: '00000000-0000-0000-0000-000000000001',
  degree_id: '00000000-0000-0000-0000-000000000002',
  department_id: '00000000-0000-0000-0000-000000000003',
  program_id: '00000000-0000-0000-0000-000000000004',
  semester_id: '00000000-0000-0000-0000-000000000005',
  section_id: '00000000-0000-0000-0000-000000000006',
  academic_year_id: '00000000-0000-0000-0000-000000000007',
  student_mobile: '9876543212',
  college_email: 'aarthi.k@jkkn.ac.in',
  permanent_address_street: '12 GANDHI ST',
  permanent_address_taluk: 'KOMARAPALAYAM',
  permanent_address_district: 'NAMAKKAL',
  permanent_address_pin_code: '637303',
  permanent_address_state: 'TAMIL NADU',
  entry_type: 'FIRST YEAR',
  scholarship_type: 'NOT APPLICABLE',
  accommodation_type: 'DAY SCHOLAR',
};

describe('createLearnerSchema', () => {
  it('accepts a fully-valid 28-required-field payload', () => {
    const result = createLearnerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects when first_name is missing', () => {
    const { first_name: _drop, ...rest } = validInput;
    const result = createLearnerSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'first_name')).toBe(true);
    }
  });

  it('rejects college_email not ending with @jkkn.ac.in', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      college_email: 'aarthi@gmail.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mobile fields with non-10-digit values', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      student_mobile: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 5-digit pin code', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      permanent_address_pin_code: '63730',
    });
    expect(result.success).toBe(false);
  });

  it('rejects FK fields that are not valid UUIDs', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      institution_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts accommodation_type=HOSTEL with only category FKs', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      accommodation_type: 'HOSTEL',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional fields (e.g. blood_group, neet_score) when present', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      blood_group: 'O+',
      neet_score: '650',
    });
    expect(result.success).toBe(true);
  });

  it('createLearnerWithDefaults backfills last_school + board_of_study to empty strings when absent', () => {
    const out = createLearnerWithDefaults(validInput);
    expect(out.last_school).toBe('');
    expect(out.board_of_study).toBe('');
  });

  it('accepts empty strings for unselected optional dropdowns (form-emitted default)', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      blood_group: '',
      quota: '',
      regulation_id: '',
      batch_id: '',
      admission_year_id: '',
    });
    expect(result.success).toBe(true);
  });

  it('createLearnerWithDefaults coerces null last_school/board_of_study to empty string', () => {
    const out = createLearnerWithDefaults({
      ...validInput,
      // @ts-expect-error — exercising the null path explicitly
      last_school: null,
      // @ts-expect-error — exercising the null path explicitly
      board_of_study: null,
    });
    expect(out.last_school).toBe('');
    expect(out.board_of_study).toBe('');
  });
});
