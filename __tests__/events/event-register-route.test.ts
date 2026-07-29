import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Supabase test double ────────────────────────────────────────────────────
// One chainable builder per table. `results` decides what each table returns,
// and `inserted` captures the row the route tried to write.
const results: Record<string, unknown> = {};
const inserted: { payload?: Record<string, unknown> } = {};
let insertError: { code?: string; message: string } | null = null;
// Injects an error into the "already registered?" .maybeSingle() lookup on
// events_registrations, independent of the insert's own error path above.
let existingLookupError: { code?: string; message: string } | null = null;
// Injects an error into the plain-awaited event_registration_form_fields fetch.
let fieldsLookupError: { code?: string; message: string } | null = null;

function builderFor(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  ['select', 'eq', 'neq', 'in', 'order', 'limit'].forEach((m) => {
    chain[m] = vi.fn(self);
  });
  chain.maybeSingle = vi.fn(async () => {
    if (table === 'events_registrations' && existingLookupError) {
      return { data: null, error: existingLookupError };
    }
    return { data: results[table] ?? null, error: null };
  });
  chain.single = vi.fn(async () => ({ data: results[table] ?? null, error: null }));
  // Plain awaited queries (no terminal .single()/.maybeSingle()) — e.g. the
  // required-fields fetch — await the chain itself, so the chain must be a
  // real thenable resolving to a list rather than the bare chain object.
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    const error = table === 'event_registration_form_fields' ? fieldsLookupError : null;
    return Promise.resolve(
      error ? { data: null, error } : { data: results[table] ?? [], error: null }
    ).then(onFulfilled, onRejected);
  };
  chain.insert = vi.fn((payload: Record<string, unknown>) => {
    inserted.payload = payload;
    return {
      select: () => ({
        single: async () =>
          insertError
            ? { data: null, error: insertError }
            : { data: { id: 'reg-new' }, error: null },
      }),
    };
  });
  return chain;
}

