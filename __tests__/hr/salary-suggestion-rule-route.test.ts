/**
 * /api/hr/payroll/salary-suggestion-rule — the Director's rule editor's server.
 *
 * Runs the REAL route, the REAL withAuth and the REAL service against a
 * stand-in session client that keeps platform_policies and hr_policy_audit_log
 * in memory. Proves: super admins only (checked with is_super_admin(), never a
 * role name — an admin or a holder of the salary keys is refused); a first
 * draft is stored as a draft that is NOT in force; publish puts it in force;
 * every save writes an audit row with the reason; and a blank box reaches the
 * database as an absent key, never 0.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-rule-route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { EMPTY_RULE_FORM, formToRule } from '@/lib/hr/salary-suggestion-rule-form';

const COLLEGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOT_IN_HR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let superAdmin = false;
let admin = false;
let heldKeys: string[] = [];
let hasSessionCookie = true;
let auditFails = false;
/**
 * What fn_hr_salary_rule_lock_present() answers: true once #4111's policies are
 * live. 'error' makes the RPC fail; any other value is returned as `data` as-is.
 */
let lockPresent: unknown = true;

interface PolicyRow {
  id: string;
  policy_key: string;
  scope_type: string;
  scope_id: string | null;
  value: unknown;
  draft_value: unknown;
  publication_state: string;
  updated_at: string | null;
  [k: string]: unknown;
}
let policies: PolicyRow[] = [];
let audit: Array<Record<string, unknown>> = [];
const writes: Array<{ table: string; kind: string }> = [];
const reads: string[] = [];
let nextId = 1;

function builder(table: string) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  let kind: 'select' | 'insert' | 'update' = 'select';
  let payload: Record<string, unknown> | null = null;

  function run(): { data: unknown; error: unknown } {
    if (table === 'profiles') {
      return { data: [{ id: USER, email: 'x@jkkn.ac.in', role: 'not-consulted', institution_id: COLLEGE_A, full_name: 'X' }], error: null };
    }
    if (table === 'institutions') {
      return { data: [{ id: COLLEGE_A, name: 'College A', hr_organizations: [{ included_in_hr: true }] }], error: null };
    }
    if (table === 'hr_policy_audit_log') {
      writes.push({ table, kind });
      if (auditFails) return { data: null, error: { message: 'audit insert refused' } };
      audit.push(payload as Record<string, unknown>);
      return { data: null, error: null };
    }
    if (table === 'platform_policies') {
      if (kind === 'insert') {
        writes.push({ table, kind });
        const row = { id: `row-${nextId++}`, updated_at: 'now', ...(payload as object) } as PolicyRow;
        policies.push(row);
        return { data: [row], error: null };
      }
      const matched = policies.filter((r) => filters.every((f) => f(r)));
      if (kind === 'update') {
        writes.push({ table, kind });
        matched.forEach((r) => Object.assign(r, payload));
      } else {
        reads.push(table);
      }
      return { data: matched, error: null };
    }
    return { data: [], error: null };
  }

  const q: Record<string, unknown> = {
    select: () => q,
    order: () => q,
    eq: (col: string, val: unknown) => {
      // Embedded-table filters ('hr_organizations.included_in_hr') are answered by the fixture.
      if (!col.includes('.')) filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    insert: (p: Record<string, unknown>) => {
      kind = 'insert';
      payload = p;
      return q;
    },
    update: (p: Record<string, unknown>) => {
      kind = 'update';
      payload = p;
      return q;
    },
    single: async () => {
      const { data, error } = run();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    },
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  from: (table: string) => builder(table),
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'is_super_admin') return { data: superAdmin, error: null };
    if (fn === 'is_admin') return { data: admin, error: null };
    if (fn === 'user_has_permission') return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    if (fn === 'fn_hr_salary_rule_lock_present') {
      return lockPresent === 'error'
        ? { data: null, error: { message: 'function does not exist' } }
        : { data: lockPresent, error: null };
    }
    return { data: null, error: null };
  },
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeClient }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => (hasSessionCookie ? [{ name: 'sb-project-auth-token', value: 'x' }] : []),
    get: () => undefined,
    set: () => {},
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET, POST } from '@/app/api/hr/payroll/salary-suggestion-rule/route';

