/**
 * app/api/v1/transport-requests — a person's own outside-AI key is refused.
 *
 * This route compares the RAW bearer text with api_keys.key_value and checks
 * no permission. A personal key (key_kind 'personal', migration
 * 20270301090000) stores the SHA-256 of its key in key_value, and the key's
 * owner knows the plaintext, so the owner can compute that hash and send it as
 * the bearer. The lookup then finds the row. The route must refuse it by kind;
 * an administrator key (or a row from before the migration, with no key_kind)
 * keeps working.
 */
import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let keyRow: Record<string, unknown> | null = null;
const lookedUpWith: unknown[] = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = chain;
  b.order = chain;
  b.range = chain;
  b.gte = chain;
  b.lte = chain;
  b.eq = (col: string, val: unknown) => {
    if (table === 'api_keys' && col === 'key_value') lookedUpWith.push(val);
    return b;
  };
  b.maybeSingle = async () => ({ data: table === 'api_keys' ? keyRow : null, error: null });
  b.single = async () => ({ data: table === 'service_types' ? { id: 'transport-type' } : null, error: null });
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: (t: string) => builder(t) })),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { GET } from '@/app/api/v1/transport-requests/route';

const PLAINTEXT = 'jkkn_pk_' + 'ab'.repeat(24);
const STORED_HASH = createHash('sha256').update(PLAINTEXT).digest('hex');

function call(bearer: string) {
  return GET(
    new Request('https://www.jkkn.ai/api/v1/transport-requests', {
      headers: { authorization: `Bearer ${bearer}` },
    })
  );
}

beforeEach(() => {
  keyRow = null;
  lookedUpWith.length = 0;
});

describe('GET /api/v1/transport-requests', () => {
  it('refuses a personal key presented as its stored hash (the owner can compute it)', async () => {
    keyRow = { id: 'k1', key_value: STORED_HASH, is_active: true, key_kind: 'personal' };
    const res = await call(STORED_HASH);
    expect(lookedUpWith).toEqual([STORED_HASH]);
    expect(res.status).toBe(401);
  });

  it('still serves an administrator key', async () => {
    keyRow = { id: 'k2', key_value: 'admin-key', is_active: true, key_kind: 'admin' };
    const res = await call('admin-key');
    expect(res.status).toBe(200);
  });

  it('still serves a row from before the migration (no key_kind column)', async () => {
    keyRow = { id: 'k3', key_value: 'old-key', is_active: true };
    const res = await call('old-key');
    expect(res.status).toBe(200);
  });
});
