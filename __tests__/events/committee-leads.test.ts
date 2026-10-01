// __tests__/events/committee-leads.test.ts
//
// Cover for the committee-lead grant added on 2026-09-21.
//
// Background: on the JKKN100 tournament, eleven committees each named a lead in
// a free-text box and not one of those leads could add a task to their own
// committee. The database has had a policy for exactly this since the marathon
// days, keyed on event_committees.lead_id — a column no UI has ever written, so
// it stood at NULL on all 61 committees in production and the rule never fired.
//
// Two things are worth a test:
//
//  1. setLeads must drop people with no MyJKKN login from lead_ids while still
//     printing their name. lead_ids is what the RLS policy matches against
//     auth.uid(); a row id or a null in there is either a silent no-op or a
//     constraint error, and the organizer would have no way to tell which.
//  2. The migration must widen every place a lead is looked up, not just the
//     write policy. A lead who may write rows they cannot then read is a worse
//     bug than one who cannot write at all.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import { EventCommitteeService } from '@/lib/services/events/shared/event-committee-service';
import type { MarathonCommittee } from '@/types/events-marathon';

const committee = (over: Partial<MarathonCommittee> = {}): MarathonCommittee =>
  ({
    id: 'c1',
    event_id: 'e1',
    name: 'Discipline Committee',
    description: null,
    lead_id: null,
    lead_ids: [],
    lead_name: null,
    member_ids: [],
    member_names: [],
    status: 'active',
    created_at: '',
    updated_at: '',
    ...over,
  }) as MarathonCommittee;

/** Capture the body the service PUTs to the committees API route. */
function captureFetch() {
  const calls: any[] = [];
  const fake = vi.fn(async (_url: string, init: any) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({}) } as any;
  });
  vi.stubGlobal('fetch', fake);
  return calls;
}

describe('EventCommitteeService.setLeads', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('puts only people WITH a login into lead_ids, and names them all', async () => {
    const calls = captureFetch();
    await EventCommitteeService.setLeads(committee(), [
      { member_id: 'uid-sneka', name: 'SNEKA S' },
      { member_id: null, name: 'HARINI' },
    ]);
    expect(calls).toHaveLength(1);
    // HARINI has no MyJKKN login, so she is named but holds no grant.
    expect(calls[0].lead_ids).toEqual(['uid-sneka']);
    expect(calls[0].lead_name).toBe('SNEKA S & HARINI');
  });

  it('keeps the legacy single-lead column pointing at the first real lead', async () => {
    const calls = captureFetch();
    await EventCommitteeService.setLeads(committee(), [
      { member_id: 'uid-a', name: 'MURALIDHARAN' },
      { member_id: 'uid-b', name: 'MANIKANDAN' },
    ]);
    // Older policies and the marathon board still read lead_id; leaving it null
    // while lead_ids is populated would make the two disagree.
    expect(calls[0].lead_id).toBe('uid-a');
    expect(calls[0].lead_ids).toEqual(['uid-a', 'uid-b']);
  });

  it('clears both columns when every named lead lacks a login', async () => {
    const calls = captureFetch();
    await EventCommitteeService.setLeads(committee({ lead_id: 'old', lead_ids: ['old'] }), [
      { member_id: null, name: 'Pritha Princy . S' },
    ]);
    expect(calls[0].lead_ids).toEqual([]);
    expect(calls[0].lead_id).toBeNull();
    expect(calls[0].lead_name).toBe('Pritha Princy . S');
  });

  it('sends event_id, which the API route requires to scope the update', async () => {
    const calls = captureFetch();
    await EventCommitteeService.setLeads(committee({ event_id: 'evt-9' }), [
      { member_id: 'uid-a', name: 'A' },
    ]);
    expect(calls[0].event_id).toBe('evt-9');
  });
});

describe('the committee-lead migration', () => {
  // Comments in this migration quote the OLD policy body, lead_ids and all, so a
  // naive substring search passes on the prose alone. Strip comments first.
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261229090000_committee_leads_manage_own_tasks.sql'),
    'utf8'
  )
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('adds the lead_ids column', () => {
    expect(sql).toMatch(/ALTER TABLE public\.event_committees[\s\S]*ADD COLUMN IF NOT EXISTS lead_ids uuid\[\]/);
  });

  it('widens all four lookups, not only the write policy', () => {
    for (const create of [
      'CREATE POLICY "marathon_tasks_lead_manage"',
      'CREATE POLICY "marathon_tasks_committee_member_read"',
      'CREATE POLICY "marathon_committees_member_read"',
      'CREATE OR REPLACE FUNCTION public.fn_is_event_committee_member',
    ]) {
      const from = sql.indexOf(create);
      expect(from, `${create} missing from the migration`).toBeGreaterThan(-1);
      // Slice to the NEXT statement so a match cannot leak in from its neighbour
      // (and so a DROP POLICY line of the same name cannot stand in for the
      // CREATE, which is what this assertion caught the first time it ran).
      const next = sql.indexOf('\nCREATE ', from + 1);
      const body = sql.slice(from, next === -1 ? sql.length : next);
      expect(body, `${create} does not match lead_ids`).toMatch(
        /ANY\s*\(\s*(c\.|mc\.)?lead_ids\s*\)/
      );
    }
  });

  it('gives the write policy a WITH CHECK — without one an INSERT is unguarded', () => {
    const policy = sql.slice(sql.indexOf('CREATE POLICY "marathon_tasks_lead_manage"'));
    expect(policy.slice(0, policy.indexOf(';'))).toContain('WITH CHECK');
  });

  it('leaves the RPC closed to anon', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_is_event_committee_member\(uuid\) FROM anon, PUBLIC;/);
    expect(sql).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.fn_is_event_committee_member\(uuid\) TO authenticated;/);
  });
});
