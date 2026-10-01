import { describe, expect, it } from 'vitest';
import type { IntakeCandidate, IntakeDuplicate, IntakeMatchRule, ResumeExtract } from '@/types/hr-intake';
import { jobLabel, proposeMatch, titleScore, type MatchJob } from '@/lib/hr/intake/propose-match';
import { normaliseJobTitle } from '@/lib/hr/intake/normalise';
import fixture from './fixtures/open-jobs.json';

// Job titles live in the JSON fixture (the terminology gate reads .ts copy).
const J = fixture.jobs as Record<string, MatchJob>;
const T = fixture.titles;
const ALL: MatchJob[] = Object.values(J);
const GENERIC_NORM = normaliseJobTitle(T.generic);
const NONE: IntakeDuplicate = { kind: 'none', ref_id: null, note: null };

const cand = (job: string | null, extra: Partial<IntakeCandidate> = {}): IntakeCandidate => ({
  first_name: 'Demo',
  last_name: 'Person',
  email: 'demo.person@example.test',
  phone: '9876543210',
  phone_issue: null,
  qualification: null,
  current_job_title: null,
  current_company: null,
  cities: [],
  linkedin_url: null,
  cvviz_profile_url: null,
  cvviz_job_title: job,
  cvviz_job_code: null,
  applied_at: null,
  ...extra,
});

const extract = (subject: string | null): ResumeExtract => ({
  qualification: null,
  subject,
  experience_years: 4,
  current_role: null,
  summary: null,
});

const rule = (over: Partial<IntakeMatchRule>): IntakeMatchRule => ({
  id: 'r0000000-0000-4000-8000-000000000001',
  cvviz_job_title_norm: 'x',
  job_id: J.principal.id,
  job_title: null,
  created_by: 'u1',
  created_by_name: 'Kavitha Demo',
  created_at: '2026-09-30T10:00:00.000Z',
  times_used: 0,
  ...over,
});

const base = { extract: null, duplicate: NONE, openJobs: ALL, rules: [] as IntakeMatchRule[] };

describe('proposeMatch — duplicates come first', () => {
  it('a later row of the same person is skipped, pointing at the first', () => {
    const p = proposeMatch({
      ...base,
      candidate: cand(J.principal.title),
      duplicate: { kind: 'same_file', ref_id: 'row-1', note: 'Same person as row 1 in this file (same phone number)' },
      duplicate_of_job_title: J.principal.title,
      duplicate_of_row_index: 1,
    });
    // A shared phone alone is not proof of the same person: never high.
    expect(p).toMatchObject({ action: 'skip', confidence: 'medium', job_id: null });
    expect(p.reasons[0]).toBe('Same person as row 1 in this file (same phone number)');
    expect(p.reasons[1]).toMatch(/check this is the same person/);
  });

  it('is high only with the same email and an earlier row that can itself be filed', () => {
    const me = cand(J.principal.title);
    const input = {
      ...base,
      candidate: me,
      duplicate: { kind: 'same_file' as const, ref_id: 'row-1', note: 'Same person as row 1 in this file (same email)' },
      duplicate_of_job_title: J.principal.title,
      duplicate_of_row_index: 1,
      duplicate_of_candidate: { email: me.email?.toUpperCase() ?? null, phone: me.phone },
    };
    expect(proposeMatch({ ...input, duplicate_of_resume_uploaded: true }).confidence).toBe('high');
    expect(proposeMatch({ ...input, duplicate_of_resume_uploaded: false }).confidence).toBe('medium');
    expect(proposeMatch({ ...input, duplicate_of_candidate: { email: me.email, phone: null } }).confidence).toBe('medium');
  });

  it('flags when the same person applied to a different post on that row', () => {
    const p = proposeMatch({
      ...base,
      candidate: cand(T.vice_principal),
      duplicate: { kind: 'same_file', ref_id: 'row-1', note: 'Same person as row 1 in this file (same phone number)' },
      duplicate_of_job_title: J.principal.title,
      duplicate_of_row_index: 1,
    });
    expect(p.action).toBe('skip');
    expect(p.confidence).toBe('medium');
    expect(p.reasons[1]).toMatch(/row 1 is for/);
  });

  it('already in MyJKKN -> merge_existing, the record named on the duplicate', () => {
    const p = proposeMatch({
      ...base,
      candidate: cand(J.principal.title),
      duplicate: { kind: 'existing_application', ref_id: 'app-9', note: 'Already applied in MyJKKN (same email)' },
    });
    // Never high: the earlier record may be for another job (second review, blocker 3).
    expect(p).toMatchObject({ action: 'merge_existing', confidence: 'medium' });
    expect(p.reasons[0]).toBe('Already applied in MyJKKN (same email)');
    expect(p.reasons[1]).toMatch(/earlier record is for this job/);
  });
});

