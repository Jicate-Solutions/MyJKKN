/**
 * Playbook decide / retire routes take the id in the JSON body (route budget).
 *
 * Both live at STATIC paths — /api/hr/playbooks/decide and
 * /api/hr/playbooks/lines/retire — because an [id] segment costs 2 against the
 * Vercel route budget. The id is still checked as a uuid (400 on a bad one)
 * before the database function is called, and sign-in is still checked first.
 *
 * Run: npx vitest run __tests__/hr/playbook-routes-static.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ID = '00000000-0000-4000-8000-00000000f001';
const calls: Array<{ fn: string; args: unknown[] }> = [];
let signedIn = true;
const client = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'user-1' } : null } }) } };

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => client }));
vi.mock('@/lib/services/hr/playbooks/playbook-service', () => ({
  PlaybookError: class extends Error { status = 400; },
  playbookService: {
    decide: async (...args: unknown[]) => { calls.push({ fn: 'decide', args }); return 'line-1'; },
    retireLine: async (...args: unknown[]) => { calls.push({ fn: 'retireLine', args }); return 'line-1'; },
  },
}));

import { POST as decide } from '@/app/api/hr/playbooks/decide/route';
import { POST as retire } from '@/app/api/hr/playbooks/lines/retire/route';

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => { calls.length = 0; signedIn = true; });

describe('POST /api/hr/playbooks/decide', () => {
  it('passes the body id to the database function', async () => {
    const res = await decide(post('/api/hr/playbooks/decide', { id: ID, decision: 'accept' }));
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ fn: 'decide', args: [client, ID, { decision: 'accept', edited_text: null, note: null }] });
  });

  it('answers 400 on a missing or non-uuid id without calling the database', async () => {
    for (const body of [{ decision: 'accept' }, { id: 'not-a-uuid', decision: 'accept' }, { id: 42, decision: 'accept' }]) {
      const res = await decide(post('/api/hr/playbooks/decide', body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown proposal.' });
    }
    expect(calls).toHaveLength(0);
  });

  it('still answers 401 before anything else when signed out', async () => {
    signedIn = false;
    const res = await decide(post('/api/hr/playbooks/decide', { id: ID, decision: 'accept' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/hr/playbooks/lines/retire', () => {
  it('passes the body id and note to the database function', async () => {
    const res = await retire(post('/api/hr/playbooks/lines/retire', { id: ID, note: 'out of date' }));
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ fn: 'retireLine', args: [client, ID, 'out of date'] });
  });

  it('answers 400 on a bad id without calling the database', async () => {
    const res = await retire(post('/api/hr/playbooks/lines/retire', { id: 'nope', note: 'x' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown line.' });
    expect(calls).toHaveLength(0);
  });
});