const URL_ = 'http://localhost/api/hr/payroll/salary-suggestion-rule';
function get() {
  return GET(new NextRequest(URL_));
}
function post(body: unknown) {
  return POST(
    new NextRequest(URL_, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  );
}

beforeEach(() => {
  superAdmin = false;
  admin = false;
  heldKeys = [];
  hasSessionCookie = true;
  auditFails = false;
  lockPresent = true;
  policies = [];
  audit = [];
  writes.length = 0;
  reads.length = 0;
  nextId = 1;
});

describe('who may see or change the rule', () => {
  it('answers 401 with no session', async () => {
    hasSessionCookie = false;
    expect((await get()).status).toBe(401);
    expect((await post({ scope: 'group', action: 'publish', rule: {}, reason: 'because' })).status).toBe(401);
    expect(writes).toEqual([]);
  });

  it('REFUSES an admin who holds every salary key but is not a super admin — before any read or write', async () => {
    admin = true;
    heldKeys = ['hr.payroll.salary.view', 'hr.payroll.salary.manage'];
    const g = await get();
    expect(g.status).toBe(403);
    const p = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 1 }, reason: 'because' });
    expect(p.status).toBe(403);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('gives a super admin the HR colleges and every stored row', async () => {
    superAdmin = true;
    policies.push({
      id: 'r1', policy_key: 'hr.salary_suggestion_rule', scope_type: 'global', scope_id: null,
      value: { per_year_at_jkkn: 500 }, draft_value: null, publication_state: 'published', updated_at: 't',
    });
    policies.push({
      id: 'r2', policy_key: 'hr.pay_scales', scope_type: 'institution', scope_id: COLLEGE_A,
      value: {}, draft_value: null, publication_state: 'published', updated_at: 't',
    });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.institutions).toEqual([{ id: COLLEGE_A, name: 'College A' }]);
    // Only the suggestion rule's rows — never the pay matrix.
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(['r1']);
  });
});

describe('saving', () => {
  beforeEach(() => {
    superAdmin = true;
  });

  it('a first draft is stored as a draft that is NOT in force, with blanks absent, and audited', async () => {
    // What the editor sends when only "per year at JKKN" is filled in.
    const { rule } = formToRule({ ...EMPTY_RULE_FORM, extras: [], perYearAtJkkn: '500' });
    const res = await post({ scope: COLLEGE_A, action: 'save_draft', rule, reason: '  first go  ' });
    expect(res.status).toBe(200);

    expect(policies).toHaveLength(1);
    const row = policies[0];
    expect(row).toMatchObject({
      policy_key: 'hr.salary_suggestion_rule',
      scope_type: 'institution',
      scope_id: COLLEGE_A,
      publication_state: 'draft_only',
      updated_by: USER,
    });
    // Not in force: the published value stays empty until someone publishes.
    expect(row.value).toEqual({});
    expect(row.draft_value).toEqual({ per_year_at_jkkn: 500, prior_counts: false, cap_at_band_max: true });
    expect('per_year_prior' in (row.draft_value as object)).toBe(false);
    expect('round_to' in (row.draft_value as object)).toBe(false);

    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'edit_draft', reason: 'first go', edited_by: USER, old_value: null });
  });

  it('publishing a group-wide rule puts it in force and audits the old value', async () => {
    policies.push({
      id: 'g1', policy_key: 'hr.salary_suggestion_rule', scope_type: 'global', scope_id: null,
      value: {}, draft_value: { per_year_at_jkkn: 400 }, publication_state: 'draft_only', updated_at: 't',
    });
    const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 400 }, reason: 'agreed today' });
    expect(res.status).toBe(200);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({ draft_value: null, publication_state: 'published' });
    expect(policies[0].value).toEqual({ per_year_at_jkkn: 400 });
    expect(audit[0]).toMatchObject({ action: 'publish', scope_type: 'global', scope_id: null, old_value: {} });
  });

  it('a draft over a published rule leaves the published figure in force', async () => {
    policies.push({
      id: 'c1', policy_key: 'hr.salary_suggestion_rule', scope_type: 'institution', scope_id: COLLEGE_A,
      value: { per_year_at_jkkn: 300 }, draft_value: null, publication_state: 'published', updated_at: 't',
    });
    await post({ scope: COLLEGE_A, action: 'save_draft', rule: { per_year_at_jkkn: 900 }, reason: 'thinking' });
    expect(policies[0]).toMatchObject({
      value: { per_year_at_jkkn: 300 },
      draft_value: { per_year_at_jkkn: 900 },
      publication_state: 'draft_pending',
    });
  });

  it('a rule published with every box blank is stored as {} — "not set", never zeros', async () => {
    const { rule } = formToRule({ ...EMPTY_RULE_FORM, extras: [] });
    await post({ scope: COLLEGE_A, action: 'publish', rule, reason: 'clear it' });
    expect(policies[0].value).toEqual({});
  });

  it('refuses a short reason, an unknown college, a bad action or a missing rule — writing nothing', async () => {
    expect((await post({ scope: 'group', action: 'publish', rule: {}, reason: 'no' })).status).toBe(400);
    expect((await post({ scope: NOT_IN_HR, action: 'publish', rule: {}, reason: 'because' })).status).toBe(400);
    expect((await post({ scope: 'everywhere', action: 'publish', rule: {}, reason: 'because' })).status).toBe(400);
    expect((await post({ scope: 'group', action: 'delete', rule: {}, reason: 'because' })).status).toBe(400);
    expect((await post({ scope: 'group', action: 'publish', reason: 'because' })).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('says so when the audit row could not be written, instead of swallowing it', async () => {
    auditFails = true;
    const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 1 }, reason: 'because' });
    expect(res.status).toBe(200);
    expect((await res.json()).auditError).toBe('audit insert refused');
  });
});