const authUser: { user: { id: string } | null } = { user: null };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authUser.user } }) },
  }),
  createServiceRoleClient: () => ({ from: (table: string) => builderFor(table) }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/events/[eventId]/register/route';

const EVENT_ID = 'ev-1';
const params = Promise.resolve({ eventId: EVENT_ID });

function post(body: unknown) {
  return new Request('http://localhost/api/events/ev-1/register', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const OPEN_EVENT = {
  id: EVENT_ID,
  name: 'JKKN School of Influencer',
  event_type: 'seminar',
  status: 'planning',
  institution_id: 'inst-1',
  registration_open_date: null,
  registration_close_date: null,
};

const PROFILE = {
  id: 'user-1',
  full_name: 'Sangeetha V',
  email: 'aimech@jkkn.ac.in',
  institution_id: 'inst-9',
  department_id: 'dept-1',
};

// The one custom field most tests' fixture form defines — lets 'inserts with
// the internal/self-service conventions' etc. submit a real, whitelisted key.
const TSHIRT_FIELD = { field_key: 'tshirt', field_label: 'T-shirt size', is_required: false };

beforeEach(() => {
  authUser.user = { id: 'user-1' };
  results.events = OPEN_EVENT;
  results.profiles = PROFILE;
  results.departments = { department_name: 'Mechanical' };
  results.events_registrations = null; // not already registered
  results.event_registration_form_fields = [TSHIRT_FIELD];
  existingLookupError = null;
  fieldsLookupError = null;
  inserted.payload = undefined;
  insertError = null;
});

describe('POST /api/events/[eventId]/register', () => {
  it('rejects a signed-out caller with 401', async () => {
    authUser.user = null;
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(401);
  });

  it('404s when the event does not exist', async () => {
    results.events = null;
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('404s for a draft event', async () => {
    results.events = { ...OPEN_EVENT, status: 'draft' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('404s for a sports_tournament event — it has its own registration route', async () => {
    results.events = { ...OPEN_EVENT, event_type: 'sports_tournament' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('404s for a marathon event — it has its own registration route', async () => {
    results.events = { ...OPEN_EVENT, event_type: 'marathon' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(404);
  });

  it('422s before the window opens, naming the date', async () => {
    results.events = { ...OPEN_EVENT, registration_open_date: '2099-01-01T00:00:00Z' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('opens on');
  });

  it('422s after the window closes', async () => {
    results.events = { ...OPEN_EVENT, registration_close_date: '2000-01-01T00:00:00Z' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(422);
  });

  it('422s on a malformed phone number', async () => {
    const res = await POST(post({ phone: '123' }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/phone/i);
  });

  it('422s when a required custom field is missing, naming the label', async () => {
    results.event_registration_form_fields = [
      { field_key: 'why_join', field_label: 'Why do you want to join?', is_required: true },
    ];
    const res = await POST(post({ phone: '9876543210', custom_fields: {} }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('Why do you want to join?');
  });

  it('409s when the caller already has a registration', async () => {
    results.events_registrations = { id: 'reg-existing' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(409);
  });

  it('fails closed (does not insert) when the duplicate-check query errors', async () => {
    // e.g. .maybeSingle() itself errors (PGRST116) against pre-existing
    // duplicate rows under another source, which the (event_id, profile_id)
    // check has no way to safely resolve to "not registered".
    existingLookupError = { code: 'PGRST116', message: 'multiple (or no) rows returned' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(500);
    expect(inserted.payload).toBeUndefined();
  });

  it('fails closed (does not insert) when the form-fields lookup errors', async () => {
    fieldsLookupError = { code: '57014', message: 'canceling statement due to statement timeout' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(500);
    expect(inserted.payload).toBeUndefined();
  });

  it('422s when custom_fields is present but not a plain object', async () => {
    for (const bad of [['a'], 'not-an-object', 42]) {
      const res = await POST(post({ phone: '9876543210', custom_fields: bad }), { params });
      expect(res.status).toBe(422);
    }
  });

  it('409s when the unique index rejects a racing second submit', async () => {
    insertError = { code: '23505', message: 'duplicate key value' };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(409);
  });

  it('inserts with the internal/self-service conventions on the happy path', async () => {
    const res = await POST(
      post({ phone: '9876543210', custom_fields: { tshirt: 'L' } }),
      { params }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ registration_id: 'reg-new' });

    const row = inserted.payload!;
    expect(row.participant_type).toBe('internal');
    expect(row.source).toBe('event_self');
    expect(row.status).toBe('registered');
    expect(row.payment_status).toBe('not_required');
    expect(row.profile_id).toBe('user-1');
    expect(row.participant_phone).toBe('9876543210');
    expect(row.custom_fields).toEqual({ tshirt: 'L' });
    expect(row.department).toBe('Mechanical');
  });

  it('stores answers in custom_fields, never custom_data', async () => {
    await POST(post({ phone: '9876543210', custom_fields: { tshirt: 'L' } }), { params });
    expect(inserted.payload).not.toHaveProperty('custom_data');
  });

  it('keeps a custom-field answer whose key matches a defined form field', async () => {
    await POST(post({ phone: '9876543210', custom_fields: { tshirt: 'L' } }), { params });
    expect(inserted.payload!.custom_fields).toEqual({ tshirt: 'L' });
  });

  it('strips an unknown custom-field key before inserting', async () => {
    await POST(
      post({ phone: '9876543210', custom_fields: { tshirt: 'L', 'Payment Status': 'PAID' } }),
      { params }
    );
    expect(inserted.payload!.custom_fields).toEqual({ tshirt: 'L' });
  });

  it('never writes bib_number, which is globally unique', async () => {
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.bib_number).toBeUndefined();
  });

  it("stores the EVENT's institution, not the registrant's", async () => {
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.institution_id).toBe('inst-1');
  });

  it('falls back to email when the profile has no full_name (column is NOT NULL)', async () => {
    results.profiles = { ...PROFILE, full_name: null };
    await POST(post({ phone: '9876543210' }), { params });
    expect(inserted.payload!.participant_name).toBe('aimech@jkkn.ac.in');
  });

  it('registers fine when the profile has no department', async () => {
    results.profiles = { ...PROFILE, department_id: null };
    const res = await POST(post({ phone: '9876543210' }), { params });
    expect(res.status).toBe(201);
    expect(inserted.payload!.department).toBeNull();
  });
});
