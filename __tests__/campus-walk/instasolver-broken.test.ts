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

/** Records the filters the rate-limit count applied, so they can be asserted. */
let countFilters: Array<[string, unknown]> = [];
let countResult: { count: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};

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
  const countQuery: Record<string, unknown> = {};
  // head:true count queries resolve as a thenable once every filter is chained.
  const chain = {
    eq(col: string, val: unknown) {
      countFilters.push([col, val]);
      return chain;
    },
    gte(col: string, val: unknown) {
      countFilters.push([col, val]);
      return chain;
    },
    then(resolve: (v: typeof countResult) => unknown) {
      return Promise.resolve(countResult).then(resolve);
    },
  };
  void countQuery;

  return {
    from: (table: string) => {
      if (table === 'project_tasks') {
        return { select: () => chain };
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
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@jkkn.ac.in' } } });
  profileMaybeSingle.mockResolvedValue({
    data: { id: 'user-1', role: 'learner', institution_id: 'inst-1', is_active: true },
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
      "You've reported 10 things today — thank you. More opens tomorrow."
    );
    // The ceiling must be refused BEFORE a task is created, not after.
    expect(createWalkTask).not.toHaveBeenCalled();
  });

  it('counts only this reporter, only this lane, only the last 24h', async () => {
    countResult = { count: 3, error: null };

    await postForm(VALID);

    const asObject = Object.fromEntries(countFilters.map(([k, v]) => [k, v]));
    // Wrong source => a Campus Walk observation would burn a reporter's quota.
    expect(asObject['metadata->>source']).toBe('instasolver');
    // Wrong reporter => one busy reporter would lock out everybody.
    expect(asObject['metadata->>reporter_id']).toBe('user-1');

    const since = countFilters.find(([k]) => k === 'created_at')?.[1];
    expect(typeof since).toBe('string');
    const ageMs = Date.now() - new Date(since as string).getTime();
    // A rolling 24h window, not a calendar day (which resets at midnight).
    expect(ageMs).toBeGreaterThan(23.5 * 3600_000);
    expect(ageMs).toBeLessThan(24.5 * 3600_000);
  });

  it('lets the report through when the counter itself errors', async () => {
    // Fail OPEN: a counting outage must never swallow a report about a hazard.
    countResult = { count: null, error: { message: 'boom' } };

    const res = await postForm(VALID);

    expect(res.status).toBe(200);
    expect(createWalkTask).toHaveBeenCalledTimes(1);
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

  it('stamps the lane and the reporter onto metadata so the limit can count it', async () => {
    await postForm(VALID);

    const input = createWalkTask.mock.calls[0][1];
    expect(input.source).toBe('instasolver');
    expect(input.extraMetadata.source).toBe('instasolver');
    expect(input.extraMetadata.reporter_id).toBe('user-1');
    expect(input.extraMetadata.reporter_role).toBe('learner');
    expect(input.extraMetadata.reporter_institution_id).toBe('inst-1');
  });

  it('files no photo fields when no photo was attached', async () => {
    await postForm(VALID);

    const input = createWalkTask.mock.calls[0][1];
    expect(input.photoStoragePath).toBeUndefined();
    expect(input.photos).toBeUndefined();
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