describe('not before #4111: the rule cannot be saved while pay-policy protection is absent', () => {
  beforeEach(() => {
    superAdmin = true;
  });

  it('PUBLISH answers 409 with a plain reason and writes nothing', async () => {
    lockPresent = false;
    const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 400 }, reason: 'agreed today' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      'The salary rule cannot be published until pay-policy protection is live. Nothing was saved.'
    );
    expect(writes).toEqual([]);
    expect(policies).toEqual([]);
    expect(audit).toEqual([]);
  });

  it('a DRAFT is refused too — draft_value sits in the same readable row', async () => {
    lockPresent = false;
    const res = await post({ scope: COLLEGE_A, action: 'save_draft', rule: { per_year_at_jkkn: 400 }, reason: 'thinking' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('cannot be saved, even as a draft');
    expect(writes).toEqual([]);
  });

  it('a failed check is a refusal, never a pass', async () => {
    lockPresent = 'error';
    const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 400 }, reason: 'agreed today' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('nothing was saved');
    expect(writes).toEqual([]);
  });

  it.each([['the string "false"', 'false'], ['the string "true"', 'true'], ['1', 1], ['an object', {}], ['null', null]])(
    'only a boolean true counts as live: %s is a refusal',
    async (_label, answer) => {
      lockPresent = answer;
      const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 400 }, reason: 'agreed today' });
      expect(res.status).toBe(409);
      expect(writes).toEqual([]);
      expect(policies).toEqual([]);
    }
  );

  it('once the protection is live, the same publish goes through', async () => {
    lockPresent = true;
    const res = await post({ scope: 'group', action: 'publish', rule: { per_year_at_jkkn: 400 }, reason: 'agreed today' });
    expect(res.status).toBe(200);
    expect(policies[0].value).toEqual({ per_year_at_jkkn: 400 });
  });

  it('reading the rule for the editor still works without it (a super admin reads, nothing is stored)', async () => {
    lockPresent = false;
    expect((await get()).status).toBe(200);
  });

  it('a refused caller is refused before the check is even asked', async () => {
    superAdmin = false;
    lockPresent = false;
    expect((await post({ scope: 'group', action: 'publish', rule: {}, reason: 'because' })).status).toBe(403);
  });
});
