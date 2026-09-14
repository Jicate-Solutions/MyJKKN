// __tests__/campus-walk/instasolver-broken.test.ts
// ============================================================================
// The InstaSolver "something is broken" intake (app/api/instasolver/broken).
//
// Two behaviours are pinned here because both are silent when they break:
//
//  1. THE RATE LIMIT. It is the only abuse control this route has — it stands
//     in for the Director-only D2 gate that guards the Campus Walk photo
//     route, which this one deliberately does not reuse (I1: everyone with a
//     login can file). A limit that counts the wrong rows, or counts nothing
//     at all, looks exactly like a working one until the day it is flooded.
//     So the count's own filters are asserted, not just the 429.
//
//  2. DANGEROUS -> UNSAFE. The checkbox a reporter ticks is what puts the
//     task in D6's urgent lane: `isUnsafe: true` is what makes the service
//     use DUE_IN_DAYS.unsafe (0 — due the same day) and page a phone. If that
//     mapping is ever dropped the form still submits, the ticket still
//     appears, and an exposed wire quietly becomes a 2-day symptom.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const profileMaybeSingle = vi.fn();
const createWalkTask = vi.fn();

/** Records the filters each ledger count applied, so they can be asserted. */
let countFilters: Array<[string, unknown]> = [];
/** The reporter ceiling's count — the FIRST ledger count the route runs. */
let countResult: { count: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};
/** The per-institution page cap's count — the SECOND, run only when dangerous. */
let pagedCountResult: { count: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};
/** How many ledger counts have been issued this call, so each gets its own result. */
let ledgerCountCalls = 0;
/** Every row inserted into the ledger, so the `paged` decision can be asserted. */
let ledgerInserts: Array<Record<string, unknown>> = [];
/** Set to simulate a ledger INSERT failure. */
let ledgerInsertError: { message: string } | null = null;
/** Which tables the admin client was asked for — proves project_tasks is not counted. */
let adminTablesTouched: string[] = [];

