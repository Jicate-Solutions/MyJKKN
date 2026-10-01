// __tests__/instasolver/qr-stickers.test.ts
// ============================================================================
// The central sticker desk (Director ruling, 1 Oct 2026): stickers are printed
// and stuck by ONE central team — JKKN Main Office — for every college.
//
// Pinned here:
//   1. WHO — super admins, and Main Office people who hold
//      resources.resources.edit. A college's own estate office with the same
//      permission is refused, with the reason, BEFORE any resource is read.
//   2. ANY COLLEGE — the desk lists every college with its unprinted count.
//   3. PRINTED — recorded in custom_attributes WITHOUT losing other keys, and
//      the "not printed yet" list leaves printed rows out.
//   4. CODES — a missing sticker code is written only where it is still empty.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;

function readPath(row: Row, col: string): unknown {
  return row[col];
}

const log = { reads: [] as string[], updates: [] as Array<{ table: string; patch: Row }> };

function makeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      log.reads.push(table);
      const filters: Array<(r: Row) => boolean> = [];
      let pendingUpdate: Row | null = null;
      let limitN: number | null = null;
      const run = () => {
        const out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return limitN === null ? out : out.slice(0, limitN);
      };
      const chain: any = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filters.push((r) => readPath(r, col) === val);
          return chain;
        },
        is(col: string, val: unknown) {
          filters.push((r) => (readPath(r, col) ?? null) === val);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(readPath(r, col)));
          return chain;
        },
        order: () => chain,
        limit(n: number) {
          limitN = n;
          return chain;
        },
        update(patch: Row) {
          pendingUpdate = patch;
          return chain;
        },
        async maybeSingle() {
          return { data: run()[0] ?? null, error: null };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          if (pendingUpdate) {
            for (const r of run()) Object.assign(r, pendingUpdate);
            log.updates.push({ table, patch: pendingUpdate });
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const MAIN = '00000000-0000-4000-8000-0000000000a1';
const DENTAL = '00000000-0000-4000-8000-0000000000b2';
const R1 = '00000000-0000-4000-8000-000000000001';
const R2 = '00000000-0000-4000-8000-000000000002';
const R3 = '00000000-0000-4000-8000-000000000003';

let tables: Record<string, Row[]>;
let me: { institution_id: string | null; is_active: boolean };
let rpcResults: Record<string, boolean>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'user-1', ...me }, error: null }),
        }),
      }),
    }),
    rpc: async (name: string, args?: { permission_name?: string }) => ({
      data: name === 'user_has_permission' ? rpcResults[`perm:${args?.permission_name}`] === true : rpcResults[name] === true,
      error: null,
    }),
  }),
  createServiceRoleClient: () => makeDb(tables),
}));

async function get(qs = '') {
  const { GET } = await import('@/app/api/instasolver/qr-stickers/route');
  return GET({ nextUrl: new URL(`https://www.jkkn.ai/api/instasolver/qr-stickers${qs}`) } as any);
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/instasolver/qr-stickers/route');
  return POST({ json: async () => body } as any);
}

beforeEach(() => {
  log.reads = [];
  log.updates = [];
  me = { institution_id: MAIN, is_active: true };
  rpcResults = { is_super_admin: false, 'perm:resources.resources.edit': true };
  tables = {
    institutions: [
      { id: MAIN, name: 'JKKN Main Office' },
      { id: DENTAL, name: 'JKKN Dental College and Hospital' },
    ],
    resources: [
      { id: R1, name: 'Ceiling fan', institution_id: DENTAL, qr_code_token: 'res_aaaaaaaaaaaaaaaa', custom_attributes: { colour: 'white' } },
      { id: R2, name: 'Projector', institution_id: DENTAL, qr_code_token: null, custom_attributes: null },
      {
        id: R3,
        name: 'Lab 2',
        institution_id: DENTAL,
        qr_code_token: 'res_bbbbbbbbbbbbbbbb',
        custom_attributes: { instasolver_sticker_printed_at: '2026-09-30T10:00:00.000Z' },
      },
    ],
  };
});

