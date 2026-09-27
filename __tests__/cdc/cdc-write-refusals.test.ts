/**
 * BUG-005292 and BUG-005250 — a write the database refuses must say so.
 *
 * Industry mentor edit: the row-level rule on industry_mentors lets only the
 * person who added the mentor (or an admin / institution admin) update it. A
 * CDC head who can open the page and press Edit got "JSON object requested,
 * multiple (or no) rows returned" and a 500.
 *
 * Bulletin post: the write rule admits only the CDC head / super admin, while
 * the form opens for anyone holding cdc.bulletin.create. A coordinator's post
 * came back as 42501 and the screen said only "Failed to post opportunity".
 *
 * Who may edit or post is a Director decision and is NOT changed here; these
 * tests pin that the refusal is named rather than disguised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Industry mentor PATCH — server client fake
// ---------------------------------------------------------------------------

let mentorVisible = true;

function mentorsTable() {
  let updating = false;
  const q: any = {};
  q.update = () => {
    updating = true;
    return q;
  };
  for (const m of ['select', 'eq']) q[m] = () => q;
  // The update matched no row (RLS USING false) — what PostgREST returns.
  q.single = () =>
    Promise.resolve(
      updating
        ? {
            data: null,
            error: {
              code: 'PGRST116',
              details: 'The result contains 0 rows',
              message: 'JSON object requested, multiple (or no) rows returned',
            },
          }
        : { data: null, error: null }
    );
  q.maybeSingle = () =>
    Promise.resolve({ data: mentorVisible ? { id: 'mentor-1' } : null, error: null });
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'cdc-head' } }, error: null }) },
      from: () => mentorsTable(),
    }),
}));

// ---------------------------------------------------------------------------
// Bulletin create — browser client fake (the service writes from the browser)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => {
      const q: any = {};
      for (const m of ['insert', 'select']) q[m] = () => q;
      q.single = () =>
        Promise.resolve({
          data: null,
          error: {
            code: '42501',
            details: null,
            hint: null,
            message: 'new row violates row-level security policy for table "cdc_external_opportunities"',
          },
        });
      return q;
    },
  }),
}));

import { PATCH } from '@/app/api/cdc/industry-mentors/[id]/route';
import { BulletinService } from '@/lib/services/cdc/bulletin-service';

function patchMentor() {
  return PATCH(
    new NextRequest('http://localhost/api/cdc/industry-mentors/mentor-1', {
      method: 'PATCH',
      body: JSON.stringify({ designation: 'Plant Head' }),
    }),
    { params: Promise.resolve({ id: 'mentor-1' }) }
  );
}

beforeEach(() => {
  mentorVisible = true;
});

describe('Industry mentor edit refused by the database', () => {
  it('answers 403 and names who can edit, instead of a 500 with PostgREST text', async () => {
    const res = await patchMentor();
    expect(res.status).toBe(403);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(/not allowed to change it/);
    expect(error).not.toMatch(/JSON object requested/);
  });

  it('answers 404 when the mentor cannot be read at all', async () => {
    mentorVisible = false;
    const res = await patchMentor();
    expect(res.status).toBe(404);
  });
});

describe('Bulletin post refused by the database', () => {
  it('throws an Error that says posting is limited to the CDC head', async () => {
    const attempt = BulletinService.createOpportunity({
      title: 'Hackathon',
      description: 'Inter-college',
    } as never);
    await expect(attempt).rejects.toBeInstanceOf(Error);
    await expect(attempt).rejects.toThrow(/limited to the CDC head/);
  });
});
