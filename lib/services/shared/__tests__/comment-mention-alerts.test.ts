// Tests for grantAndNotifyTags — the "grant and tell, resumably" step behind
// both comment-tag routes. The database and the alert writer are in-memory
// stand-ins: the point is the resume / retry / reminder logic, and a live run
// would send real alerts to real staff.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Alert writer stand-in: fanoutNotification's idempotency, and failures ───
const alerts = {
  deliveries: [] as { key: string; userIds: string[] }[],
  seenKeys: new Set<string>(),
  failuresLeft: 0,
};

vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: vi.fn(async (_client: unknown, opts: { idempotencyKey: string; userIds: string[] }) => {
    if (alerts.failuresLeft > 0) {
      alerts.failuresLeft -= 1;
      throw new Error('inbox write failed');
    }
    // Same key again = already delivered (the real helper heals links and
    // returns skipped:'idempotent' without a second alert).
    if (alerts.seenKeys.has(opts.idempotencyKey)) {
      return { notified: 0, skipped: 'idempotent' };
    }
    alerts.seenKeys.add(opts.idempotencyKey);
    alerts.deliveries.push({ key: opts.idempotencyKey, userIds: opts.userIds });
    return { notified: opts.userIds.length };
  }),
}));

import { grantAndNotifyTags } from '../comment-mention-alerts';

// ── Mentions table stand-in ─────────────────────────────────────────────────
interface Row {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  notified_at: string | null;
}

let rows: Row[] = [];
let grantError: { code: string; message: string } | null = null;

