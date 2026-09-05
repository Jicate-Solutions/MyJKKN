/**
 * Doctrines weekly crons must FAN OUT, not just compose.
 *
 * WHY THIS TEST EXISTS
 * Delivering an in-app notification takes two writes: a `notifications` row
 * and one `user_notifications` link row per recipient. The bell and inbox read
 * `user_notifications` with an `!inner` join back to `notifications`
 * (lib/services/notification/notification-service.ts), and no DB trigger fans
 * out — so a parent row with no link row is invisible to the person it names,
 * permanently and silently.
 *
 * Measured on production 2026-08-25: `cron:friday-reflection` (91,069 rows) and
 * `cron:sunday-wrap` (42,696 rows) had written the parent row alone since
 * 2026-04-24 — 133,765 cards naming 7,170 real people, 0 of them ever linked,
 * 0% delivered in every single month. Nothing failed loudly; the routes kept
 * returning `cards_created: N` the whole time.
 *
 * That regression is invisible to a route-level smoke test that only asserts a
 * 200 and a non-zero count, so this file asserts the second write directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const RECIPIENT = '11111111-1111-4111-8111-111111111111';
const NOTIFICATION_ID = '22222222-2222-4222-8222-222222222222';

type Write = { table: string; op: 'insert' | 'upsert'; payload: unknown };

const writes: Write[] = [];

/**
 * Minimal supabase-js stub covering exactly the chains this cron uses:
 *   profiles           → .select().in()                  (awaited)
 *   notifications      → .select().eq().maybeSingle()     (idempotency pre-check)
 *   notifications      → .insert().select().maybeSingle() (fanoutNotification)
 *   user_notifications → .upsert()                        (fanoutNotification)
 * Every insert/upsert is recorded so the test can assert BOTH writes happened.
 */
function makeClient(sink: Write[], profiles: Array<{ id: string; role: string }>) {
  return {
    from(table: string) {
      let didInsert = false;
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        in: () => Promise.resolve({ data: profiles, error: null }),
        maybeSingle: () =>
          Promise.resolve({
            // Pre-check finds nothing (no card yet this week); the post-insert
            // read returns the id fanoutNotification needs for the link rows.
            data: didInsert ? { id: NOTIFICATION_ID } : null,
            error: null,
          }),
        insert: (payload: unknown) => {
          didInsert = true;
          sink.push({ table, op: 'insert', payload });
          return builder;
        },
        upsert: (payload: unknown) => {
          sink.push({ table, op: 'upsert', payload });
          return Promise.resolve({ error: null });
        },
      });
      return builder;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => makeClient(writes, [{ id: RECIPIENT, role: 'student' }]),
}));

function cronRequest(secret: string) {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
    },
    nextUrl: { searchParams: { get: () => null } },
  };
}

describe('cron/friday-reflection fans out to user_notifications', () => {
  beforeEach(() => {
    writes.length = 0;
    process.env.CRON_SECRET = 'test-secret';
  });

  it('writes BOTH the notifications row and its user_notifications link', async () => {
    const { GET } = await import('@/app/api/cron/friday-reflection/route');
    const res = await GET(cronRequest('test-secret') as never);
    const body = (await res.json()) as { cards_created: number; errors: string[] };

    expect(body.errors).toEqual([]);
    expect(body.cards_created).toBe(1);

    const parent = writes.find((w) => w.table === 'notifications');
    const link = writes.find((w) => w.table === 'user_notifications');

    // The write that was already there.
    expect(parent).toBeDefined();
    expect(parent!.payload).toMatchObject({
      created_by: RECIPIENT,
      targeting: { user_ids: [RECIPIENT] },
      category: 'doctrines:friday-reflection',
      kind: 'work_item',
    });
    // expires_at rides through extraColumns — dropping it would let these pile
    // up unread forever, which is what the 2026-07-26 TTL fix was for.
    expect((parent!.payload as Record<string, unknown>).expires_at).toBeTruthy();

    // The write that was MISSING, and is the whole point of this test.
    expect(link, 'no user_notifications link row — the card reaches nobody').toBeDefined();
    expect(link!.payload).toEqual([{ notification_id: NOTIFICATION_ID, user_id: RECIPIENT }]);
  });
});

describe('doctrines crons do not hand-roll the notifications insert', () => {
  // A source-level guard, because the failure mode is a *missing* second write:
  // any future edit that goes back to a bare `.from('notifications').insert(`
  // reintroduces a silent, undetectable delivery hole. sunday-wrap is covered
  // here rather than end-to-end because driving it needs four score RPCs and
  // the web-push stack; the shape is what regressed, and the shape is checked.
  const ROUTES = ['app/api/cron/friday-reflection/route.ts', 'app/api/cron/sunday-wrap/route.ts'];

  it.each(ROUTES)('%s routes through fanoutNotification', (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).toContain('fanoutNotification');
    expect(src).not.toMatch(/from\(['"]notifications['"]\)\s*\n?\s*\.insert\(/);
  });
});
