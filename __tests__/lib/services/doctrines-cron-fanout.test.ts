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
 *
 * WHERE THE SECOND WRITE LIVES NOW (2026-09-05)
 * #3199 fixed the hole in JavaScript, inside a per-user loop, via
 * `fanoutNotification`. #3123 removed that loop: the same routes were making
 * two sequential round-trips per user (13,410 for friday-reflection's 6,705
 * users), the dispatcher aborts at 120s, and both crons were being cut off
 * mid-loop — serving 28% of users and falling. Both fixes are real and both are
 * kept: the loop is gone, and the second write came DOWN with the first into
 * `fn_doctrines_emit_cards`, which inserts the parent rows and their
 * `user_notifications` links in one statement and heals links for cards that
 * already existed.
 *
 * So this file now guards the same outcome at the two layers that can break it:
 *   1. the route must hand every card a recipient and REPORT links written
 *      (`cards_delivered`), because an uncounted second write is how the
 *      original bug stayed invisible for four months;
 *   2. the migration must actually perform that second write and keep
 *      returning `linked` — asserted here as well as by ASSERT 4/5 inside the
 *      migration itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const RECIPIENT = '11111111-1111-4111-8111-111111111111';

type Write = { table: string; op: 'insert' | 'upsert'; payload: unknown };
type Rpc = { fn: string; args: unknown };

const writes: Write[] = [];
const rpcs: Rpc[] = [];

/**
 * Minimal supabase-js stub covering exactly the chains this cron uses:
 *   profiles → .select().in()                       (awaited)
 *   rpc('fn_doctrines_emit_cards', { p_cards })      (the emit, both writes)
 * Any insert/upsert is still recorded, so a route that goes back to writing
 * `notifications` by hand is caught rather than silently passing.
 */
function makeClient(sink: Write[], profiles: Array<{ id: string; role: string }>) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        in: () => Promise.resolve({ data: profiles, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: (payload: unknown) => {
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
    // Mirrors what the migration returns, including `linked` — the count that
    // makes delivery observable instead of assumed.
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return Promise.resolve({
        data: { received: 1, inserted: 1, skipped_duplicate: 0, linked: 1 },
        error: null,
      });
    },
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
    rpcs.length = 0;
    process.env.CRON_SECRET = 'test-secret';
  });

  it('emits every card through the bulk emitter and reports links written', async () => {
    const { GET } = await import('@/app/api/cron/friday-reflection/route');
    const res = await GET(cronRequest('test-secret') as never);
    const body = (await res.json()) as {
      cards_created: number;
      cards_delivered: number;
      errors: string[];
    };

    expect(body.errors).toEqual([]);
    expect(body.cards_created).toBe(1);

    // The write that was MISSING, and is the whole point of this file. It now
    // happens inside the emitter, so what the route must prove is that it is
    // COUNTED: cards_created without cards_delivered is exactly the shape the
    // route reported for four months while delivering nothing.
    expect(
      body.cards_delivered,
      'no user_notifications links reported — the card reaches nobody'
    ).toBe(1);

    // No hand-rolled parent insert may have happened on the side.
    expect(writes.find((w) => w.table === 'notifications')).toBeUndefined();

    const emit = rpcs.find((r) => r.fn === 'fn_doctrines_emit_cards');
    expect(emit, 'the route did not call the bulk emitter').toBeDefined();

    const cards = (emit!.args as { p_cards: Array<Record<string, unknown>> }).p_cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      created_by: RECIPIENT,
      // Load-bearing: the emitter reads targeting.user_ids to build the link
      // rows. A card without it is inserted and then delivered to nobody.
      targeting: { user_ids: [RECIPIENT] },
      category: 'doctrines:friday-reflection',
      kind: 'work_item',
    });
    // Every card must carry the key the emitter dedupes AND links on; it
    // refuses a keyless batch outright.
    expect(cards[0].idempotency_key).toBeTruthy();
    // expires_at rides through — dropping it would let these pile up unread
    // forever, which is what the 2026-07-26 TTL fix was for.
    expect(cards[0].expires_at).toBeTruthy();
  });
});

describe('doctrines crons do not hand-roll the notifications insert', () => {
  // A source-level guard, because the failure mode is a *missing* second write:
  // any future edit that goes back to a bare `.from('notifications').insert(`
  // reintroduces a silent, undetectable delivery hole. sunday-wrap is covered
  // here rather than end-to-end because driving it needs four score RPCs and
  // the web-push stack; the shape is what regressed, and the shape is checked.
  const ROUTES = ['app/api/cron/friday-reflection/route.ts', 'app/api/cron/sunday-wrap/route.ts'];

  it.each(ROUTES)('%s delivers through an approved fan-out path', (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), 'utf8');
    // Either canonical path is acceptable — both do BOTH writes. What is not
    // acceptable is composing a parent row directly.
    expect(
      /fanoutNotification\(|fn_doctrines_emit_cards/.test(src),
      'route composes notifications without an approved fan-out path'
    ).toBe(true);
    expect(src).not.toMatch(/from\(['"]notifications['"]\)\s*\n?\s*\.insert\(/);
  });

  it.each(ROUTES)('%s reports how many links were written', (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), 'utf8');
    // The 2026-08-25 bug was silent because nothing counted the second write.
    expect(src).toMatch(/_delivered/);
  });
});

describe('the bulk emitter itself performs the second write', () => {
  // The fan-out moved out of TypeScript and into SQL, so the guard follows it.
  // Mirrors ASSERT 4/5 inside the migration: belt (CI) and braces (apply time).
  const MIGRATION = 'supabase/migrations/20260908120000_doctrines_bulk_emit_cards.sql';
  const sql = () => readFileSync(path.join(process.cwd(), MIGRATION), 'utf8');

  it('inserts user_notifications link rows', () => {
    expect(
      sql(),
      'the emitter stopped writing user_notifications — every card would reach nobody'
    ).toMatch(/INSERT INTO public\.user_notifications/);
  });

  it('keeps the partial-index predicate that makes the dedupe possible', () => {
    // Without it the statement raises 42P10 on every call.
    expect(sql()).toMatch(/ON CONFLICT \(idempotency_key\) WHERE idempotency_key IS NOT NULL/);
  });

  it('returns a linked count so delivery is measured, not assumed', () => {
    expect(sql()).toMatch(/'linked',\s+v_linked/);
  });

  it('stays service_role only — it notifies arbitrary user ids', () => {
    expect(sql()).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_doctrines_emit_cards\(jsonb\) FROM anon, PUBLIC, authenticated;/);
    expect(sql()).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.fn_doctrines_emit_cards\(jsonb\) TO service_role;/);
  });
});
