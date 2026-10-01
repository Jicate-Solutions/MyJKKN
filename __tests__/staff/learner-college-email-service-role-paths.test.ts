// The service-role learner paths (2026-10-07): a learner's college email that
// is the caller's own, a colleague's (any team-member record), or another
// non-learner account's would turn that account into a student's through the
// learner email sync. The database cannot see who is asking, so each path asks
// fn_learner_email_refusal per row with the caller's own client, and reports
// each refused row. Super admins pass (the database answers NULL for them).
//
//   BulkLearnerEditService.processBulkEdit (bulk-edit-exited, enquiries/bulk-edit-apply)
//   BulkLearnerUploadService.processBulkUpload
//   POST /api/learners/create-missing-profiles

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload: unknown; filters: Array<[string, unknown]> };

// What the database answers for each college email (lower case); anything not
// listed is allowed.
const ANSWERS: Record<string, string> = {
  'hr@jkkn.ac.in': 'self',
  'plain@jkkn.ac.in': 'team_member',
  'decider@jkkn.ac.in': 'other_account',
};

const m = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  writes: [] as Call[],
  existingEmail: 'learner.one@jkkn.ac.in' as string | null,
  learners: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  answers: {} as Record<string, string>,
  adminEmails: new Set<string>(),
}));

const f = vi.hoisted(() => {
  function fakeClient(answer: (c: Call, mode: 'single' | 'many') => unknown) {
    return {
      from: (table: string) => {
        const c: Call = { table, op: 'select', payload: null, filters: [] };
        const done = (mode: 'single' | 'many') => {
          if (c.op !== 'select') m.writes.push(c);
          const data = answer(c, mode);
          return Promise.resolve({ data: data ?? (mode === 'many' ? [] : null), error: null });
        };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          neq: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          in: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          ilike: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          not: () => chain,
          limit: () => chain,
          order: () => chain,
          insert: (p: unknown) => { c.op = 'insert'; c.payload = p; return chain; },
          update: (p: unknown) => { c.op = 'update'; c.payload = p; return chain; },
          single: () => done('single'),
          maybeSingle: () => done('single'),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done('many').then(res, rej),
        };
        return chain;
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        m.rpcCalls.push({ fn, args });
        const email = String(args.p_email ?? args.p_institution_email ?? '').trim().toLowerCase();
        if (fn === 'fn_learner_email_refusal') return { data: m.answers[email] ?? null, error: null };
        if (fn === 'fn_staff_link_has_admin_powers') return { data: m.adminEmails.has(email), error: null };
        if (fn === 'is_super_admin') return { data: false, error: null };
        return { data: true, error: null };
      },
      auth: {
        getUser: async () => ({ data: { user: { id: 'caller-1' } }, error: null }),
        admin: {
          createUser: async () => ({ data: { user: { id: 'new-auth' } }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
    };
  }
  const session = () =>
    fakeClient((c) => {
      if (c.table === 'profiles') return { id: 'caller-1', role: 'learner_admin', is_super_admin: false };
      if (c.table === 'custom_roles') return { permissions: { 'learners.profiles.sync': true } };
      return null;
    });
  const admin = () =>
    fakeClient((c, mode) => {
      if (c.table === 'learners_profiles' && c.op === 'update') return { id: 'learner-1', first_name: 'A', last_name: 'B' };
      if (c.table === 'learners_profiles' && mode === 'many') return m.learners;
      if (c.table === 'profiles' && c.op === 'select' && mode === 'many') return m.profiles;
      return null;
    });
  return { session, admin };
});

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => f.session() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => f.admin() }));
vi.mock('@/lib/services/learner-validation-service', () => ({
  LearnerValidationService: {
    validateActiveLearner: async (id: string) => ({
      exists: true,
      isActive: true,
      learner: { id, institution_id: 'inst-1', college_email: m.existingEmail },
    }),
    findDuplicateEmails: () => new Map(),
    findDuplicatePhotoUrls: () => new Map(),
    findExistingPhotoOwners: async () => new Map(),
  },
}));
vi.mock('@/lib/services/bulk-learner-fk-fields', () => ({
  getLearnerFkResolvers: async () => ({}),
  resolveLearnerFkFields: () => ({ ids: {}, unresolved: [] }),
  fkLabel: () => '',
  FK_FIELD_SPECS: [],
  FK_CONSUMED_KEYS: new Set<string>(),
}));
vi.mock('@/lib/services/bulk-learner-reference-fields', () => ({
  getReferenceResolvers: async () => ({}),
  resolveLearnerReference: () => ({ values: {} }),
  buildReferenceTypoHints: () => [],
  referenceHintKey: () => '',
  REFERENCE_CONSUMED_KEYS: new Set<string>(),
  REFERENCE_TYPE_EXCEL_LABEL: {},
}));

