/**
 * OneMark — /api/foundation/onemark/prefs.
 *
 * The route has one job and two failure modes worth naming:
 *
 *   * SIGNED OUT is 401, not a silent English default. An interface language is
 *     not a permission, but a route that answers a stranger with a cheerful 200
 *     hides the real problem (CLAUDE.md #27).
 *   * SCHEMA PENDING is not an error the learner can act on. onemark_user_prefs
 *     arrives with Lane S3's migration, which the coordinator applies before
 *     merge; until then PostgREST says 42P01 / PGRST205, and the learner home
 *     must still render. GET reports English with persisted:false; PUT reports
 *     503 with the choice echoed back so the browser keeps it locally.
 *
 * Fixtures only — no database, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type PgError = { code?: string; message?: string } | null;

let currentUser: { id: string } | null = { id: 'user-1' };
let selectResult: { data: any; error: PgError } = { data: null, error: null };
let upsertResult: { data: any; error: PgError } = {
  data: { ui_locale: 'ta' },
  error: null,
};
let upsertCalls: Array<{ table: string; payload: any; options: any }> = [];
let selectFilters: Array<{ table: string; column: string; value: any }> = [];

vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (table: string) => ({
        select: () => ({
          eq: (column: string, value: any) => ({
            maybeSingle: () => {
              selectFilters.push({ table, column, value });
              return Promise.resolve(selectResult);
            },
          }),
        }),
        upsert: (payload: any, options: any) => {
          upsertCalls.push({ table, payload, options });
          return {
            select: () => ({ maybeSingle: () => Promise.resolve(upsertResult) }),
          };
        },
      }),
    }),
  createServiceRoleClient: () => {
    throw new Error('the prefs route must never take a service-role client');
  },
}));

import { GET, PUT } from '@/app/api/foundation/onemark/prefs/route';

function put(body: unknown) {
  const { NextRequest } = require('next/server');
  return PUT(
    new NextRequest('http://localhost/api/foundation/onemark/prefs', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  selectResult = { data: null, error: null };
  upsertResult = { data: { ui_locale: 'ta' }, error: null };
  upsertCalls = [];
  selectFilters = [];
});

describe('GET', () => {
  it('refuses a signed-out caller with 401', async () => {
    currentUser = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('reports English and persisted:false when nobody has touched the switch', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uiLocale: 'en', persisted: false });
  });

  it('reports the stored language when a row exists', async () => {
    selectResult = { data: { ui_locale: 'ta' }, error: null };
    expect(await (await GET()).json()).toEqual({ uiLocale: 'ta', persisted: true });
  });

  it('reads only the caller own row', async () => {
    await GET();
    expect(selectFilters).toEqual([
      { table: 'onemark_user_prefs', column: 'user_id', value: 'user-1' },
    ]);
  });

  it('coerces an unexpected stored value back to English', async () => {
    // Belt and braces: the CHECK constraint forbids it, but a value that
    // somehow arrived must never reach the dictionary lookup.
    selectResult = { data: { ui_locale: 'hi' }, error: null };
    expect(await (await GET()).json()).toEqual({ uiLocale: 'en', persisted: true });
  });

  it.each(['42P01', 'PGRST205'])(
    'answers 200 with English when the table is not live yet (%s)',
    async (code) => {
      selectResult = { data: null, error: { code, message: 'whatever' } };
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        uiLocale: 'en',
        persisted: false,
        reason: 'schema_pending',
      });
    },
  );

  it('recognises the missing table by message when the code is unhelpful', async () => {
    selectResult = {
      data: null,
      error: { code: undefined, message: 'relation "onemark_user_prefs" does not exist' },
    };
    expect((await GET()).status).toBe(200);
  });

  it('says so, rather than defaulting, when the read genuinely fails', async () => {
    selectResult = { data: null, error: { code: '42501', message: 'permission denied' } };
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/interface language/i);
  });
});

describe('PUT', () => {
  it('refuses a signed-out caller with 401', async () => {
    currentUser = null;
    expect((await put({ uiLocale: 'ta' })).status).toBe(401);
  });

  it('saves a valid choice against the caller own id', async () => {
    const res = await put({ uiLocale: 'ta' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uiLocale: 'ta', persisted: true });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].payload).toEqual({ user_id: 'user-1', ui_locale: 'ta' });
    expect(upsertCalls[0].options).toEqual({ onConflict: 'user_id' });
  });

  it('accepts the column spelling too', async () => {
    upsertResult = { data: { ui_locale: 'en' }, error: null };
    expect((await put({ ui_locale: 'en' })).status).toBe(200);
  });

  it.each([{ uiLocale: 'hi' }, { uiLocale: '' }, { uiLocale: 3 }, {}, null])(
    'refuses %j with 400 and writes nothing',
    async (body) => {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(upsertCalls).toEqual([]);
    },
  );

  it('ignores a user_id in the body — the session decides who this is', async () => {
    await put({ uiLocale: 'ta', user_id: 'somebody-else' });
    expect(upsertCalls[0].payload.user_id).toBe('user-1');
  });

  it('answers 503 with the choice echoed back when the table is not live yet', async () => {
    upsertResult = { data: null, error: { code: 'PGRST205', message: 'not in schema cache' } };
    const res = await put({ uiLocale: 'ta' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'The interface-language store is not live yet.',
      reason: 'schema_pending',
      uiLocale: 'ta',
      persisted: false,
    });
  });

  it('answers 500 on a real write failure', async () => {
    upsertResult = { data: null, error: { code: '23514', message: 'check constraint' } };
    expect((await put({ uiLocale: 'ta' })).status).toBe(500);
  });
});
