/**
 * HR Recruitment — the candidate page tells people WHY something failed.
 *
 *   1. BUG-006128 — a faculty member with no Recruitment access opened a
 *      candidate link someone had shared and read "Candidate not found". RLS
 *      hides the row, so the GET now answers 403 with a plain "you do not have
 *      access, ask HR or the COO" sentence for a caller without the view key,
 *      and keeps 404 for a caller who has it (the row's existence is never
 *      revealed either way).
 *   2. BUG-006075 — "unknown error" on the candidate page. A database refusal
 *      arrives as a PostgrestError, a plain object, so `err instanceof Error`
 *      turned the RPC's own guard sentence into "Unknown error". The step-comment
 *      and comments handlers now keep the database's text.
 *
 * Supabase and the cookie store are faked; only the handlers' answers are tested.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

let candidateRow: Record<string, unknown> | null = null;
let rpcAnswers: Record<string, unknown> = {};
let rpcError: Record<string, unknown> | null = null;
let insertError: Record<string, unknown> | null = null;

function fakeClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: (name: string, args?: { permission_name?: string }) => {
      if (name === 'fn_update_recruitment_step_comment') {
        return Promise.resolve({ data: null, error: rpcError });
      }
      const key = name === 'user_has_permission' ? `perm:${args?.permission_name}` : name;
      return Promise.resolve({ data: rpcAnswers[key] ?? false, error: null });
    },
    from: () => {
      const q: any = {};
      for (const m of ['select', 'eq', 'order']) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: candidateRow, error: null });
      q.insert = () => q;
      q.single = () => Promise.resolve({ data: null, error: insertError });
      return q;
    },
  };
}

vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined, set: () => {} }) }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { GET as getCandidate } from '@/lib/api/hr/recruitment/candidates/handlers/candidate';
import { PATCH as patchStepComment } from '@/lib/api/hr/recruitment/candidates/handlers/step-comment';
import { POST as postComment } from '@/lib/api/hr/recruitment/candidates/handlers/comments';

const ID = '2f1c8c8e-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ id: ID }) };
const req = (body?: unknown) =>
  new NextRequest(`http://localhost/api/hr/recruitment/candidates/${ID}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  candidateRow = null;
  rpcAnswers = {};
  rpcError = null;
  insertError = null;
});

describe('BUG-006128 — a candidate the caller cannot see', () => {
  it('says "no access" (403) to someone without Recruitment view access', async () => {
    const res = await getCandidate(req(), params);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.reason).toBe('no_recruitment_access');
    expect(body.error).toMatch(/do not have access/i);
    expect(body.error).toMatch(/HR or the COO/);
  });

  it('keeps 404 for someone who has Recruitment view access', async () => {
    rpcAnswers['perm:hr.recruitment.view'] = true;
    const res = await getCandidate(req(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('still returns the row when RLS lets the caller read it', async () => {
    candidateRow = { id: ID, status: 'pending_approval' };
    const res = await getCandidate(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ID);
  });
});

describe('BUG-006075 — a database refusal is not "Unknown error"', () => {
  it('step-comment keeps the RPC refusal text', async () => {
    rpcError = { code: '42501', message: 'Only the step author can edit this comment.', details: null, hint: null };
    const res = await patchStepComment(req({ step_index: 0, comment: 'x' }), params);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Only the step author can edit this comment.');
  });

  it('comments POST keeps the RLS refusal text', async () => {
    candidateRow = { id: ID, hr_organization_id: 'org-1' };
    insertError = { code: '42501', message: 'new row violates row-level security policy', details: null, hint: null };
    const res = await postComment(req({ comment: 'hello' }), params);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('new row violates row-level security policy');
  });
});
