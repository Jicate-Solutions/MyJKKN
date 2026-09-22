import { describe, expect, it } from 'vitest';
import { isJobVisible, toPublicJob } from '@/lib/services/hr/public-careers/public-job';

/**
 * toPublicJob is the whole privacy boundary of the public careers API: rows are
 * read with the service-role client, so whatever this mapper emits is what the
 * internet sees. These tests pin the key set and the salary gate.
 */

const NOW = new Date('2026-09-21T10:00:00Z');
const ROW = {
  id: 'j1', job_code: 'JOB-001', title: 'Assistant Professor', role_category: 'teaching_faculty',
  job_type: 'full_time', description: 'Teach', institution_id: 'i1',
  city: 'Komarapalayam', state: 'Tamil Nadu', country: 'India', education_level: 'masters',
  min_experience_years: 1, max_experience_years: 5,
  requirements: { qualifications: ['M.E'], skills: ['Python'], internal_note: 'x' },
  positions_open: 2, posted_at: '2026-09-01T00:00:00Z', closes_at: null,
  status: 'open', is_public: true, display_salary: false,
  min_monthly_salary: 30000, max_monthly_salary: 50000, salary_currency: 'INR', salary_duration: 'per_month',
  hr_organization_id: 'secret-org', created_by: 'secret-user', positions_filled: 1,
  institution: { id: 'i1', name: 'JKKN College of Pharmacy' },
  department: { id: 'd1', department_name: 'Pharmaceutics' },
};

describe('isJobVisible', () => {
  it('is visible when public, open and not expired', () => {
    expect(isJobVisible(ROW, NOW)).toBe(true);
  });
  it.each([
    ['not public', { is_public: false }],
    ['draft', { status: 'draft' }],
    ['closed', { status: 'closed' }],
    ['expired', { closes_at: '2026-09-20T00:00:00Z' }],
  ])('is hidden when %s', (_l, patch) => {
    expect(isJobVisible({ ...ROW, ...patch }, NOW)).toBe(false);
  });
  it('is visible when closes_at is in the future', () => {
    expect(isJobVisible({ ...ROW, closes_at: '2026-10-01T00:00:00Z' }, NOW)).toBe(true);
  });
});

describe('toPublicJob', () => {
  it('returns exactly the whitelisted keys', () => {
    expect(Object.keys(toPublicJob(ROW)).sort()).toEqual([
      'city', 'closes_at', 'country', 'department', 'description', 'education_level',
      'id', 'institution', 'job_code', 'job_type', 'max_experience_years', 'min_experience_years',
      'positions_open', 'posted_at', 'qualifications', 'role_category', 'salary', 'skills',
      'state', 'title',
    ]);
  });
  it('never leaks internal fields', () => {
    const json = JSON.stringify(toPublicJob(ROW));
    for (const s of ['secret-org', 'secret-user', 'internal_note', 'is_public']) expect(json).not.toContain(s);
  });
  it('hides salary unless display_salary', () => {
    expect(toPublicJob(ROW).salary).toBeNull();
    expect(toPublicJob({ ...ROW, display_salary: true }).salary).toEqual({
      min: 30000, max: 50000, currency: 'INR', duration: 'per_month',
    });
  });
  it('flattens requirements and department', () => {
    const j = toPublicJob(ROW);
    expect(j.qualifications).toEqual(['M.E']);
    expect(j.skills).toEqual(['Python']);
    expect(j.department).toEqual({ id: 'd1', name: 'Pharmaceutics' });
  });
  it('tolerates missing requirements and relations', () => {
    const j = toPublicJob({ ...ROW, requirements: null, department: null, institution: null });
    expect(j.qualifications).toEqual([]);
    expect(j.department).toBeNull();
    expect(j.institution).toBeNull();
  });
});
