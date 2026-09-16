/**
 * app/api/hr/staff-photo/review — the approval route.
 *
 * WHY THIS ROUTE IS WORTH PINNING, since the diff alone does not say it:
 * approving here is the ONLY path in the product by which a photograph a person
 * took of themselves reaches staff.profile_picture, which is the column
 * lib/id-cards/photo-quality.ts trusts when it decides whether an identity card
 * may print. The Director ruled on 2026-09-03 that a self-supplied picture is
 * NOT evidence the institution photographed anyone and must be refused; this
 * route's approval step is the institutional act that ruling requires. A
 * regression here does not show up as a broken screen — it shows up as a card
 * carrying a face nobody checked.
 *
 * Three things have to hold, and none is provable by reading the diff:
 *
 *  1. A REFUSED APPROVAL LEAVES NOTHING BEHIND. The file is copied to the
 *     PUBLIC bucket before the database is asked to bless it, because the
 *     function validates the resulting URL. So when the function refuses — a
 *     reviewer without the permission, or outside the institution — the copy
 *     must be removed again. Otherwise a refusal still publishes a picture of
 *     somebody at a permanent, unauthenticated URL.
 *
 *  2. INVISIBLE MEANS UNREVIEWABLE. The submission is read back under the
 *     reviewer's own session first. RLS decides. If it returns nothing, the
 *     route must stop before touching storage rather than fall through to a
 *     service-role read that would see everything.
 *
 *  3. A REJECTION NEVER PUBLISHES. Rejecting must not copy anything into the
 *     public bucket, and must clear the pending picture — it is a photograph of
 *     a person with no further purpose.
 *
 * Everything below the route's own decisions is mocked; the route's branching
 * is the subject under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── storage spies, shared across both clients ───────────────────────────────
const publicUploads: string[] = [];
const publicRemovals: string[] = [];
const privateRemovals: string[] = [];

let rpcResult: { data: unknown; error: { message: string } | null } = { data: [{}], error: null };
let submissionRow: Record<string, unknown> | null = null;

function makeAdmin() {
  return {
    storage: {
      from(bucket: string) {
        return {
          download: async () => ({ data: new Blob(['x']), error: null }),
          upload: async (path: string) => {
            if (bucket === 'staff-images') publicUploads.push(path);
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://p.supabase.co/storage/v1/object/public/staff-images/${path}` },
          }),
          remove: async (paths: string[]) => {
            if (bucket === 'staff-images') publicRemovals.push(...paths);
            else privateRemovals.push(...paths);
            return { error: null };
          },
        };
      },
    },
  };
}

function makeUserClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'reviewer-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: submissionRow, error: null }),
        }),
      }),
    }),
    rpc: async () => rpcResult,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => makeAdmin(),
  createServerSupabaseClient: async () => makeUserClient(),
}));

import { POST } from '@/app/api/hr/staff-photo/review/route';

function req(body: unknown) {
  return new Request('http://localhost/api/hr/staff-photo/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  publicUploads.length = 0;
  publicRemovals.length = 0;
  privateRemovals.length = 0;
  rpcResult = { data: [{}], error: null };
  submissionRow = {
    id: 'sub-1',
    staff_id: 'staff-1',
    storage_path: 'staff-1/111.jpg',
    status: 'pending',
  };
});

describe('staff photo review route', () => {
  it('approves: publishes the picture and clears the pending copy', async () => {
    const res = await POST(req({ submission_id: 'sub-1', approve: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(publicUploads).toHaveLength(1);
    // The published path carries the staff id, which the database function
    // checks for — an approved URL must belong to the person it is set on.
    expect(publicUploads[0].startsWith('staff-1/')).toBe(true);
    expect(publicRemovals).toHaveLength(0);
    expect(privateRemovals).toEqual(['staff-1/111.jpg']);
  });

  it('a refused approval removes the file it had already published', async () => {
    rpcResult = { data: null, error: { message: 'Not allowed to review photographs for this institution' } };

    const res = await POST(req({ submission_id: 'sub-1', approve: true }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    // The heart of it: published once, then taken back down. A refusal that
    // left this behind would mean a refused photograph is readable by anyone
    // holding the URL, permanently.
    expect(publicUploads).toHaveLength(1);
    expect(publicRemovals).toEqual(publicUploads);
    // ...and the pending copy is NOT destroyed, because nothing was decided.
    expect(privateRemovals).toHaveLength(0);
  });

  it('a submission the reviewer cannot see is refused before storage is touched', async () => {
    submissionRow = null; // RLS returned nothing

    const res = await POST(req({ submission_id: 'sub-1', approve: true }));

    expect(res.status).toBe(403);
    expect(publicUploads).toHaveLength(0);
    expect(privateRemovals).toHaveLength(0);
  });

  it('rejecting publishes nothing and clears the pending picture', async () => {
    const res = await POST(req({ submission_id: 'sub-1', approve: false, note: 'Too dark' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('rejected');
    expect(publicUploads).toHaveLength(0);
    expect(privateRemovals).toEqual(['staff-1/111.jpg']);
  });

  it('an already-decided submission cannot be decided twice', async () => {
    submissionRow = { ...(submissionRow as object), status: 'approved' };

    const res = await POST(req({ submission_id: 'sub-1', approve: true }));

    expect(res.status).toBe(409);
    expect(publicUploads).toHaveLength(0);
  });

  it('a decision must name both a submission and a verdict', async () => {
    const res = await POST(req({ submission_id: 'sub-1' }));
    expect(res.status).toBe(400);
    expect(publicUploads).toHaveLength(0);
  });
});