describe('proposeMatch — general pool', () => {
  it('"Candidates Database" or no job is not a job', () => {
    for (const job of ['Candidates Database', null, '']) {
      const p = proposeMatch({ ...base, candidate: cand(job) });
      expect(p).toMatchObject({ action: 'needs_new_job', confidence: 'low', job_id: null });
      expect(p.reasons[0]).toBe('Applied to the general pool, not a job');
    }
  });
});

describe('proposeMatch — learned rules win', () => {
  it('a rule for the normalised title routes to its job, credited; medium while the title fits other posts too', () => {
    const r = rule({ cvviz_job_title_norm: GENERIC_NORM, job_id: J.history.id });
    const p = proposeMatch({ ...base, candidate: cand(T.generic_caps), rules: [r] });
    expect(p).toMatchObject({
      action: 'file_under_job',
      job_id: J.history.id,
      confidence: 'medium',
      rule_id: r.id,
      rule_author_name: 'Kavitha Demo',
    });
    expect(p.reasons[0]).toBe(`Kavitha Demo taught this: "${T.generic_caps}" goes to ${jobLabel(J.history)}`);
    expect(p.reasons[1]).toMatch(/also fits .*check the rule fits this person/);
  });

  it('a rule is high only with the resume agreeing, and the title fitting no other post', () => {
    const r = rule({ cvviz_job_title_norm: normaliseJobTitle(T.unmatched), job_id: J.history.id });
    // One person's correction alone, with nothing about this candidate's subject: medium.
    expect(proposeMatch({ ...base, candidate: cand(T.unmatched), rules: [r] }).confidence).toBe('medium');
    const p = proposeMatch({ ...base, candidate: cand(T.unmatched), extract: extract('History'), rules: [r] });
    expect(p).toMatchObject({ job_id: J.history.id, confidence: 'high', rule_id: r.id });
  });

  it('a rule is never high when the resume subject points to another post', () => {
    const r = rule({ cvviz_job_title_norm: normaliseJobTitle(T.unmatched), job_id: J.history.id });
    const p = proposeMatch({ ...base, candidate: cand(T.unmatched), extract: extract('English'), rules: [r] });
    expect(p.job_id).toBe(J.history.id);
    expect(p.confidence).toBe('medium');
    expect(p.reasons.join(' ')).toMatch(/subject \(English\) points to/);
  });

  it('beats a resume subject pointing elsewhere', () => {
    const r = rule({ cvviz_job_title_norm: GENERIC_NORM, job_id: J.history.id });
    const p = proposeMatch({ ...base, candidate: cand(T.generic), extract: extract('English'), rules: [r] });
    expect(p.job_id).toBe(J.history.id);
  });

  it('two visible rules for one title -> the most used, medium, the other named', () => {
    const a = rule({ id: 'ra', cvviz_job_title_norm: GENERIC_NORM, job_id: J.english.id, times_used: 5 });
    const b = rule({ id: 'rb', cvviz_job_title_norm: GENERIC_NORM, job_id: J.english_eng.id, created_by_name: 'Suresh Demo' });
    const p = proposeMatch({ ...base, candidate: cand(T.generic), rules: [b, a] });
    expect(p).toMatchObject({ job_id: J.english.id, confidence: 'medium', rule_id: 'ra' });
    expect(p.reasons[1]).toBe(`Another rule, from Suresh Demo, says ${jobLabel(J.english_eng)}`);
  });

  it('a rule whose job closed is ignored, and the card says so', () => {
    const r = rule({ cvviz_job_title_norm: 'principal', job_id: 'closed-job' });
    const p = proposeMatch({ ...base, candidate: cand(J.principal.title), rules: [r] });
    expect(p.rule_id).toBeNull();
    expect(p.job_id).toBe(J.principal.id);
    expect(p.reasons).toContain('A learned rule pointed to a job that is no longer open');
  });
});