function makeSessionClient() {
  return {
    auth: { getUser },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected session read of ${table}`);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: profileMaybeSingle }),
        }),
      };
    },
  };
}

function makeAdminClient() {
  return {
    from: (table: string) => {
      adminTablesTouched.push(table);

      if (table === 'instasolver_report_ledger') {
        // head:true count queries resolve as a thenable once every filter is
        // chained. Each `select()` is one count; the first is the reporter
        // ceiling, the second (dangerous reports only) is the page cap.
        const which = ledgerCountCalls;
        const chain: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            countFilters.push([col, val]);
            return chain;
          },
          gte(col: string, val: unknown) {
            countFilters.push([col, val]);
            return chain;
          },
          then(resolve: (v: typeof countResult) => unknown) {
            return Promise.resolve(which === 0 ? countResult : pagedCountResult).then(resolve);
          },
        };
        return {
          select: () => {
            ledgerCountCalls += 1;
            return chain;
          },
          insert: async (row: Record<string, unknown>) => {
            ledgerInserts.push(row);
            return { error: ledgerInsertError };
          },
        };
      }

      if (table === 'profiles') {
        // The owner-name lookup for the "Sent to ___" receipt.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { full_name: 'Ravi Kumar' } }),
            }),
          }),
        };
      }
      throw new Error(`unexpected admin read of ${table}`);
    },
    storage: {
      from: () => ({ upload: async () => ({ error: null }) }),
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSessionClient(),
  createServiceRoleClient: () => makeAdminClient(),
}));

vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  createWalkTask: (...args: unknown[]) => createWalkTask(...args),
}));

// Never exercised in these tests (no photo is attached), but the route imports
// them at module load, so they must resolve.
vi.mock('@/lib/services/pde/jpeg-metadata', () => ({
  isJpegMagic: () => true,
  stripJpegMetadata: (b: Uint8Array) => b,
  scanJpegForMetadata: () => ({ ok: true }),
}));

async function postForm(fields: Record<string, string>) {
  const { POST } = await import('@/app/api/instasolver/broken/route');
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const request = { formData: async () => form } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

const VALID = {
  location: 'Block A, second floor washroom',
  description: 'The tap will not turn off and water is running all day.',
};

beforeEach(() => {
  vi.clearAllMocks();
  countFilters = [];
  countResult = { count: 0, error: null };
  pagedCountResult = { count: 0, error: null };
  ledgerCountCalls = 0;
  ledgerInserts = [];
  ledgerInsertError = null;
  adminTablesTouched = [];
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@jkkn.ac.in' } } });
  profileMaybeSingle.mockResolvedValue({
    // 'student' is the value `profiles.role`'s CHECK constraint actually admits
    // (20260225_add_store_admin_to_profiles_role_check.sql: student, staff,
    // admin, super_admin, administrator, faculty, hod, guest, driver,
    // store_admin). The fixture previously said 'learner', which is the word
    // the product uses for the person but a value the column would reject — so
    // the test was passing against a profile row that could not exist.
    data: { id: 'user-1', role: 'student', institution_id: 'inst-1', is_active: true },
    error: null,
  });
  createWalkTask.mockResolvedValue({
    taskId: 'task-1',
    attachmentId: null,
    attachmentIds: [],
    dueDate: '2026-09-16',
    accountableProfileId: 'owner-1',
  });
});

describe('InstaSolver broken intake — the rate limit', () => {
  it('refuses the 11th report in 24h with 429 and a plain-words reason', async () => {
    countResult = { count: 10, error: null };

    const res = await postForm(VALID);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "You've reported 10 things in the last 24 hours — thank you. Try again after 24 hours from your first report today."
    );
    // The ceiling must be refused BEFORE a task is created, not after.
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('counts only this reporter, only this lane, only the last 24h', async () => {
    countResult = { count: 3, error: null };

    await postForm(VALID);

    const asObject = Object.fromEntries(countFilters.map(([k, v]) => [k, v]));
    // Wrong reporter => one busy reporter would lock out everybody.
    expect(asObject['reporter_id']).toBe('user-1');
    // THE WHOLE POINT: the count comes from the ledger, never from
    // project_tasks. That table's RLS is `FOR ALL USING (auth.uid() IS NOT
    // NULL)`, so a reporter can DELETE the rows a project_tasks-based ceiling
    // counts and file again. If this assertion ever fails, the ceiling is
    // decoration.
    expect(adminTablesTouched).toContain('instasolver_report_ledger');
    expect(adminTablesTouched).not.toContain('project_tasks');

    const since = countFilters.find(([k]) => k === 'created_at')?.[1];
    expect(typeof since).toBe('string');
    const ageMs = Date.now() - new Date(since as string).getTime();
    // A rolling 24h window, not a calendar day (which resets at midnight).
    expect(ageMs).toBeGreaterThan(23.5 * 3600_000);
    expect(ageMs).toBeLessThan(24.5 * 3600_000);
  });

  it('lets the report through when the counter errors, but withholds the phone page', async () => {
    // Fail OPEN on the REPORT: a counting outage must never swallow a report
    // about an exposed wire. Fail CLOSED on the PAGE: with no countable ledger
    // the per-college cap cannot be enforced, and "we cannot count" is not
    // permission to ring every phone on campus. Never lose a hazard report,
    // never page unbounded.
    countResult = { count: null, error: { message: 'boom' } };

    const res = await postForm({ ...VALID, dangerous: 'true' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(createWalkTask.mock.calls[0][1].urgentPaging.whatsApp).toBe(false);
    expect(body.urgent_alert).toBeNull(); // the mocked service returns no outcome
  });

  it('allows the 10th report — the limit is the 11th, not the 10th', async () => {
    countResult = { count: 9, error: null };

    const res = await postForm(VALID);

    expect(res.status).toBe(200);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
  });
});

describe('InstaSolver broken intake — dangerous maps to the unsafe lane', () => {
  it('sends isUnsafe true when the reporter ticks "this is dangerous"', async () => {
    await postForm({ ...VALID, dangerous: 'true' });

    expect(createWalkTask).toHaveBeenCalledTimes(1);
    const input = createWalkTask.mock.calls[0][1];
    expect(input.isUnsafe).toBe(true);
    // Never system_gap: that kind is for an audit finding, and its 7-day due
    // date would outrank the unsafe same-day rule for exactly the wrong item.
    expect(input.kind).toBe('symptom');
  });

  it('sends isUnsafe false when the box is left unticked', async () => {
    await postForm({ ...VALID, dangerous: 'false' });

    const input = createWalkTask.mock.calls[0][1];
    expect(input.isUnsafe).toBe(false);
    expect(input.kind).toBe('symptom');
  });

  it('treats an absent checkbox as not dangerous', async () => {
    // An unticked HTML checkbox sends no field at all.
    await postForm(VALID);

    expect(createWalkTask.mock.calls[0][1].isUnsafe).toBe(false);
  });

  it('stamps the reporter onto metadata for the fix lane and the closure notice', async () => {
    await postForm(VALID);

    const input = createWalkTask.mock.calls[0][1];
    expect(input.extraMetadata.reporter_id).toBe('user-1');
    // Passed through verbatim from `profiles.role`, not re-derived.
    expect(input.extraMetadata.reporter_role).toBe('student');
    expect(input.extraMetadata.reporter_institution_id).toBe('inst-1');
  });

  it('files the task INTO the campus-walk lane and records the door separately', async () => {
    // Decision I4 — "campus walk also should feed into the same only". This is
    // the assertion that keeps InstaSolver reports on ONE list.
    //
    // If `source` ever stops being 'campus-walk', six things break silently and
    // all at once: app/api/campus-walk/fix/route.ts and
    // app/(routes)/campus-walk/fix/page.tsx refuse the task with `wrong_lane`
    // so no fixer can ever close it, app/api/campus-walk/review/route.ts
    // refuses to approve it, the review list and the fixing board stop showing
    // it, lib/campus-walk/chase-up.ts stops chasing it when it goes overdue,
    // and app/api/cron/campus-walk-photo-retention stops purging a learner's
    // photo. Every one of those failures looks like nothing happening.
    //
    // The door lives in `front_door` instead, read by exactly two things: this
    // route's rate limit, and the D9 coverage board (`isWalkedObservation`),
    // which excludes it because nobody walked to it.
    await postForm(VALID);

    const input = createWalkTask.mock.calls[0][1];
    // No caller may set the lane — the service writes 'campus-walk' itself.
    expect(input.source).toBeUndefined();
    expect(input.extraMetadata.source).toBeUndefined();
    expect(input.extraMetadata.front_door).toBe('instasolver');
  });

  it('files no photo fields when no photo was attached', async () => {
    await postForm(VALID);

    const input = createWalkTask.mock.calls[0][1];
    expect(input.photoStoragePath).toBeUndefined();
    expect(input.photos).toBeUndefined();
  });
});

describe('InstaSolver broken intake — the ledger is the source of truth', () => {
  it('records the report in the ledger BEFORE the task is created', async () => {
    await postForm(VALID);

    expect(ledgerInserts).toHaveLength(1);
    expect(ledgerInserts[0]).toMatchObject({
      reporter_id: 'user-1',
      institution_id: 'inst-1',
      paged: false,
    });
  });

  it('marks the ledger row as paged only when a page is actually permitted', async () => {
    await postForm({ ...VALID, dangerous: 'true' });

    // `paged` records what was ALLOWED, not what WhatsApp later delivered — a
    // cap counting only successes could be walked past by causing failures.
    expect(ledgerInserts[0].paged).toBe(true);
  });

  it('still files the report when the ledger INSERT fails, with the page withheld', async () => {
    ledgerInsertError = { message: 'ledger down' };

    const res = await postForm({ ...VALID, dangerous: 'true' });

    expect(res.status).toBe(200);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
    expect(createWalkTask.mock.calls[0][1].urgentPaging.whatsApp).toBe(false);
  });
});

describe('InstaSolver broken intake — learner-triggered pages are capped (HIGH 2)', () => {
  it('never copies the Director on a learner report', async () => {
    await postForm({ ...VALID, dangerous: 'true' });

    // D6's "always copy me" was decided about the Director's OWN observations.
    // Whether a learner's tick should ring his phone is a decision he has not
    // made, so until he rules the page goes to the EAO only and he gets the
    // in-app bell.
    expect(createWalkTask.mock.calls[0][1].urgentPaging.directorCopy).toBe(false);
  });

  it('counts the page cap per institution, on paged rows, over the window', async () => {
    await postForm({ ...VALID, dangerous: 'true' });

    const asObject = Object.fromEntries(countFilters.map(([k, v]) => [k, v]));
    expect(asObject['institution_id']).toBe('inst-1');
    expect(asObject['paged']).toBe(true);
    const since = countFilters.find(([k]) => k === 'created_at')?.[1];
    const ageMs = Date.now() - new Date(since as string).getTime();
    expect(ageMs).toBeGreaterThan(23.5 * 3600_000);
    expect(ageMs).toBeLessThan(24.5 * 3600_000);
  });

  it('withholds the page once the college has sent 20 in 24h — but still files it', async () => {
    pagedCountResult = { count: 20, error: null };

    const res = await postForm({ ...VALID, dangerous: 'true' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const input = createWalkTask.mock.calls[0][1];
    // Still URGENT — same-day due date, in-app alerts — only the phone is quiet.
    expect(input.isUnsafe).toBe(true);
    expect(input.urgentPaging.whatsApp).toBe(false);
    expect(input.urgentPaging.suppressedReason).toContain('20');
    expect(ledgerInserts[0].paged).toBe(false);
  });

  it('does not count the page cap at all for a report that is not dangerous', async () => {
    await postForm(VALID);

    const asObject = Object.fromEntries(countFilters.map(([k, v]) => [k, v]));
    expect(asObject['paged']).toBeUndefined();
    expect(createWalkTask.mock.calls[0][1].urgentPaging.whatsApp).toBe(false);
  });
});

describe('InstaSolver broken intake — the receipt does not overstate routing', () => {
  it('says nobody is assigned rather than naming a team that was not assigned', async () => {
    createWalkTask.mockResolvedValue({
      taskId: 'task-1',
      attachmentId: null,
      attachmentIds: [],
      dueDate: '2026-09-16',
      accountableProfileId: null,
    });

    const res = await postForm(VALID);
    const body = await res.json();

    expect(body.routed_to).toBeNull();
    expect(body.notice).toBe(
      'Recorded. No one is assigned yet — the campus operations team will pick it up.'
    );
  });

  it('names the owner, and adds no notice, when routing did resolve one', async () => {
    const res = await postForm(VALID);
    const body = await res.json();

    expect(body.routed_to).toBe('Ravi Kumar');
    expect(body.notice).toBeNull();
  });
});

describe('InstaSolver broken intake — refusals are explicit (rule #27)', () => {
  it('401s a signed-out caller as JSON, never a silent redirect', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await postForm(VALID);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('403s a guest account explicitly, with a reason', async () => {
    profileMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', role: 'guest', institution_id: null, is_active: true },
      error: null,
    });

    const res = await postForm(VALID);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain('Guest accounts');
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('fails CLOSED when is_active is null rather than treating it as active', async () => {
    // `=== false` let NULL through. There are no NULLs today, which is exactly
    // why this is cheap to pin now instead of after one appears.
    profileMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', role: 'student', institution_id: 'inst-1', is_active: null },
      error: null,
    });

    const res = await postForm(VALID);

    expect(res.status).toBe(403);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('403s an auth user who has no profile row', async () => {
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await postForm(VALID);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('400s a description that is too short', async () => {
    const res = await postForm({ ...VALID, description: 'broken' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('answers 502 — not a silent success — when routing fails and nothing was stored', async () => {
    createWalkTask.mockResolvedValue(null);

    const res = await postForm(VALID);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
  });
});
