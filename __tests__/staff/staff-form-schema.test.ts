// __tests__/staff/staff-form-schema.test.ts
//
// BUG-005982 / BUG-005983 — a HOD could not save two published teaching staff
// records. Both held a qualification with no year ("PG Diploma, Forensic
// Odontology" has no year or institution either). The form resolver validated
// the full public-profile schema on EVERY save, and the invalid handler only
// knew basic fields, so the click did nothing and said nothing. 20 active staff
// were in that state on 2026-09-15.
//
// Option B (owner's choice): the fields stay REQUIRED for a published profile,
// but a save must never fail silently, and a draft save must not be blocked by
// public-profile fields.

import { describe, expect, it } from 'vitest';
import {
  buildStaffSchema,
  describeProfileIssues,
  extendedStaffSchema
} from '@/app/(routes)/staff/list/_components/staff-form-schema';

const qualificationsWithoutYear = [
  { degree: 'BDS', institution: 'J.K.K. Natarajah Dental College', year: 1996 },
  { degree: 'PG Diploma', specialization: 'Forensic Odontology' },
  { degree: 'Ph.D', institution: 'Bharath University' }
];

function staffRecord(overrides: Record<string, unknown> = {}) {
  return {
    first_name: 'DR. JAGADESAN',
    last_name: 'N',
    gender: 'male',
    date_of_birth: new Date('1986-05-28'),
    marital_status: 'married',
    email: 'jagadesan.n@jkkn.ac.in',
    institution_email: 'jagadesan.n@jkkn.ac.in',
    phone: '9994184464',
    state: 'Tamil Nadu',
    district: 'Salem',
    date_of_joining: new Date('2020-01-31'),
    designation: 'Reader',
    category_id: 'c68a5dda-4a6b-470d-a651-c12fff972927',
    role_key: 'faculty',
    institution_id: 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
    department_id: '4679e9da-15ad-4a1a-95e3-622f18728239',
    is_active: true,
    login_enabled: true,
    tags: [],
    has_extended_profile: true,
    slug: 'dr-n-jagadesaan',
    status: 'published',
    display_order: 0,
    experience_years: 0,
    research_papers: 1,
    phd_scholars: 0,
    awards_won: 0,
    pg_dissertations_guided: 0,
    ug_projects_guided: 0,
    badges: [],
    qualifications: qualificationsWithoutYear,
    specialisations: [],
    experience_entries: [],
    research_focus_areas: [],
    publications: [],
    funded_projects: [],
    certifications: [],
    awards: [],
    memberships: [],
    phd_scholars_list: [],
    faqs: [],
    achievements: [],
    ...overrides
  };
}

describe('staff edit form resolver (BUG-005982, BUG-005983)', () => {
  it('does not block a save on public-profile repeater fields', () => {
    const result = buildStaffSchema(false).safeParse(staffRecord());
    expect(result.success).toBe(true);
  });

  it('keeps the repeater data intact through the resolver', () => {
    const result = buildStaffSchema(false).safeParse(staffRecord());
    expect(result.success && result.data.qualifications).toEqual(qualificationsWithoutYear);
  });

  it('still enforces the basic rules the resolver owned before', () => {
    const result = buildStaffSchema(false).safeParse(
      staffRecord({ institution_email: '' })
    );
    expect(result.success).toBe(false);
  });
});

describe('publishing still requires complete qualifications (option B)', () => {
  it('rejects a qualification without a year, with a readable message', () => {
    const result = extendedStaffSchema.safeParse(staffRecord());
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toContain('Year is required');
    expect(messages).toContain('Institution is required');
  });

  it('accepts the same record once every qualification is complete', () => {
    const result = extendedStaffSchema.safeParse(
      staffRecord({
        qualifications: [
          { degree: 'BDS', institution: 'JKKN Dental College', year: 1996 },
          { degree: 'PG Diploma', institution: 'Some University', year: '2008' }
        ]
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('describeProfileIssues — the error must say where to look', () => {
  it('names the first field, counts every problem, and labels the row', () => {
    const result = extendedStaffSchema.safeParse(staffRecord());
    expect(result.success).toBe(false);
    if (result.success) return;

    const summary = describeProfileIssues(result.error.issues);
    expect(summary.firstField).toBe('qualifications');
    expect(summary.count).toBe(result.error.issues.length);
    expect(summary.firstMessage).toMatch(/^Qualification 2: /);
  });

  it('returns an empty summary when there are no issues', () => {
    expect(describeProfileIssues([])).toEqual({
      firstField: undefined,
      count: 0,
      firstMessage: ''
    });
  });
});
