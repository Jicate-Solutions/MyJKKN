/**
 * Second review of #4262, finding 2: a rung whose send went through but told
 * nobody must not stay "unsent" for ever, a failed ledger write must be
 * reported, and a send that keeps failing is retried for a bounded time.
 * Runs db-deps against a recording stand-in for the Supabase client.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

import { createHarnessDbDeps, UNSENT_RETRY_DAYS } from '@/lib/services/hr/duty-harness/db-deps';

type Call = { table: string; op: string; args: unknown[] };

function recordingDb(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const builder: any = {};
      for (const op of ['select', 'update', 'insert', 'eq', 'is', 'in', 'gte', 'lt', 'order', 'limit']) {
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: result.data ?? null, error: result.error ?? null });
      return builder;
    }
  };
  return { db: db as any, calls };
}

describe('hr duty ledger — finishing a rung', () => {
  it('a notification id is stored on the row', async () => {
    const { db, calls } = recordingDb();
    await createHarnessDbDeps(db).finishLedger('row-1', 'notif-1');
    expect(calls.find((c) => c.op === 'update')?.args[0]).toEqual({ notification_id: 'notif-1' });
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'row-1']);
  });

  it('no notification id = nobody was told: the row names nobody, so it leaves the unsent set', async () => {
    const { db, calls } = recordingDb();
    await createHarnessDbDeps(db).finishLedger('row-1', null);
    expect(calls.find((c) => c.op === 'update')?.args[0]).toEqual({ notified_profile_ids: [] });
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'row-1']);
  });

  it('a failed ledger write is reported, not swallowed', async () => {
    const { db } = recordingDb({ error: { message: 'connection reset' } });
    await expect(createHarnessDbDeps(db).finishLedger('row-1', 'notif-1')).rejects.toThrow('connection reset');
  });
});

describe('hr duty ledger — unsent rungs', () => {
  it(`retries a failing send for ${UNSENT_RETRY_DAYS} days, not for ever`, async () => {
    const { db, calls } = recordingDb({ data: [] });
    const before = Date.now();
    await createHarnessDbDeps(db).loadUnsentRungs([
      {
        dutyCode: 'S3',
        itemId: 'item-1',
        stageKey: '',
        label: 'x',
        institutionId: null,
        waitingSince: '2026-10-01T00:00:00Z',
        pinnedOwnerIds: [],
        ownerRoleKeys: [],
        subjectProfileId: null,
        href: '/hr'
      } as any
    ]);
    const gte = calls.find((c) => c.op === 'gte');
    expect(gte?.args[0]).toBe('created_at');
    const cutoff = Date.parse(gte?.args[1] as string);
    const expected = before - UNSENT_RETRY_DAYS * 86_400_000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000);
  });
});

describe('hr duty owners — named owners are looked up in one query per run (#4262, third review)', () => {
  const pinned = (itemId: string, ids: string[]) =>
    ({
      dutyCode: 'S1',
      itemId,
      stageKey: '0',
      label: 'x',
      institutionId: null,
      waitingSince: '2026-10-01T00:00:00Z',
      pinnedOwnerIds: ids,
      ownerRoleKeys: [],
      subjectProfileId: null,
      href: '/hr'
    }) as any;
  const def = { code: 'S1', ownerPermissionKey: null } as any;

  it('prefetchOwners answers every item from one profiles query; inactive or missing people are dropped', async () => {
    const { db, calls } = recordingDb({
      data: [
        { id: 'p1', institution_id: null, is_active: true },
        { id: 'p2', institution_id: null, is_active: false }
      ]
    });
    const deps = createHarnessDbDeps(db);
    const items = [pinned('a', ['p2', 'p1']), pinned('b', ['p3']), pinned('c', ['p1', 'p1'])];
    await deps.prefetchOwners!(items);
    expect(await deps.resolveOwners(def, items[0])).toEqual(['p1']);
    expect(await deps.resolveOwners(def, items[1])).toEqual([]);
    expect(await deps.resolveOwners(def, items[2])).toEqual(['p1']);
    const profileQueries = calls.filter((c) => c.table === 'profiles' && c.op === 'select');
    expect(profileQueries).toHaveLength(1);
    expect(calls.find((c) => c.table === 'profiles' && c.op === 'in')?.args).toEqual([
      'id',
      ['p2', 'p1', 'p3']
    ]);
  });

  it('a person not prefetched is still looked up', async () => {
    const { db, calls } = recordingDb({ data: [{ id: 'p9', institution_id: null, is_active: true }] });
    const deps = createHarnessDbDeps(db);
    expect(await deps.resolveOwners(def, pinned('z', ['p9']))).toEqual(['p9']);
    expect(calls.filter((c) => c.table === 'profiles' && c.op === 'select')).toHaveLength(1);
  });
});
