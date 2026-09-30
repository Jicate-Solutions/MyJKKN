// __tests__/instasolver/complaint-privacy-route.test.ts
//
// POST /api/instasolver/complaint — the Director's rulings of 30 Sep 2026 as
// the route applies them:
//   2  harassment and ragging are ICC-only, automatically;
//   3  with no active ICC committee at the college, they go privately to the
//      superior-route person (a failed committee check counts as "none");
//   4  "about my HOD, principal or manager" goes past them (about_superior);
//   7  a 3-character description is enough;
//   8  the ticket's deadline is the type's own answer window;
//   1  an anonymous filing is handed to LCIssueService as anonymous (which
//      then stores no filer — see __tests__/grievance/anonymous-filer.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROUTE_TO = '0b000000-0000-4000-8000-000000000001';
const USER_ID = '0c000000-0000-4000-8000-000000000003';
const INSTITUTION = '0a000000-0000-4000-8000-000000000001';

type Resp = { data?: unknown; error?: unknown };

/** A chain whose every call returns itself and whose await yields `resp(table)`. */
function fakeClient(resp: (table: string) => Resp, rpc?: (fn: string) => Resp) {
  return {
    from(table: string) {
      const r = resp(table);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'range', 'in']) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve(r);
      chain.single = () => Promise.resolve(r);
      chain.then = (ok: (v: Resp) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(r).then(ok, bad);
      return chain;
    },
    rpc: (fn: string) => Promise.resolve(rpc ? rpc(fn) : { data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }) },
  };
}

let categories: Array<Record<string, unknown>> = [];
let committee: Resp = { data: [], error: null };
let policyValue: unknown = ROUTE_TO;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () =>
    fakeClient(
      (table) =>
        table === 'profiles'
          ? { data: { id: USER_ID, role: 'staff', full_name: 'Filer', email: 'f@x', institution_id: INSTITUTION }, error: null }
          : { data: null, error: null },
      (fn) => (fn === 'fn_get_policy' ? { data: policyValue, error: null } : { data: null, error: null })
    ),
  createServiceRoleClient: () =>
    fakeClient((table) => {
      if (table === 'grievance_categories') return { data: categories, error: null };
      if (table === 'accreditation_committees') return committee;
      if (table === 'profiles') return { data: { id: ROUTE_TO }, error: null };
      return { data: null, error: null };
    }),
}));

const createLCIssue = vi.fn(async () => ({ ticket_number: 'GRV-1' }));
vi.mock('@/lib/services/learners-council/issue-service', () => ({
  LCIssueService: { createLCIssue: (...args: unknown[]) => createLCIssue(...(args as [])) },
}));

import { POST } from '@/app/api/instasolver/complaint/route';

function post(body: Record<string, unknown>) {
  return POST({ json: async () => body } as never);
}

function lastOptions() {
  const call = createLCIssue.mock.calls.at(-1) as unknown as [unknown, string, Record<string, any>];
  return call[2];
}

const HARASSMENT = { id: 'cat-h', name: 'Sexual Harassment (ICC)', allow_anonymous: true, default_sla_hours: 72 };
const RAGGING = { id: 'cat-r', name: 'Ragging', allow_anonymous: true, default_sla_hours: 24 };
const OTHER = { id: 'cat-o', name: 'Other', allow_anonymous: true, default_sla_hours: 240 };

