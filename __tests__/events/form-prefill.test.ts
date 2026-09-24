// __tests__/events/form-prefill.test.ts
//
// "Prefill from profile" on public registration forms is a pure mapping;
// pin the precedence (learner/staff rows over the profile), the name lookups,
// and that seeding never overwrites what the person already typed.

import { describe, it, expect } from 'vitest';
import {
  applyRegistrationPrefill,
  buildRegistrationPrefill,
  isRegistrationPrefillSource,
  REGISTRATION_PREFILL_SOURCES,
} from '@/lib/services/events/registration/form-prefill';

const names = {
  institutions: { i1: 'JKKN College of Engineering and Technology' },
  departments: { d1: 'Computer Science' },
  degrees: { g1: 'B.E.' },
  programs: { p1: 'B.E. CSE' },
};

describe('buildRegistrationPrefill', () => {
  it('a learner: learner row wins, profile fills gaps, ids resolve to names', () => {
    const p = buildRegistrationPrefill({
      profile: { full_name: 'Profile Name', email: 'p@x', phone_number: '111', institution_id: 'i1' },
      learner: {
        first_name: 'Anu',
        last_name: 'K',
        college_email: 'anu@jkkn.ac.in',
        student_mobile: '999',
        roll_number: 'R1',
        register_number: 'REG1',
        institution_id: 'i1',
        department_id: 'd1',
        degree_id: 'g1',
        program_id: 'p1',
        date_of_birth: '2005-03-04T00:00:00+00:00',
      },
      names,
    });
    expect(p).toEqual({
      full_name: 'Anu K',
      email: 'anu@jkkn.ac.in',
      phone: '999',
      date_of_birth: '2005-03-04',
      person_type: 'Learner',
      institution: 'JKKN College of Engineering and Technology',
      department: 'Computer Science',
      degree: 'B.E.',
      program: 'B.E. CSE',
      roll_number: 'R1',
      register_number: 'REG1',
    });
  });

  it('a learning facilitator: staff row supplies employee id and designation', () => {
    const p = buildRegistrationPrefill({
      profile: { full_name: 'Dr X', email: 'x@jkkn.ac.in' },
      staff: { staff_id: 'EMP42', designation: 'Assistant Professor', department_id: 'd1', phone: '777' },
      names,
    });
    expect(p.person_type).toBe('Learning Facilitator');
    expect(p.staff_id).toBe('EMP42');
    expect(p.designation).toBe('Assistant Professor');
    expect(p.department).toBe('Computer Science');
    expect(p.full_name).toBe('Dr X');
    expect(p.phone).toBe('777');
    expect(p.roll_number).toBeUndefined();
  });

  it('a profile with neither row still yields name/email; unknown ids yield nothing', () => {
    const p = buildRegistrationPrefill({
      profile: { full_name: 'Admin', email: 'a@x', institution_id: 'nope' },
    });
    expect(p).toEqual({ full_name: 'Admin', email: 'a@x' });
  });
});

describe('applyRegistrationPrefill', () => {
  const fields = [
    { field_key: 'name', prefill_source: 'full_name' },
    { field_key: 'roll', prefill_source: 'roll_number' },
    { field_key: 'free', prefill_source: null },
    { field_key: 'bad', prefill_source: 'not_a_source' },
  ];
  const prefill = { full_name: 'Anu K', roll_number: 'R1' };

  it('seeds empty answers only, keeps typed ones, ignores unknown sources', () => {
    const out = applyRegistrationPrefill(fields, prefill, { roll: 'typed', free: 'x' });
    expect(out).toEqual({ roll: 'typed', free: 'x', name: 'Anu K' });
  });

  it('returns the same object when nothing changes', () => {
    const current = { name: 'already', roll: 'R9' };
    expect(applyRegistrationPrefill(fields, prefill, current)).toBe(current);
    expect(applyRegistrationPrefill(fields, {}, current)).toBe(current);
  });
});

describe('catalog', () => {
  it('every catalog value passes the guard and is unique', () => {
    const vals = REGISTRATION_PREFILL_SOURCES.map((s) => s.value);
    expect(new Set(vals).size).toBe(vals.length);
    for (const v of vals) expect(isRegistrationPrefillSource(v)).toBe(true);
    expect(isRegistrationPrefillSource('email_address')).toBe(false);
  });
});