import { BulkLearnerEditService } from '@/lib/services/bulk-learner-edit-service';
import { BulkLearnerUploadService } from '@/lib/services/bulk-learner-upload-service';
import { POST as syncLearnerProfiles } from '@/app/api/learners/create-missing-profiles/route';

const SELF = 'This college email is your own. Only a super admin can give it to a learner.';
const TEAM = "This college email belongs to a team-member record, so it cannot be a learner's. Correct the college email.";
const OTHER = "This college email belongs to an account that is not a learner's, so it cannot be a learner's. Correct the college email.";

beforeEach(() => {
  m.rpcCalls = [];
  m.writes = [];
  m.existingEmail = 'learner.one@jkkn.ac.in';
  m.learners = [];
  m.profiles = [];
  m.answers = { ...ANSWERS };
  m.adminEmails = new Set(['admin@jkkn.ac.in']);
});

const editRow = (rowNumber: number, college_email: string) => ({
  rowNumber,
  data: { id: `learner-${rowNumber}`, college_email },
  validation: { isValid: true, errors: [], warnings: [] },
});
const learnerUpdates = () => m.writes.filter((w) => w.table === 'learners_profiles' && w.op === 'update');

describe('BulkLearnerEditService.processBulkEdit: a new college email', () => {
  it('own, colleague\'s and non-learner account\'s emails are refused per row; an ordinary email goes ahead', async () => {
    const result = await BulkLearnerEditService.processBulkEdit(
      [editRow(2, ' HR@jkkn.ac.in'), editRow(3, 'plain@jkkn.ac.in'), editRow(4, 'decider@jkkn.ac.in'), editRow(5, 'new.one@jkkn.ac.in')],
      'inst-1', false, 'caller-1', true, f.session(),
    );
    expect(result.errors).toEqual([
      { row: 2, id: 'learner-2', error: SELF },
      { row: 3, id: 'learner-3', error: TEAM },
      { row: 4, id: 'learner-4', error: OTHER },
    ]);
    expect(result.updated).toBe(1);
    expect(learnerUpdates()).toHaveLength(1);
    expect(m.rpcCalls).toContainEqual({ fn: 'fn_learner_email_refusal', args: { p_email: 'new.one@jkkn.ac.in', p_learner_id: 'learner-5' } });
  });

  it('an unchanged college email (the learner\'s own, any case) is not asked about', async () => {
    const result = await BulkLearnerEditService.processBulkEdit(
      [editRow(2, 'Learner.One@JKKN.ac.in ')], 'inst-1', false, 'caller-1', true, f.session(),
    );
    expect(result.errors).toEqual([]);
    expect(m.rpcCalls.some((c) => c.fn === 'fn_learner_email_refusal')).toBe(false);
  });

  it('without the caller\'s client a changed email fails closed', async () => {
    const result = await BulkLearnerEditService.processBulkEdit([editRow(2, 'new.one@jkkn.ac.in')], 'inst-1', false, 'caller-1', true);
    expect(result.failed).toBe(1);
    expect(learnerUpdates()).toHaveLength(0);
  });
});

describe('BulkLearnerUploadService.processBulkUpload', () => {
  const LEARNER = {
    first_name: 'A', last_name: 'B', student_mobile: '1', institution_id: 'inst-1', department_id: null,
    gender: 'male', lifecycle_status: 'active', is_profile_complete: true,
  };
  const row = (rowNumber: number, college_email: string) =>
    ({ rowNumber, data: { ...LEARNER, college_email }, validation: { isValid: true, errors: [] } });

  it('refuses own, colleague\'s, non-learner account\'s and admin emails per row; the new learner is inserted', async () => {
    const result = await BulkLearnerUploadService.processBulkUpload(
      [row(2, 'hr@jkkn.ac.in'), row(3, 'PLAIN@jkkn.ac.in'), row(4, 'decider@jkkn.ac.in'), row(5, 'admin@jkkn.ac.in'), row(6, 'new.one@jkkn.ac.in')] as never,
      'caller-1', f.session(),
    );
    const refused = result.errors.map((e: { row: number; error: string }) => [e.row, e.error]);
    expect(refused).toEqual([
      [2, SELF], [3, TEAM], [4, OTHER],
      [5, 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.'],
    ]);
    const inserted = m.writes.filter((w) => w.table === 'learners_profiles' && w.op === 'insert')
      .flatMap((w) => (Array.isArray(w.payload) ? w.payload : [w.payload]) as Array<Record<string, unknown>>);
    expect(inserted.map((x) => x.college_email)).toEqual(['new.one@jkkn.ac.in']);
  });
});

describe('BulkLearnerUploadService: a row for a learner who already exists', () => {
  it('keeps the email on file, so it is not refused on re-upload (a team member who is also studying here)', async () => {
    m.learners = [{ id: 'existing-9', college_email: 'old.learner@jkkn.ac.in' }];
    m.answers['old.learner@jkkn.ac.in'] = 'refused'; // the email is also on a team-member record
    const LEARNER = {
      first_name: 'A', last_name: 'B', student_mobile: '1', institution_id: 'inst-1', department_id: null,
      gender: 'male', lifecycle_status: 'active', is_profile_complete: true,
    };
    const result = await BulkLearnerUploadService.processBulkUpload(
      [{ rowNumber: 2, data: { ...LEARNER, college_email: 'old.learner@jkkn.ac.in' }, validation: { isValid: true, errors: [], warnings: [] } }] as never,
      'caller-1', f.session(),
    );
    expect(result.errors).toEqual([]);
    expect(m.rpcCalls.some((c) => c.fn === 'fn_learner_email_refusal')).toBe(false);
    // the admin-powers check still runs for every row
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers', args: { p_profile_id: null, p_institution_email: 'old.learner@jkkn.ac.in' },
    });
  });
});

