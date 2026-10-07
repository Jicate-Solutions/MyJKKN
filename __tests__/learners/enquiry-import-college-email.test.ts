// POST /api/learners/enquiries/import inserts every row in ONE insert
// (2026-10-07). The learner email sync refuses a college email that belongs to
// someone with admin powers, a team-member record or a non-learner account,
// and one refused row would fail the whole insert with a single database
// error. The route checks the emails first and reports each refused row like
// its other validation errors; nothing is inserted until the sheet is fixed.
//
// The workbook is a real .xlsx built here with the route's positional layout
// (one header row, then data rows). Label columns are accepted as given (the
// label mapping is mocked); the college hierarchy lookups return one row each.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const m = vi.hoisted(() => ({
  answers: {} as Record<string, string>,
  adminEmails: new Set<string>(),
  inserts: [] as unknown[],
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/lib/utils/mappings/enquiry-excel-mappings', () => ({
  mapLabelToValue: (label: string) => (label ? label : undefined),
  getValidLabels: () => [],
}));
vi.mock('@/lib/usage/record', () => ({ recordFeatureUse: async () => {}, FEATURE_KEYS: {} }));
vi.mock('@/lib/services/admission/resolve-admission-year', () => ({ resolveAdmissionYearIdBulk: async () => new Map() }));
vi.mock('@/lib/utils/quota-name-resolver', () => ({ buildQuotaResolver: async () => () => null }));
vi.mock('@/lib/utils/community-name-resolver', () => ({ buildCommunityResolver: async () => () => null }));
vi.mock('@/lib/utils/caste-name-resolver', () => ({ buildCasteResolver: async () => () => null }));
vi.mock('@/lib/utils/accommodation-type-resolver', () => ({ buildAccommodationTypeResolverMulti: async () => () => null }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'hr-1' } }, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      m.rpcCalls.push({ fn, args });
      const email = String(args.p_email ?? args.p_institution_email ?? '').trim().toLowerCase();
      if (fn === 'fn_staff_link_has_admin_powers') return { data: m.adminEmails.has(email), error: null };
      if (fn === 'fn_learner_email_refusal') return { data: m.answers[email] ?? null, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      let insert: unknown = null;
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, or: () => chain, in: () => chain,
        insert: (rows: unknown) => { insert = rows; m.inserts.push(rows); return chain; },
        // hierarchy lookups find one row each; no learner exists with the email
        maybeSingle: async () => ({ data: table === 'learners_profiles' ? null : { id: `${table}-1` }, error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: insert ? (insert as unknown[]).map((_, i) => ({ id: `new-${i}` })) : [], error: null }).then(res),
      };
      return chain;
    },
  }),
}));

import { POST } from '@/app/api/learners/enquiries/import/route';

const HEADER = Array.from({ length: 54 }, (_, i) => `Column ${i + 1}`);
function row(n: number, collegeEmail: string): string[] {
  const r = new Array(54).fill('');
  Object.assign(r, {
    0: `First${n}`, 1: `Last${n}`, 2: '2008-01-15', 3: 'Male', 4: 'Hindu', 5: 'BC', 6: 'Caste', 8: '',
    9: 'Father', 11: '9000000001', 12: 'Mother', 14: '9000000002',
    16: 'JKKN College', 17: 'B.E', 18: 'CSE', 19: 'B.E CSE', 20: 'Semester 1', 21: 'A', 22: '2026-27', 23: '2026',
    24: `90000000${10 + n}`, 25: collegeEmail, 26: `learner${n}@gmail.com`,
    27: 'Street', 29: 'District', 30: '638001', 31: 'Tamil Nadu',
    32: 'Regular', 33: 'None', 34: 'Day Scholar',
    35: 'School', 36: 'State Board', 37: '500', 38: '450', 39: '90',
    40: 'Science', 41: '600', 42: '540', 43: '90',
  });
  return r;
}
function workbook(rows: string[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), 'Enquiries');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], 'enquiries.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
async function upload(rows: string[][]) {
  const form = new FormData();
  form.append('file', workbook(rows));
  const res = await POST(new Request('http://localhost/api/learners/enquiries/import', { method: 'POST', body: form }) as never);
  return { status: res.status, body: (await res.json()) as { success: boolean; errors: Array<{ row: number; field?: string; message: string }> } };
}

beforeEach(() => {
  m.answers = { 'plain@jkkn.ac.in': 'refused', 'hr@jkkn.ac.in': 'refused' };
  m.adminEmails = new Set(['admin@jkkn.ac.in']);
  m.inserts = [];
  m.rpcCalls = [];
});

describe('enquiry import and college emails', () => {
  it('a valid sheet with ordinary college emails is inserted', async () => {
    const { body } = await upload([row(1, 'new.one@jkkn.ac.in'), row(2, '')]);
    expect(body.errors).toEqual([]);
    expect(body.success).toBe(true);
    expect(m.inserts).toHaveLength(1);
  });

  it('refused college emails are reported per row and nothing is inserted', async () => {
    const { body } = await upload([row(1, 'new.one@jkkn.ac.in'), row(2, 'PLAIN@jkkn.ac.in'), row(3, 'admin@jkkn.ac.in')]);
    expect(body.success).toBe(false);
    expect(body.errors.map((e) => [e.row, e.field])).toEqual([[3, 'college_email'], [4, 'college_email']]);
    expect(body.errors[1].message).toMatch(/someone with admin powers/);
    expect(m.inserts).toEqual([]);
  });
});