describe('proposeMatch — scoring open jobs', () => {
  it('an exact title is one clear winner, high', () => {
    const p = proposeMatch({ ...base, candidate: cand('Administrative Officer') });
    expect(p).toMatchObject({ action: 'file_under_job', job_id: J.admin_officer.id, confidence: 'high', institution_id: J.admin_officer.institution_id });
  });

  it('the resume subject routes a generic title to the matching post', () => {
    const jobs = [J.english, J.history];
    const p = proposeMatch({ ...base, openJobs: jobs, candidate: cand(T.generic), extract: extract('English Literature') });
    expect(p).toMatchObject({ action: 'file_under_job', job_id: J.english.id, confidence: 'high' });
    expect(p.reasons).toContain('Resume subject: English Literature');
  });

  it('a generic title with nothing else to go on names every close alternative', () => {
    const jobs = [J.english, J.history];
    const p = proposeMatch({ ...base, openJobs: jobs, candidate: cand(T.generic_caps) });
    expect(p.action).toBe('file_under_job');
    expect(p.confidence).toBe('low');
    expect(p.reasons[0]).toMatch(/^Several open jobs fit/);
    expect(p.reasons[1]).toMatch(/^Also close: /);
  });

  it('the same post at two colleges is a tie, never a silent pick', () => {
    const jobs = [J.english, J.english_eng];
    const p = proposeMatch({ ...base, openJobs: jobs, candidate: cand(J.english.title) });
    expect(p.confidence).toBe('medium');
    expect(p.reasons[1]).toContain(J.english_eng.institution_name as string);
  });

  it('a subject named in the resume file name helps, but only to medium', () => {
    const jobs = [J.english, J.history];
    const p = proposeMatch({
      ...base,
      openJobs: jobs,
      candidate: cand(T.generic),
      resume_file_name: 'Demo_CV_Assistant_Professor_English.pdf',
    });
    expect(p).toMatchObject({ job_id: J.english.id, confidence: 'medium' });
    expect(p.reasons).toContain('Resume file name mentions "english"');
  });

  it('a slash title fits the job named by one of its halves; high once something names its department', () => {
    const p = proposeMatch({ ...base, candidate: cand(T.combo) });
    // The post is in a named department the title does not mention: not high on the title alone.
    expect(p).toMatchObject({ job_id: J.lab_tech.id, confidence: 'medium' });
    const withQual = proposeMatch({ ...base, candidate: cand(J.lab_tech.title, { qualification: `M.Sc. ${J.lab_tech.department_name}` }) });
    expect(withQual).toMatchObject({ job_id: J.lab_tech.id, confidence: 'high' });
  });

  it('a qualification or resume subject that points elsewhere keeps a fitting title off high', () => {
    const p = proposeMatch({ ...base, candidate: cand(J.lab_tech.title, { qualification: 'M.Sc. Physics' }) });
    expect(p).toMatchObject({ job_id: J.lab_tech.id, confidence: 'medium' });
    expect(p.reasons[0]).toMatch(/\(physics\) is not exactly this post.s subject/);
    const exact = proposeMatch({ ...base, candidate: cand(J.history.title), extract: extract('Chemistry') });
    expect(exact).toMatchObject({ job_id: J.history.id, confidence: 'medium' });
  });

  it('a resume paired only by a similar file name is never high', () => {
    const p = proposeMatch({ ...base, candidate: cand(J.history.title), resume_match: 'contains' });
    expect(p).toMatchObject({ job_id: J.history.id, confidence: 'medium' });
    expect(proposeMatch({ ...base, candidate: cand(J.history.title), resume_match: 'exact' }).confidence).toBe('high');
  });

  it('a different rank of post is not a fit: no open job, closest named', () => {
    const p = proposeMatch({ ...base, candidate: cand('Vice Principal') });
    expect(p).toMatchObject({ action: 'needs_new_job', confidence: 'low', job_id: null });
    expect(p.reasons[0]).toBe('No open job for Vice Principal');
    expect(p.reasons[1]).toBe(`Closest open job: ${jobLabel(J.principal)}`);
  });

  it('a title sharing no word with any open job -> needs_new_job, medium', () => {
    const p = proposeMatch({ ...base, candidate: cand('Driver') });
    expect(p).toMatchObject({ action: 'needs_new_job', confidence: 'medium' });
    expect(p.reasons).toEqual(['No open job for Driver']);
  });

  it('extra reasons from the caller come last', () => {
    const p = proposeMatch({ ...base, candidate: cand('Driver'), extra_reasons: ['Could not read the resume'] });
    expect(p.reasons.at(-1)).toBe('Could not read the resume');
  });
});

describe('titleScore', () => {
  it('caps a rank mismatch below the fit threshold', () => {
    expect(titleScore('Vice Principal', J.principal.title)).toBeLessThanOrEqual(0.3);
    expect(titleScore(T.associate, J.english.title)).toBeLessThanOrEqual(0.3);
    expect(titleScore(T.generic, J.english.title)).toBeCloseTo(2 / 3);
    expect(titleScore('principal', 'Principal')).toBe(1);
  });
});

