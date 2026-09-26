/**
 * BUG-005760 — "Duplicate mentor entries in Industry Mentors directory".
 *
 * Production (24 Sep 2026): the reported duplicate is two rows for one mentor
 * written 0.7 s apart by the same account — one double submit — and a third
 * active row shares the same email under another spelling of the name. The
 * create route inserted whatever it was sent.
 *
 * Supabase is faked; the fake applies `.eq()` filters so the duplicate check
 * is exercised against the rows it would really read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
let mentors: Row[] = [];
let inserted: Row[] = [];

function mentorsTable() {
  const filters: Array<[string, unknown]> = [];
  let pendingInsert: Row | null = null;
  const q: any = {};
  q.select = () => q;
  q.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    return q;
  };
  q.insert = (row: Row) => {
    pendingInsert = row;
    return q;
  };
  q.single = () => {
    if (pendingInsert) {
      const row = { id: `new-${inserted.length + 1}`, ...pendingInsert };
      inserted.push(row);
      return Promise.resolve({ data: row, error: null });
    }
    return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
  };
  q.then = (res: any, rej: any) =>
    Promise.resolve({
      data: mentors.filter((m) => filters.every(([c, v]) => m[c] === v)),
      error: null,
    }).then(res, rej);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'cdc-coordinator' } }, error: null }) },
      from: () => mentorsTable(),
    }),
}));

import { POST } from '@/app/api/cdc/industry-mentors/route';

function create(email: string, institution_id = 'inst-1') {
  return POST(
    new NextRequest('http://localhost/api/cdc/industry-mentors', {
      method: 'POST',
      body: JSON.stringify({
        institution_id,
        mentor_name: 'A Mentor',
        email,
        mentor_category_id: 'cat-1',
      }),
    })
  );
}

beforeEach(() => {
  inserted = [];
  mentors = [
    { id: 'existing-1', institution_id: 'inst-1', is_active: true, email: 'mentor@example.com' },
    { id: 'retired-1', institution_id: 'inst-1', is_active: false, email: 'old@example.com' },
  ];
});

describe('Industry mentor create refuses a repeat of an active mentor', () => {
  it('returns 409 with the existing entry, and writes nothing, for the same email (any case / spacing)', async () => {
    const res = await create('  Mentor@Example.COM ');
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; existing_id: string };
    expect(body.existing_id).toBe('existing-1');
    expect(body.error).toMatch(/already in the directory/);
    expect(inserted).toHaveLength(0);
  });

  it('still creates a new email, a deactivated mentor, or the same email in another institution', async () => {
    expect((await create('new@example.com')).status).toBe(201);
    expect((await create('old@example.com')).status).toBe(201);
    expect((await create('mentor@example.com', 'inst-2')).status).toBe(201);
    expect(inserted).toHaveLength(3);
  });
});
