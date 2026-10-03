// __tests__/campus-walk/report-card-run.test.ts
// ============================================================================
// The Monday report card bells: once per college per week, never to an empty
// list, and a college with no head on record is named to the Director.
// Every dependency is injected — no database, no real bell.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReportCards, weekFromMonday } from '@/lib/campus-walk/report-card';
import {
  collegeBellKey,
  directorBellKey,
  loadComplaintRows,
  loadPlacementLookups,
  REPORT_CARD_CATEGORY,
  reportCardUrl,
  resolveReportCardViewer,
  runWeeklyReportCard,
  type ReportCardRunDeps
} from '@/lib/campus-walk/report-card-run';

const WEEK = weekFromMonday('2026-06-22');
const NOW = new Date('2026-06-29T02:37:00Z');
const admin = {} as SupabaseClient;

const COLLEGES = [
  { id: 'inst-arts', name: 'Arts College' },
  { id: 'inst-engg', name: 'Engineering College' },
  { id: 'inst-nursing', name: 'Nursing College' }
];

function makeDeps(overrides: Partial<ReportCardRunDeps> = {}) {
  const sentKeys = new Set<string>();
  const sendBell = vi.fn(async (_admin: SupabaseClient, opts: any) => {
    if (sentKeys.has(opts.idempotencyKey)) return null; // the DB's unique index
    sentKeys.add(opts.idempotencyKey);
    return `notif-${sentKeys.size}`;
  });
  const deps: ReportCardRunDeps = {
    loadReportCards: async () => ({
      colleges: COLLEGES,
      board: buildReportCards({ colleges: COLLEGES, tasks: [], complaints: [], week: WEEK, now: NOW })
    }),
    resolveHeads: async () =>
      new Map([
        ['inst-arts', ['principal-arts']],
        ['inst-engg', ['principal-engg', 'principal-engg']],
        ['inst-nursing', []]
      ]),
    resolveDirectorIds: async () => ({ ids: ['director-1'], source: 'director' }),
    alreadySent: async (_admin, key) => sentKeys.has(key),
    sendBell,
    ...overrides
  };
  return { deps, sendBell, sentKeys };
}

describe('runWeeklyReportCard', () => {
  it('sends one bell per college head, and one to the Director, keyed college + week', async () => {
    const { deps, sendBell } = makeDeps();
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);

    expect(result.collegeBellsSent).toBe(2);
    expect(result.directorBell).toBe('sent');
    expect(sendBell).toHaveBeenCalledTimes(3);

    const arts = sendBell.mock.calls[0][1];
    expect(arts.recipientIds).toEqual(['principal-arts']);
    expect(arts.idempotencyKey).toBe(collegeBellKey('2026-06-22', 'inst-arts'));
    expect(arts.title).toBe("Your college's week: 0 fixed, 0 late");
    expect(arts.url).toBe(reportCardUrl('2026-06-22'));
    expect(arts.category).toBe(REPORT_CARD_CATEGORY);
    expect(arts.expiresAt).toBeTruthy();

    // A head listed twice is sent one bell, not two.
    expect(sendBell.mock.calls[1][1].recipientIds).toEqual(['principal-engg']);

    const director = sendBell.mock.calls[2][1];
    expect(director.recipientIds).toEqual(['director-1']);
    expect(director.idempotencyKey).toBe(directorBellKey('2026-06-22'));
  });

  it('is idempotent: a second run for the same week sends nothing new', async () => {
    const { deps, sendBell } = makeDeps();
    await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    sendBell.mockClear();

    const again = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(sendBell).not.toHaveBeenCalled();
    expect(again.collegeBellsSent).toBe(0);
    expect(again.collegeBellsAlreadySent).toBe(2);
    expect(again.directorBell).toBe('already_sent');
    expect(again.collegeBellsFailed).toBe(0);
  });

  it('a different week is a different key, so it does send', async () => {
    const { deps, sendBell } = makeDeps();
    await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    sendBell.mockClear();
    const next = await runWeeklyReportCard(
      admin,
      { week: weekFromMonday('2026-06-29'), now: new Date('2026-07-06T02:37:00Z') },
      deps
    );
    expect(next.collegeBellsSent).toBe(2);
  });

  it('counts a lost race as already sent, not as a failure', async () => {
    const sentKeys = new Set<string>();
    const { deps } = makeDeps({
      // Nothing there when checked, then a parallel run wins the insert.
      alreadySent: vi
        .fn()
        .mockImplementation(async (_a: SupabaseClient, key: string) => sentKeys.has(key)),
      sendBell: vi.fn(async (_a: SupabaseClient, opts: any) => {
        sentKeys.add(opts.idempotencyKey);
        return null;
      })
    });
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(result.collegeBellsFailed).toBe(0);
    expect(result.collegeBellsAlreadySent).toBe(2);
    expect(result.directorBell).toBe('already_sent');
  });

  it('reports a real send failure instead of hiding it', async () => {
    const { deps } = makeDeps({ sendBell: vi.fn(async () => null) });
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(result.collegeBellsFailed).toBe(2);
    expect(result.directorBell).toBe('failed');
    expect(result.errors.length).toBe(3);
  });

  it("never sends to an empty list: no head → the college is named in the Director's bell", async () => {
    const { deps, sendBell } = makeDeps();
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);

    expect(result.collegesWithoutHead).toEqual(['Nursing College']);
    for (const call of sendBell.mock.calls) {
      expect(call[1].recipientIds.length).toBeGreaterThan(0);
    }
    const director = sendBell.mock.calls.find((c) => c[1].idempotencyKey === directorBellKey('2026-06-22'));
    expect(director?.[1].body).toContain('No head on record: Nursing College');
    expect(director?.[1].metadata.colleges_without_head).toEqual(['inst-nursing']);
  });

  it('a college missing from the head lookup entirely is treated the same as no head', async () => {
    const { deps } = makeDeps({ resolveHeads: async () => new Map([['inst-arts', ['p']]]) });
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(result.collegesWithoutHead).toEqual(['Engineering College', 'Nursing College']);
    expect(result.collegeBellsSent).toBe(1);
  });

  it('dry run counts but sends nothing', async () => {
    const { deps, sendBell } = makeDeps();
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW, dryRun: true }, deps);
    expect(sendBell).not.toHaveBeenCalled();
    expect(result.collegeBellsWouldSend).toBe(2);
    expect(result.directorBell).toBe('would_send');
  });

  it('says so when there is no Director and no super admin to tell', async () => {
    const { deps } = makeDeps({ resolveDirectorIds: async () => ({ ids: [], source: 'none' }) });
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(result.directorBell).toBe('no_recipient');
    expect(result.errors.join(' ')).toMatch(/nobody to go to/);
    // the college heads still get theirs, created by one of their own ids
    expect(result.collegeBellsSent).toBe(2);
  });
});