describe('a row filing would refuse is never high', () => {
  const fits = (extra: Partial<Parameters<typeof proposeMatch>[0]>) =>
    proposeMatch({ ...base, candidate: cand(J.principal.title), ...extra });

  it('a clean row with its resume stays high', () => {
    expect(fits({ resume_uploaded: true })).toMatchObject({ action: 'file_under_job', confidence: 'high' });
  });

  it('no email and no phone -> low, reason first', () => {
    const p = fits({ candidate: cand(J.principal.title, { email: null, phone: null }), resume_uploaded: true });
    expect(p).toMatchObject({ action: 'file_under_job', job_id: J.principal.id, confidence: 'low' });
    expect(p.reasons[0]).toBe('Cannot be filed yet: no email or phone');
  });

  it('no usable phone, or no email, -> low with the specific reason', () => {
    expect(fits({ candidate: cand(J.principal.title, { phone: null }), resume_uploaded: true }).reasons[0])
      .toBe('Cannot be filed yet: no usable phone number');
    expect(fits({ candidate: cand(J.principal.title, { email: null }), resume_uploaded: true }).confidence).toBe('low');
  });

  it('no resume uploaded -> low', () => {
    const p = fits({ resume_uploaded: false });
    expect(p.confidence).toBe('low');
    expect(p.reasons[0]).toBe('No resume uploaded');
  });

  it('a skip or a merge is not capped (nothing is filed)', () => {
    const p = proposeMatch({
      ...base,
      candidate: cand(J.principal.title, { email: null, phone: null }),
      duplicate: { kind: 'existing_candidate', ref_id: 'c1', note: null },
      resume_uploaded: false,
    });
    expect(p).toMatchObject({ action: 'merge_existing', confidence: 'medium' });
  });
});

describe('eighth review: sharing one word is not the same subject', () => {
  const post = (title: string, department: string | null): MatchJob => ({
    id: 'a0000000-0000-4000-8000-0000000000e1', title, institution_id: J.principal.institution_id,
    institution_name: J.principal.institution_name, department_name: department, qualifications: [],
  });
  const only = (j: MatchJob) => ({ ...base, openJobs: [j], resume_match: 'exact' as const });
  it('Civil Engineering is not Mechanical Engineering (title or resume subject)', () => {
    const mech = post(T.mech_post, 'Mechanical Engineering');
    expect(proposeMatch({ ...only(mech), candidate: cand(T.civil_cv) }).confidence).not.toBe('high');
    expect(proposeMatch({ ...only(mech), candidate: cand(T.generic), extract: extract('Civil Engineering') }).confidence).not.toBe('high');
    expect(proposeMatch({ ...only(mech), candidate: cand(T.mech_post) }).confidence).toBe('high');
  });
  it('Child Health Nursing is not Medical Surgical Nursing; Pharmaceutical Analysis is not Pharmaceutical Chemistry', () => {
    const nursing = post(T.nursing_post, null);
    expect(proposeMatch({ ...only(nursing), candidate: cand(T.nursing_cv) }).confidence).not.toBe('high');
    const pharm = post(T.pharm_post, null);
    expect(proposeMatch({ ...only(pharm), candidate: cand(T.pharm_cv) }).confidence).not.toBe('high');
  });
  it('"English Literature" is still English', () => {
    const eng = post(T.english_post, 'English');
    expect(proposeMatch({ ...only(eng), candidate: cand(T.generic), extract: extract('English Literature') }).confidence).toBe('high');
  });
});

describe('ninth review: the same post open at a college the uploader cannot see', () => {
  const visible = [J.english];
  const everyCollege = [J.english, J.english_eng];
  const input = { ...base, openJobs: visible, candidate: cand(J.english.title), extract: extract('English'), resume_match: 'exact' as const };
  it('is high when only the uploader\u2019s post is open anywhere', () => {
    expect(proposeMatch({ ...input, all_open_jobs: visible }).confidence).toBe('high');
  });
  it('is medium, naming the other college, when the title is also open elsewhere', () => {
    const p = proposeMatch({ ...input, all_open_jobs: everyCollege });
    expect(p).toMatchObject({ job_id: J.english.id, confidence: 'medium' });
    expect(p.reasons[0]).toContain(`also open at ${J.english_eng.institution_name}`);
  });
});

