// ============================================================================
// BUG-003978 — "A resource with this code already exists" for a code the user
// has never seen.
//
// THE SHAPE OF THE BUG
// --------------------
// generateResourceCode compresses the institution name to its first FOUR alpha
// characters. All eleven JKKN-family institutions compress to "JKKN", so they
// share one `RES-<CAT>-JKKN-` prefix and therefore one suffix space.
//
// Both halves of the old allocation path were ordinary PostgREST selects:
//
//   • the collision probe   .eq('resource_code', code).maybeSingle()
//   • the MAX-suffix scan   .like('resource_code', `${prefix}%`)
//
// Row-level security narrows both to the caller's OWN institution. A code held
// by a SIBLING institution is therefore invisible: the probe says "free", the
// MAX comes back stale, the INSERT hits the real (unfiltered) UNIQUE index and
// raises 23505, and the retry loop re-runs the same two narrowed reads and
// recomputes the same stale value. Five identical attempts later the user is
// told the code is taken — by a row they are not allowed to see.
//
// WHY THIS TEST IS NOT SELF-AGREEMENT
// -----------------------------------
// The RLS asymmetry is deliberately NOT being changed (owner's ruling). So the
// fix has to read the prefix family from somewhere RLS does not reach: a
// SECURITY DEFINER allocator function. This suite pins BOTH ends of that:
//
//   1. The migration file is PARSED, not assumed. Delete it, or ship one that
//      forgets SECURITY DEFINER / the advisory lock / the authenticated grant,
//      and these tests go red.
//   2. The service is driven against a fake Supabase client whose RLS-narrowed
//      table reads DISAGREE with the allocator. The narrowed read says 0009 is
//      free; the allocator says the next free code is 0010. The service must
//      believe the allocator.
// ============================================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Anchor 1: what this PR's migration declares ─────────────────────────────
const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260911120200_resource_code_allocator.sql',
);

const migrationSql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : '';

// The RPC name the service is expected to call.
const ALLOCATOR_FN = 'fn_allocate_resource_code';

// ── Anchor 2: a recording stand-in for the Supabase client ──────────────────
type Recorded = {
  table: string;
  op: 'select' | 'insert' | 'update';
  filters: [string, unknown][];
};

type RpcCall = { fn: string; args: Record<string, unknown> };

let recorded: Recorded[] = [];
let rpcCalls: RpcCall[] = [];

/**
 * Rows the CALLER IS ALLOWED TO SEE. Deliberately does not contain
 * RES-SPA-JKKN-0009 — that row belongs to a sibling institution and RLS hides
 * it. This is the whole point of the bug.
 */
let visibleRowsByTable: Record<string, unknown[]> = {};

/** What the SECURITY DEFINER allocator answers (or fails with). */
let rpcResponse: { data: unknown; error: unknown } = { data: null, error: null };

// `var` + function declarations, both hoisted: lib/storage/storage-service.ts
// calls createClientSupabaseClient in a STATIC initialiser, i.e. while
// resource-service.ts is still being imported — earlier than any `const` in
// this file has left its temporal dead zone.
// eslint-disable-next-line no-var
var cachedClient: unknown;

function builderFor(rec: Recorded) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const rows = () => visibleRowsByTable[rec.table] ?? [];

  Object.assign(b, {
    select: chain,
    eq: (col: string, val: unknown) => {
      rec.filters.push([col, val]);
      return b;
    },
    like: (col: string, val: unknown) => {
      rec.filters.push([col, val]);
      return b;
    },
    is: chain,
    in: chain,
    order: chain,
    limit: chain,
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null, count: rows().length }).then(ok, no),
  });
  return b as never;
}