describe('resolveReportCardViewer', () => {
  function adminWithProfile(profile: Record<string, unknown> | null): SupabaseClient {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: profile, error: null })
    };
    return { from: () => chain } as unknown as SupabaseClient;
  }
  const heads = async (_a: SupabaseClient, ids: string[]) =>
    new Map(ids.map((id) => [id, id === 'inst-arts' ? ['principal-arts'] : []]));
  const noDirector = async () => ({ ids: ['someone-else'], source: 'director' });

  it('a super admin sees every college', async () => {
    const v = await resolveReportCardViewer(
      adminWithProfile({ id: 'u', is_super_admin: true, institution_id: null }),
      'u',
      { resolveHeads: heads, resolveDirectorIds: noDirector }
    );
    expect(v.scope).toBe('all');
  });

  it('the Director sees every college', async () => {
    const v = await resolveReportCardViewer(
      adminWithProfile({ id: 'dir', is_super_admin: false, institution_id: 'inst-arts' }),
      'dir',
      { resolveHeads: heads, resolveDirectorIds: async () => ({ ids: ['dir'], source: 'director' }) }
    );
    expect(v.scope).toBe('all');
  });

  it("a super-admin FALLBACK list does not make someone the Director", async () => {
    const v = await resolveReportCardViewer(
      adminWithProfile({ id: 'x', is_super_admin: false, institution_id: null }),
      'x',
      { resolveHeads: heads, resolveDirectorIds: async () => ({ ids: ['x'], source: 'super_admin_fallback' }) }
    );
    expect(v.scope).toBe('none');
  });

  it("a principal sees their own college's card", async () => {
    const v = await resolveReportCardViewer(
      adminWithProfile({ id: 'principal-arts', is_super_admin: false, institution_id: 'inst-arts' }),
      'principal-arts',
      { resolveHeads: heads, resolveDirectorIds: noDirector }
    );
    expect(v).toEqual({ scope: 'college', institutionId: 'inst-arts' });
  });

  it('anyone else is refused', async () => {
    const v = await resolveReportCardViewer(
      adminWithProfile({ id: 'faculty', is_super_admin: false, institution_id: 'inst-arts' }),
      'faculty',
      { resolveHeads: heads, resolveDirectorIds: noDirector }
    );
    expect(v.scope).toBe('none');
  });
});