describe('POST /api/learners/create-missing-profiles', () => {
  const learner = (id: string, college_email: string, profile_id: string | null = null) => ({
    id, first_name: 'A', last_name: 'B', college_email, student_mobile: '1', institution_id: 'inst-1',
    department_id: null, gender: 'male', lifecycle_status: 'active', is_profile_complete: true, profile_id,
  });

  it('refuses the caller\'s own and a colleague\'s college email per learner, before any profile write', async () => {
    m.learners = [learner('l-own', 'hr@jkkn.ac.in'), learner('l-team', 'plain@jkkn.ac.in')];
    const res = await syncLearnerProfiles(new Request('http://localhost/x', { method: 'POST', body: '{}' }));
    const out = (await res.json()) as { results: { errors: Array<{ email: string; error: string }> } };
    expect(out.results.errors.map((e) => e.error)).toEqual([SELF, TEAM]);
    expect(m.writes.filter((w) => w.table === 'profiles')).toEqual([]);
    expect(m.rpcCalls).toContainEqual({ fn: 'fn_learner_email_refusal', args: { p_email: 'hr@jkkn.ac.in', p_learner_id: 'l-own' } });
  });

  it('…also when the email already has a profile the sync would update (a colleague\'s), nothing written', async () => {
    m.learners = [learner('l-team', 'plain@jkkn.ac.in')];
    m.profiles = [{ id: 'p-plain', email: 'plain@jkkn.ac.in', role: 'faculty', institution_id: 'inst-9', department_id: null,
      learner_id: null, full_name: 'P', phone_number: '9', gender: 'male', is_active: true }];
    const res = await syncLearnerProfiles(new Request('http://localhost/x', { method: 'POST', body: '{}' }));
    const out = (await res.json()) as { results: { errors: Array<{ error: string }> } };
    expect(out.results.errors.map((e) => e.error)).toEqual([TEAM]);
    expect(m.writes.filter((w) => w.table === 'profiles')).toEqual([]);
  });
});

describe('refuseLearnerCollegeEmail', () => {
  it('the one word an ordinary caller gets maps to one message that names no kind of account', async () => {
    const { refuseLearnerCollegeEmail } = await import('@/lib/services/staff/staff-admin-powers');
    const client = { rpc: async () => ({ data: 'refused', error: null }) };
    expect(await refuseLearnerCollegeEmail(client, 'x@gmail.com', null)).toEqual({
      status: 403,
      error: "This college email cannot be a learner's: it is your own, a team-member record's, or an account that is not a learner's. Correct the college email.",
    });
  });

  it('fails closed when the database check errors', async () => {
    const { refuseLearnerCollegeEmail } = await import('@/lib/services/staff/staff-admin-powers');
    const broken = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    expect(await refuseLearnerCollegeEmail(broken, 'x@gmail.com', null)).toEqual({
      status: 500,
      error: 'Could not check whether this person has admin powers. Nothing was changed.',
    });
  });
});

describe('refuseLearnerCollegeEmails (one insert of many learners, e.g. the enquiry import)', () => {
  it('names every refused row: admin powers first, then own, team member, other account; skips blanks', async () => {
    const { refuseLearnerCollegeEmails } = await import('@/lib/services/staff/staff-admin-powers');
    const out = await refuseLearnerCollegeEmails(f.session(), [
      { row: 2, email: 'admin@jkkn.ac.in' },
      { row: 3, email: 'hr@jkkn.ac.in' },
      { row: 4, email: 'plain@jkkn.ac.in' },
      { row: 5, email: 'decider@jkkn.ac.in' },
      { row: 6, email: 'new.one@jkkn.ac.in' },
      { row: 7, email: '  ' },
    ]);
    expect(out).toEqual([
      { row: 2, error: 'Only a super admin can change the role, status, college or email of someone with admin powers, or give anyone admin powers.' },
      { row: 3, error: SELF },
      { row: 4, error: TEAM },
      { row: 5, error: OTHER },
    ]);
  });
});