describe('who may use the central sticker desk', () => {
  it('lets a Main Office person with resources.resources.edit in, and lists EVERY college', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.colleges.map((c: Row) => c.name)).toEqual(['JKKN Main Office', 'JKKN Dental College and Hospital']);
    const dental = body.colleges.find((c: Row) => c.id === DENTAL);
    expect(dental).toMatchObject({ total: 3, unprinted: 2 });
  });

  it('refuses a college’s own estate office even WITH the permission — before any resource is read', async () => {
    me = { institution_id: DENTAL, is_active: true };
    const res = await get(`?institution_id=${DENTAL}`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/central team at JKKN Main Office/);
    expect(log.reads).not.toContain('resources');
  });

  it('refuses a Main Office person WITHOUT the permission', async () => {
    rpcResults['perm:resources.resources.edit'] = false;
    const res = await post({ action: 'mark_printed', institution_id: DENTAL, resource_ids: [R1] });
    expect(res.status).toBe(403);
    expect(log.reads).not.toContain('resources');
    expect(log.updates).toHaveLength(0);
  });

  it('lets a super admin in from any college', async () => {
    me = { institution_id: DENTAL, is_active: true };
    rpcResults = { is_super_admin: true };
    const res = await get(`?institution_id=${DENTAL}`);
    expect(res.status).toBe(200);
  });

  it('accepts a Main Office name with stray spaces or different case', async () => {
    tables.institutions[0].name = '  jkkn   MAIN office ';
    expect((await get()).status).toBe(200);
  });
});

describe('rooms and items still without a printed sticker', () => {
  it('lists only the unprinted rows by default, all of them on request', async () => {
    const unprinted = await (await get(`?institution_id=${DENTAL}`)).json();
    expect(unprinted.rows.map((r: Row) => r.id).sort()).toEqual([R1, R2].sort());
    const all = await (await get(`?institution_id=${DENTAL}&show=all`)).json();
    expect(all.rows).toHaveLength(3);
    expect(all.rows.find((r: Row) => r.id === R3).printed_at).toBe('2026-09-30T10:00:00.000Z');
  });

  it('marks rows printed and KEEPS every other custom attribute', async () => {
    const res = await post({ action: 'mark_printed', institution_id: DENTAL, resource_ids: [R1, R2] });
    const body = await res.json();
    expect(body).toMatchObject({ success: true, marked: 2, skipped: 0 });
    const r1 = tables.resources.find((r) => r.id === R1)!;
    expect(r1.custom_attributes.colour).toBe('white');
    expect(typeof r1.custom_attributes.instasolver_sticker_printed_at).toBe('string');
    const after = await (await get(`?institution_id=${DENTAL}`)).json();
    expect(after.rows).toHaveLength(0);
  });

  it('leaves a row whose custom attributes are not an object untouched, and says so', async () => {
    tables.resources[0].custom_attributes = ['legacy', 'array'];
    const body = await (await post({ action: 'mark_printed', institution_id: DENTAL, resource_ids: [R1] })).json();
    expect(body).toMatchObject({ marked: 0, skipped: 1 });
    expect(tables.resources[0].custom_attributes).toEqual(['legacy', 'array']);
  });

  it('ignores ids from another college', async () => {
    const body = await (await post({ action: 'mark_printed', institution_id: MAIN, resource_ids: [R1] })).json();
    expect(body.marked).toBe(0);
    expect(tables.resources[0].custom_attributes.instasolver_sticker_printed_at).toBeUndefined();
  });
});

describe('preparing sticker codes', () => {
  it('writes a code only where it is empty, in the shape the scan page accepts', async () => {
    const body = await (await post({ action: 'prepare', institution_id: DENTAL, resource_ids: [R1, R2] })).json();
    expect(body.success).toBe(true);
    expect(tables.resources[0].qr_code_token).toBe('res_aaaaaaaaaaaaaaaa');
    const minted = tables.resources[1].qr_code_token;
    const { isValidQrToken } = await import('@/lib/instasolver/resource-report');
    expect(isValidQrToken(minted)).toBe(true);
    expect(body.rows.every((r: Row) => typeof r.qr_code_token === 'string')).toBe(true);
    expect(log.updates).toHaveLength(1);
  });
});