function getFakeClient() {
  if (!cachedClient) {
    cachedClient = {
      from(table: string) {
        return {
          select: () => {
            const rec: Recorded = { table, op: 'select', filters: [] };
            recorded.push(rec);
            return builderFor(rec);
          },
          insert: () => {
            const rec: Recorded = { table, op: 'insert', filters: [] };
            recorded.push(rec);
            return builderFor(rec);
          },
          update: () => {
            const rec: Recorded = { table, op: 'update', filters: [] };
            recorded.push(rec);
            return builderFor(rec);
          },
        };
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        return rpcResponse;
      },
    };
  }
  return cachedClient;
}

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => getFakeClient(),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), log: vi.fn(), info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
}));

import { ResourceService } from '@/lib/services/resource-management/resource-service';

const CATEGORY_ID = 'resource-parent-categories-uuid-0001';
const INSTITUTION_ID = 'institutions-uuid-0001';
const PREFIX = 'RES-SPA-JKKN-';
const STALE_CANDIDATE = 'RES-SPA-JKKN-0009';

beforeEach(() => {
  recorded = [];
  rpcCalls = [];
  warn.mockClear();
  // The caller's own institution has NO sports resources at all. Every
  // RES-SPA-JKKN-* row in the table belongs to a sibling institution, so the
  // narrowed probe and the narrowed LIKE scan both come back empty.
  visibleRowsByTable = {
    resources: [],
    // "Spares & Consumables" → SPA, "JKKN College of Pharmacy" → JKKN.
    // Ten sibling institutions compress to that same JKKN.
    resource_parent_categories: [{ name: 'Spares & Consumables' }],
    institutions: [{ name: 'JKKN College of Pharmacy' }],
  };
  rpcResponse = { data: null, error: null };
});

// ── The migration ───────────────────────────────────────────────────────────
describe('the SECURITY DEFINER allocator this fix depends on', () => {
  it('ships a migration file at the expected path', () => {
    expect(
      migrationSql.length,
      `No migration at ${MIGRATION_PATH}. Without it the allocator RPC does not exist ` +
        `in the database and every caller silently falls back to the RLS-narrowed scan ` +
        `that causes BUG-003978.`,
    ).toBeGreaterThan(0);
  });

  it('declares the allocator as SECURITY DEFINER with a pinned search_path', () => {
    expect(migrationSql).toContain(`public.${ALLOCATOR_FN}`);
    expect(
      /SECURITY\s+DEFINER/i.test(migrationSql),
      'The allocator must run as its owner — that is the ONLY way it can see the ' +
        'sibling-institution rows RLS hides from the caller.',
    ).toBe(true);
    expect(
      /SET\s+search_path\s*=\s*public/i.test(migrationSql),
      'A SECURITY DEFINER function without a pinned search_path is a privilege-escalation hole.',
    ).toBe(true);
  });

  it('serialises concurrent allocations with an advisory lock on the prefix', () => {
    expect(
      /pg_advisory_xact_lock/i.test(migrationSql),
      'Two callers scanning the same prefix family at the same instant must not ' +
        'interleave. A transaction-scoped advisory lock keyed on the prefix serialises them.',
    ).toBe(true);
  });

  it('is reachable by signed-in users and nobody else, and writes nothing', () => {
    expect(/GRANT\s+EXECUTE[\s\S]{0,200}?TO\s+authenticated/i.test(migrationSql)).toBe(true);
    expect(/REVOKE\s+(ALL|EXECUTE)[\s\S]{0,200}?FROM[\s\S]{0,60}?anon/i.test(migrationSql)).toBe(
      true,
    );
    // The allocator computes a string. It must never create a row.
    expect(
      /INSERT\s+INTO\s+public\.resources/i.test(migrationSql),
      'The allocator must not insert a resource — it only computes and returns a code.',
    ).toBe(false);
  });
});