beforeEach(() => {
  createLCIssue.mockClear();
  categories = [HARASSMENT, RAGGING, OTHER];
  committee = { data: [], error: null };
  policyValue = ROUTE_TO;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const base = { subject: 'A problem', description: 'Something happened here' };

describe('ruling 2: harassment and ragging are ICC-only', () => {
  it('marks a harassment complaint ICC-only', async () => {
    committee = { data: [{ id: 'icc' }], error: null };
    const res = await post({ ...base, category_id: 'cat-h' });
    expect(res.status).toBe(200);
    expect(lastOptions().isIccOnly).toBe(true);
  });

  it('marks a ragging complaint ICC-only', async () => {
    committee = { data: [{ id: 'icc' }], error: null };
    await post({ ...base, category_id: 'cat-r' });
    expect(lastOptions().isIccOnly).toBe(true);
  });

  it('does not mark an ordinary complaint ICC-only', async () => {
    await post({ ...base, category_id: 'cat-o' });
    expect(lastOptions().isIccOnly).toBe(false);
  });

  it('with an active committee, leaves it for the committee (not pre-assigned)', async () => {
    committee = { data: [{ id: 'icc' }], error: null };
    await post({ ...base, category_id: 'cat-h' });
    expect(lastOptions().assignedTo).toBeNull();
    expect(lastOptions().extraMetadata.routing).toBeUndefined();
  });
});

describe('ruling 3: no active ICC committee -> the superior-route person, privately', () => {
  it('assigns it to the superior-route profile and marks the routing', async () => {
    committee = { data: [], error: null };
    await post({ ...base, category_id: 'cat-h' });
    const o = lastOptions();
    expect(o.isIccOnly).toBe(true);
    expect(o.assignedTo).toBe(ROUTE_TO);
    expect(o.extraMetadata.routing).toBe('icc_no_committee');
    expect(o.extraMetadata.icc_no_committee).toBe(true);
    expect(o.extraMetadata.about_superior).toBeUndefined();
  });

  it('treats a failed committee check as "no committee", never as a silent wait', async () => {
    committee = { data: null, error: { message: 'boom' } };
    await post({ ...base, category_id: 'cat-r' });
    const o = lastOptions();
    expect(o.assignedTo).toBe(ROUTE_TO);
    expect(o.extraMetadata.icc_committee_check_failed).toBe(true);
  });

  it('with no superior-route policy, stays unassigned and says so', async () => {
    committee = { data: [], error: null };
    policyValue = null;
    const res = await post({ ...base, category_id: 'cat-h' });
    const json = await res.json();
    expect(lastOptions().assignedTo).toBeNull();
    expect(lastOptions().extraMetadata.route_pending_policy).toBe(true);
    expect(json.notice).toBeTruthy();
  });
});

describe('ruling 4: about my HOD, principal or manager', () => {
  it('goes past them to the superior-route person', async () => {
    await post({ ...base, category_id: 'cat-o', about_superior: true });
    const o = lastOptions();
    expect(o.assignedTo).toBe(ROUTE_TO);
    expect(o.extraMetadata.about_superior).toBe(true);
    expect(o.extraMetadata.routing).toBe('superior_bypass');
  });

  it('a harassment complaint about a superior, with a committee, still goes past the chain', async () => {
    committee = { data: [{ id: 'icc' }], error: null };
    await post({ ...base, category_id: 'cat-h', about_superior: true });
    const o = lastOptions();
    expect(o.isIccOnly).toBe(true);
    expect(o.assignedTo).toBe(ROUTE_TO);
    expect(o.extraMetadata.routing).toBe('superior_bypass');
  });
});

describe('ruling 7: a 3-character description is enough', () => {
  it('files "Fan"', async () => {
    const res = await post({ subject: 'Fan', description: 'Fan', category_id: 'cat-o' });
    expect(res.status).toBe(200);
  });

  it('refuses two characters, before anything is written', async () => {
    const res = await post({ subject: 'Fan', description: 'ab', category_id: 'cat-o' });
    expect(res.status).toBe(400);
    expect(createLCIssue).not.toHaveBeenCalled();
  });
});

describe('ruling 8: the deadline is the type’s answer window', () => {
  it('passes the category’s default_sla_hours as the ticket SLA', async () => {
    await post({ ...base, category_id: 'cat-o' });
    expect(lastOptions().slaHours).toBe(240);
  });

  it('leaves the default when the category has none', async () => {
    categories = [{ ...OTHER, default_sla_hours: null }];
    await post({ ...base, category_id: 'cat-o' });
    expect(lastOptions().slaHours).toBeUndefined();
  });
});

describe('ruling 1: anonymous', () => {
  it('hands the filing over as anonymous with a tracking code, and returns the code', async () => {
    const res = await post({ ...base, category_id: 'cat-o', anonymous: true });
    const json = await res.json();
    const o = lastOptions();
    expect(o.isAnonymous).toBe(true);
    expect(o.anonymousToken).toMatch(/^anon_/);
    expect(json.tracking_code).toBe(o.anonymousToken);
  });
});