// ── Repair round, 1 Oct 2026 ─────────────────────────────────────────────────

/** A fake admin that records each read and answers `.in('id', ids)` from fixed tables. */
function recordingAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: Array<{ table: string; columns: string; ids: string[] }> = [];
  const admin = {
    from(table: string) {
      let columns = '';
      return {
        select(c: string) {
          columns = c;
          return this;
        },
        async in(_col: string, ids: string[]) {
          calls.push({ table, columns, ids });
          return { data: (tables[table] ?? []).filter((r) => ids.includes(r.id as string)), error: null };
        }
      };
    }
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe('loadPlacementLookups', () => {
  const row = (id: string, metadata: Record<string, unknown>, owner: string | null = null) => ({
    id,
    title: 't',
    status_key: 'todo',
    is_blocked: false,
    due_date: null,
    completed_at: null,
    created_at: '2026-06-23T05:00:00Z',
    owner_staff_id: owner,
    metadata
  });

  it('reads ids, institution and department only — and skips an estate-office fallback owner', async () => {
    const { admin: fake, calls } = recordingAdmin({
      resources: [{ id: 'res-1', institution_id: 'inst-engg', department_id: 'dept-1' }],
      'staff': [{ id: 'staff-1', institution_id: 'inst-arts', department_id: 'dept-2' }],
      profiles: [{ id: 'walker', institution_id: 'inst-office' }],
      departments: [
        { id: 'dept-1', institution_id: 'inst-engg' },
        { id: 'dept-2', institution_id: 'inst-arts' }
      ]
    });
    const L = await loadPlacementLookups(fake, [
      row('a', { resource_id: 'res-1' }),
      row('b', { raised_by_profile_id: 'walker' }, 'staff-1'),
      row('c', { accountable_routed_to_eao_no_owner: true }, 'staff-eao')
    ]);
    expect(L.resources.get('res-1')).toEqual({ institution_id: 'inst-engg', department_id: 'dept-1' });
    expect(L.staff.get('staff-1')?.institution_id).toBe('inst-arts');
    expect(L.profiles.get('walker')).toBe('inst-office');
    expect(L.departments.get('dept-2')).toBe('inst-arts');
    // the estate-office owner is never looked up
    expect(calls.find((c) => c.table === 'staff')?.ids).toEqual(['staff-1']);
    for (const c of calls) {
      expect(c.columns).not.toMatch(/name|email|phone|title|description/);
    }
  });

  it('reads in chunks so a long list never makes one huge request', async () => {
    const tasks = Array.from({ length: 450 }, (_, i) => row(`t${i}`, {}, `staff-${i}`));
    const { admin: fake, calls } = recordingAdmin({});
    await loadPlacementLookups(fake, tasks);
    const staffCalls = calls.filter((c) => c.table === 'staff');
    expect(staffCalls.map((c) => c.ids.length)).toEqual([200, 200, 50]);
  });
});

describe('loadComplaintRows', () => {
  function complaintAdmin(n: number) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      lt: () => chain,
      or: () => chain,
      order: () => chain,
      limit: async () => ({
        data: Array.from({ length: n }, () => ({ institution_id: 'inst-arts', status: 'open' })),
        error: null
      })
    };
    return { from: () => chain } as unknown as SupabaseClient;
  }

  it('says so when the read hit its limit, instead of cutting silently', async () => {
    expect((await loadComplaintRows(complaintAdmin(5000), WEEK)).truncated).toBe(true);
    expect((await loadComplaintRows(complaintAdmin(12), WEEK)).truncated).toBe(false);
  });
});

describe('the run reports jobs whose college is not known', () => {
  it('carries the not-known count into the result and the Director bell', async () => {
    const walk = {
      id: 'w1',
      title: 'walk',
      status_key: 'todo',
      is_blocked: false,
      due_date: '2026-06-20',
      completed_at: null,
      created_at: '2026-06-23T05:00:00Z',
      owner_staff_id: null,
      metadata: { source: 'campus-walk', institution_id: null }
    };
    const { deps, sendBell } = makeDeps({
      loadReportCards: async () => ({
        colleges: COLLEGES,
        board: buildReportCards({ colleges: COLLEGES, tasks: [walk], complaints: [], week: WEEK, now: NOW })
      })
    });
    const result = await runWeeklyReportCard(admin, { week: WEEK, now: NOW }, deps);
    expect(result.collegeNotKnownJobs).toBe(1);
    const director = sendBell.mock.calls.find((c) => c[1].idempotencyKey === directorBellKey('2026-06-22'));
    expect(director?.[1].body).toContain('College not known: 1 job');
  });
});