// ── The service ─────────────────────────────────────────────────────────────
describe('ResourceService.resolveAvailableResourceCode', () => {
  it('returns 0010 when the allocator reports 0009 is taken by an invisible row', async () => {
    // The database (unfiltered) already holds RES-SPA-JKKN-0009 under a sibling
    // institution. The SECURITY DEFINER allocator can see it; the caller cannot.
    rpcResponse = { data: 'RES-SPA-JKKN-0010', error: null };

    const code = await ResourceService.resolveAvailableResourceCode(
      STALE_CANDIDATE,
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    expect(
      code,
      `The RLS-narrowed probe sees no row for ${STALE_CANDIDATE} and would happily hand it ` +
        `back — straight into a 23505 and the "already exists" toast. The allocator is the ` +
        `only reader that can see the truth, so its answer must win.`,
    ).toBe('RES-SPA-JKKN-0010');

    const call = rpcCalls.find((c) => c.fn === ALLOCATOR_FN);
    expect(call, `Expected the service to call ${ALLOCATOR_FN}; saw ${JSON.stringify(rpcCalls)}`)
      .toBeDefined();
    expect(call!.args.p_prefix).toBe(PREFIX);
  });

  it('does not hand back the caller-visible answer when the allocator disagrees', async () => {
    rpcResponse = { data: 'RES-SPA-JKKN-0010', error: null };

    const code = await ResourceService.resolveAvailableResourceCode(
      STALE_CANDIDATE,
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    expect(code).not.toBe(STALE_CANDIDATE);
  });

  it('keeps a candidate the allocator confirms is genuinely free', async () => {
    // A deliberately-typed custom code must survive untouched when the FULL
    // scan agrees it is free — the allocator echoes it back.
    rpcResponse = { data: 'RES-SPA-JKKN-0042', error: null };

    const code = await ResourceService.resolveAvailableResourceCode(
      'RES-SPA-JKKN-0042',
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    expect(code).toBe('RES-SPA-JKKN-0042');
  });

  it('falls back to the old client-side path when the allocator call fails', async () => {
    // Migration not applied yet / function revoked / transient network error.
    rpcResponse = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.fn_allocate_resource_code' },
    };

    const code = await ResourceService.resolveAvailableResourceCode(
      STALE_CANDIDATE,
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    // Degraded, not broken: the narrowed probe finds nothing, so the candidate
    // stands. Creation is never blocked outright by a missing allocator.
    expect(
      code,
      'A failing allocator must degrade to the previous behaviour, not throw — a ' +
        'degraded allocation beats a hard failure at resource creation.',
    ).toBe(STALE_CANDIDATE);

    expect(
      warn.mock.calls.length,
      'The fallback must be logged with `logger`, otherwise a silently-unapplied ' +
        'migration looks exactly like a working one.',
    ).toBeGreaterThan(0);
  });

  it('does not throw when the allocator returns something unusable', async () => {
    rpcResponse = { data: '', error: null };

    await expect(
      ResourceService.resolveAvailableResourceCode(STALE_CANDIDATE, CATEGORY_ID, INSTITUTION_ID),
    ).resolves.toBe(STALE_CANDIDATE);
  });
});

// ── The form's preview seed ─────────────────────────────────────────────────
describe('ResourceService.getResourceCountForIdGeneration', () => {
  it('seeds the preview from the allocator so the generated code matches reality', async () => {
    // generateResourceCode does existingCount + 1, so a next free code of 0010
    // must be reported as a seed of 9.
    rpcResponse = { data: 'RES-SPA-JKKN-0010', error: null };

    const seed = await ResourceService.getResourceCountForIdGeneration(
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    expect(
      seed,
      'The form previews the code minutes before submit. Seeding it from the ' +
        'RLS-narrowed MAX is what makes the preview stale in the first place.',
    ).toBe(9);
  });

  it('falls back to the narrowed MAX scan when the allocator is unavailable', async () => {
    rpcResponse = { data: null, error: { message: 'boom' } };
    visibleRowsByTable.resources = [{ resource_code: 'RES-SPA-JKKN-0003' }];

    const seed = await ResourceService.getResourceCountForIdGeneration(
      CATEGORY_ID,
      INSTITUTION_ID,
    );

    expect(seed).toBe(3);
  });
});