/** A just-enough PostgREST query builder over `rows`. */
function query() {
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: 'select' } | { kind: 'update'; patch: Partial<Row> } | null = null;

  const run = () => {
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op?.kind === 'update') {
      hit.forEach((r) => Object.assign(r, op && op.kind === 'update' ? op.patch : {}));
      return { data: null, error: null };
    }
    return { data: hit.map((r) => ({ ...r })), error: null };
  };

  const b: any = {
    upsert(input: Omit<Row, 'id' | 'notified_at'>[]) {
      // Like PostgREST with ignoreDuplicates: .select() returns only the rows
      // this call inserted.
      const inserted: Row[] = [];
      const done = (v: unknown) => ({ select: () => Promise.resolve(v) });
      if (grantError) return done({ data: null, error: grantError });
      for (const i of input) {
        const exists = rows.some(
          (r) => r.comment_id === i.comment_id && r.mentioned_user_id === i.mentioned_user_id,
        );
        if (!exists) {
          const row: Row = {
            id: `tag-${rows.length + 1}`,
            comment_id: i.comment_id,
            mentioned_user_id: i.mentioned_user_id,
            notified_at: null,
          };
          rows.push(row);
          inserted.push(row);
        }
      }
      return done({ data: inserted.map((r) => ({ ...r })), error: null });
    },
    select() {
      op = { kind: 'select' };
      return b;
    },
    update(patch: Partial<Row>) {
      op = { kind: 'update', patch };
      return b;
    },
    eq(col: keyof Row, val: unknown) {
      filters.push((r) => r[col] === val);
      return b;
    },
    is(col: keyof Row, val: null) {
      filters.push((r) => r[col] === val);
      return b;
    },
    in(col: keyof Row, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
      return b;
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return b;
}

const client = { from: () => query() };

const buildAlert = vi.fn(async () => ({
  title: 'A tagged you',
  body: 'please sign',
  url: '/x',
  source: 'test_mention',
  metadata: {},
}));

const tag = (userIds: string[]) =>
  grantAndNotifyTags({
    db: client,
    service: client,
    table: 'resource_reservation_comment_mentions',
    parentColumn: 'reservation_id',
    parentId: 'booking-1',
    commentId: 'comment-1',
    userIds,
    callerId: 'author',
    keyPrefix: 'test-mention',
    buildAlert,
  });

beforeEach(() => {
  rows = [];
  grantError = null;
  alerts.deliveries = [];
  alerts.seenKeys = new Set();
  alerts.failuresLeft = 0;
  buildAlert.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('grantAndNotifyTags', () => {
  // BUG-006178: `created` is what the adoption loop counts as "tagged somebody".
  it('reports a tag as created only on the call that made it', async () => {
    const first = await tag(['u1']);
    expect(first.created).toEqual(['u1']);

    // Same person again (inside the reminder cooldown): nothing is created.
    const repeat = await tag(['u1']);
    expect(repeat.tagged).toEqual(['u1']);
    expect(repeat.created).toEqual([]);

    // A mixed request creates only the new one.
    const mixed = await tag(['u1', 'u2']);
    expect(mixed.created).toEqual(['u2']);
  });

  it('reports a tag as created even when its alert fails, and not again on the resend', async () => {
    alerts.failuresLeft = 1;
    const failed = await tag(['u1']);
    expect(failed.notNotified).toEqual(['u1']);
    expect(failed.created).toEqual(['u1']);

    const resend = await tag(['u1']);
    expect(resend.notified).toEqual(['u1']);
    expect(resend.created).toEqual([]);
  });

  it('creates nothing when the grant is refused', async () => {
    grantError = { code: '42501', message: 'refused' };
    const r = await tag(['u1']);
    expect(r.grantError?.code).toBe('42501');
    expect(r.created).toEqual([]);
  });

  it('grants and tells a newly tagged person once, and records it', async () => {
    const r = await tag(['u1']);

    expect(r.tagged).toEqual(['u1']);
    expect(r.notified).toEqual(['u1']);
    expect(r.notNotified).toEqual([]);
    expect(alerts.deliveries).toEqual([{ key: 'test-mention:tag-1:first', userIds: ['u1'] }]);
    expect(rows[0].notified_at).not.toBeNull();
  });

  it('keeps access but reports "not notified" when the alert fails', async () => {
    alerts.failuresLeft = 1;
    const r = await tag(['u1']);

    expect(r.tagged).toEqual(['u1']); // access granted
    expect(r.notNotified).toEqual(['u1']);
    expect(r.notified).toEqual([]);
    expect(rows[0].notified_at).toBeNull(); // still pending
    expect(alerts.deliveries).toHaveLength(0);
  });

  it('Resend finishes a failed alert, with the same key as the failed attempt', async () => {
    alerts.failuresLeft = 1;
    await tag(['u1']);

    const r = await tag(['u1']); // the author's Resend

    expect(r.notified).toEqual(['u1']);
    expect(r.notNotified).toEqual([]);
    expect(alerts.deliveries).toEqual([{ key: 'test-mention:tag-1:first', userIds: ['u1'] }]);
    expect(rows[0].notified_at).not.toBeNull();
  });

  it('does not resend when re-tagged moments after the alert (double-click)', async () => {
    await tag(['u1']);
    vi.advanceTimersByTime(5_000);

    const r = await tag(['u1']);

    expect(r.recentlyNotified).toEqual(['u1']);
    expect(r.reminded).toEqual([]);
    expect(alerts.deliveries).toHaveLength(1);
    expect(buildAlert).toHaveBeenCalledTimes(1); // nothing to build the second time
  });

  it('sends a reminder when re-tagged after the cooldown, and moves the key on', async () => {
    await tag(['u1']);
    const firstNotifiedAt = rows[0].notified_at!;
    vi.advanceTimersByTime(5 * 60_000);

    const r = await tag(['u1']);

    expect(r.reminded).toEqual(['u1']);
    expect(alerts.deliveries).toHaveLength(2);
    expect(alerts.deliveries[1].key).toBe(`test-mention:tag-1:${Date.parse(firstNotifiedAt)}`);
    expect(rows[0].notified_at).not.toBe(firstNotifiedAt);

    // …and the next reminder uses a new key again, so it is not swallowed.
    vi.advanceTimersByTime(5 * 60_000);
    await tag(['u1']);
    expect(alerts.deliveries).toHaveLength(3);
  });

  it('delivers once when two requests race on a pending tag', async () => {
    alerts.failuresLeft = 1;
    await tag(['u1']); // leaves the tag pending

    await Promise.all([tag(['u1']), tag(['u1'])]);

    expect(alerts.deliveries).toHaveLength(1);
    expect(rows[0].notified_at).not.toBeNull();
  });

  it('handles several people independently — one failure does not block the rest', async () => {
    alerts.failuresLeft = 1; // the first alert attempted fails
    const r = await tag(['u1', 'u2']);

    expect(r.tagged.sort()).toEqual(['u1', 'u2']);
    expect(r.notified).toHaveLength(1);
    expect(r.notNotified).toHaveLength(1);

    const retry = await tag(r.notNotified);
    expect(retry.notified).toEqual(r.notNotified);
    expect(rows.every((row) => row.notified_at !== null)).toBe(true);
  });

  it('sends nothing when the grant itself is refused', async () => {
    grantError = { code: '42501', message: 'Only team members of this booking’s institution can be tagged.' };

    const r = await tag(['u1']);

    expect(r.grantError?.code).toBe('42501');
    expect(r.tagged).toEqual([]);
    expect(alerts.deliveries).toHaveLength(0);
    expect(buildAlert).not.toHaveBeenCalled();
  });

  it('marks everyone "not notified" when the alert cannot even be built', async () => {
    buildAlert.mockRejectedValueOnce(new Error('profile lookup failed'));

    const r = await tag(['u1']);

    expect(r.tagged).toEqual(['u1']);
    expect(r.notNotified).toEqual(['u1']);
    expect(rows[0].notified_at).toBeNull();
  });
});
