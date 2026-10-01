import { describe, expect, it } from 'vitest';

import type {
  HRJobApplication,
  PipelineCandidateRecord,
  PipelineJobSummary,
  RecruitmentPipelineResponse,
} from '@/types/hr-recruitment';
import {
  EMPTY_FILTERS,
  buildPipelineRows,
  computeView,
  countAdvancedFilters,
  experienceBand,
  filtersFromParams,
  filtersToParams,
  summarize,
  type PipelineFilters,
} from '@/app/(routes)/hr/recruitment/candidates/_lib/pipeline-model';

const NOW = Date.parse('2026-10-01T12:00:00Z');

function job(id: string, over: Partial<PipelineJobSummary> = {}): PipelineJobSummary {
  return {
    id, title: `Job ${id}`, job_code: `JC-${id}`, job_type: 'full_time',
    role_category: 'teaching_faculty', status: 'open', institution_id: 'inst-a',
    institution_name: 'College A', department_id: 'dept-1', department_name: 'Physics',
    city: 'Kumarapalayam', ...over,
  };
}

function app(id: string, over: Partial<HRJobApplication> = {}): HRJobApplication {
  return {
    id, job_id: 'j1', institution_id: 'inst-a', first_name: 'Asha', last_name: id,
    email: `${id}@x.com`, phone: '999', current_job_title: null, current_company: null,
    current_job_duration_months: null, experience_months: 30, qualification: 'M.Sc',
    worked_cities: ['Salem'], resume_url: 'https://drive/r', resume_filename: 'r.pdf',
    resume_size_bytes: null, drive_file_id: null, status: 'pending', reviewed_by: null,
    reviewed_at: null, review_notes: null, applicant_user_id: null, promoted_candidate_id: null,
    source: 'external_website', consent_at: null, utm_source: null,
    confirmation_email_sent_at: null, confirmation_email_error: null,
    submitted_at: '2026-09-29T10:00:00Z', created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z', ...over,
  };
}

function cand(id: string, over: Partial<PipelineCandidateRecord> = {}): PipelineCandidateRecord {
  return {
    id, institution_id: 'inst-b', name: `Cand ${id}`, email: `${id}@y.com`, phone: null,
    cvviz_url: null, role_category: 'non_teaching', role_title: 'Office Staff',
    status: 'pending_approval', is_emergency: false, source: 'hr_submission',
    submitted_at: '2026-08-01T10:00:00Z', job_id: null, ...over,
  } as PipelineCandidateRecord;
}

function data(over: Partial<RecruitmentPipelineResponse> = {}): RecruitmentPipelineResponse {
  return {
    applications: [], candidates: [], jobs: [job('j1'), job('j2', { role_category: 'medical', department_id: 'dept-2' })],
    institutions: [{ id: 'inst-a', name: 'College A' }, { id: 'inst-b', name: 'College B' }],
    ...over,
  };
}

const f = (over: Partial<PipelineFilters> = {}): PipelineFilters => ({ ...EMPTY_FILTERS, ...over });

describe('buildPipelineRows — one row per person-in-pipeline across jobs', () => {
  it('folds a promoted application into its candidate and keeps unlinked candidates', () => {
    const rows = buildPipelineRows(data({
      applications: [app('a1', { status: 'promoted', promoted_candidate_id: 'c1' }), app('a2')],
      candidates: [cand('c1', { status: 'joined', job_id: 'j1' }), cand('c2')],
    }));
    expect(rows).toHaveLength(3);
    const a1 = rows.find((r) => r.applicationId === 'a1')!;
    expect(a1.candidateId).toBe('c1');
    expect(a1.stage).toBe('joined');
    const c2 = rows.find((r) => r.candidateId === 'c2')!;
    expect(c2.source).toBe('direct');
    expect(c2.jobTitle).toBe('Office Staff');
    expect(c2.institutionName).toBe('College B');
    expect(c2.roleCategory).toBe('non_teaching');
  });

  it('counts how many jobs a person applied to, case-insensitively', () => {
    const rows = buildPipelineRows(data({
      applications: [app('a1', { email: 'Same@X.com' }), app('a2', { email: 'same@x.com', job_id: 'j2' })],
    }));
    expect(rows.every((r) => r.applicationsByPerson === 2)).toBe(true);
  });

  it('takes the category from the job, not the application', () => {
    const rows = buildPipelineRows(data({ applications: [app('a1', { job_id: 'j2' })] }));
    expect(rows[0].roleCategory).toBe('medical');
  });
});

describe('computeView — filters and facet counts', () => {
  const rows = buildPipelineRows(data({
    applications: [
      app('a1'),
      app('a2', { job_id: 'j2', experience_months: 0, source: 'internal', submitted_at: '2026-06-01T00:00:00Z' }),
      app('a3', { status: 'rejected', resume_url: '' }),
    ],
    candidates: [cand('c1', { is_emergency: true })],
  }));

  it('category tab counts ignore the selected category; stage chips ignore the selected stage', () => {
    const v = computeView(rows, f({ category: 'medical', stage: 'rejected' }), NOW);
    expect(v.filtered).toHaveLength(0);
    expect(v.categoryCounts.get('all')).toBe(1); // only a3 is rejected
    expect(v.categoryCounts.get('teaching_faculty')).toBe(1);
    expect(v.stageCounts.get('all')).toBe(1); // only a2 is medical
    expect(v.stageCounts.get('pending')).toBe(1);
  });

  it('applies the advanced filters', () => {
    expect(computeView(rows, f({ department: 'dept-2' }), NOW).filtered.map((r) => r.applicationId)).toEqual(['a2']);
    expect(computeView(rows, f({ experience: 'fresher' }), NOW).filtered).toHaveLength(1);
    expect(computeView(rows, f({ source: 'direct' }), NOW).filtered).toHaveLength(1);
    expect(computeView(rows, f({ emergency: true }), NOW).filtered[0].candidateId).toBe('c1');
    expect(computeView(rows, f({ hasResume: true }), NOW).filtered.map((r) => r.key).sort())
      .toEqual(['app-a1', 'app-a2']);
    expect(computeView(rows, f({ city: 'salem' }), NOW).filtered).toHaveLength(3);
    expect(computeView(rows, f({ applied: '7' }), NOW).filtered.map((r) => r.applicationId).sort())
      .toEqual(['a1', 'a3']);
    expect(computeView(rows, f({ applied: 'custom', from: '2026-05-01', to: '2026-06-30' }), NOW)
      .filtered.map((r) => r.applicationId)).toEqual(['a2']);
  });

  it('search matches every term across person and job fields', () => {
    expect(computeView(rows, f({ q: 'asha jc-j2' }), NOW).filtered.map((r) => r.applicationId)).toEqual(['a2']);
  });
});

describe('experience bands', () => {
  it.each([[0, 'fresher'], [11, 'under_2'], [24, '2_5'], [60, '5_10'], [120, '10_plus'], [null, null]] as const)(
    '%s months → %s', (m, band) => expect(experienceBand(m)).toBe(band),
  );
});

describe('URL round-trip', () => {
  it('writes only non-default values and reads them back', () => {
    const value = f({ q: 'asha', category: 'medical', stage: 'shortlisted', emergency: true, size: 50, page: 3 });
    const params = filtersToParams(value);
    expect(params.toString()).toBe('q=asha&category=medical&stage=shortlisted&emergency=1&page=3&size=50');
    expect(filtersFromParams(params)).toEqual(value);
  });

  it('drops custom dates unless the range is custom, and ignores junk', () => {
    expect(filtersToParams(f({ applied: '30', from: '2026-01-01' })).has('from')).toBe(false);
    const junk = filtersFromParams(new URLSearchParams('category=bogus&size=7&page=-2&from=yesterday'));
    expect(junk.category).toBe('all');
    expect(junk.size).toBe(25);
    expect(junk.page).toBe(1);
    expect(junk.from).toBeNull();
  });

  it('counts only advanced-panel filters for the badge', () => {
    expect(countAdvancedFilters(f({ q: 'x', category: 'medical', institution: 'i', multiJob: true }))).toBe(2);
  });
});

describe('summarize', () => {
  it('reports totals, this week, in approval, joined and website share', () => {
    const rows = buildPipelineRows(data({
      applications: [app('a1'), app('a2', { source: 'internal', submitted_at: '2026-06-01T00:00:00Z' })],
      candidates: [cand('c1', { status: 'joined' })],
    }));
    expect(summarize(rows, NOW)).toEqual({ total: 3, newThisWeek: 1, inApproval: 0, joined: 1, websiteShare: 33 });
  });
});
