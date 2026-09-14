// ============================================================================
// The three leave-type rules, and the pass a warden issues directly.
//
// REPLACES gate-pass-create-payload.test.tsx. That suite rendered
// /campus-living/gate-passes/new in jsdom to inspect the payload it posted.
// It was catching one real class of bug — the page naming columns the table
// does not have — and two things have since made the render unnecessary and
// unreliable:
//
//   • the page now posts a typed CreateHostelGatePassDTO instead of `as never`,
//     so a phantom key is a compile error before it is ever a test failure;
//   • its resident and type pickers are Radix Selects, which do not respond to
//     fireEvent.change, and it imports usePermissions, which constructs a
//     Supabase browser client at module load and throws without env vars.
//
// So the payload assertions moved down to the service — the only place that
// actually calls .insert() and therefore the only place PGRST204 can come
// from — and this file keeps them there, alongside the form rules that are
// pure functions and were never testable through a render at all.
//
// THE ANCHOR IS THE LIVE SCHEMA, not the code under test: the column list
// below was read from information_schema on 2026-09-12, and the migration
// that adds to it is parsed from disk.
// ============================================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// public.hostel_gate_passes as it stood immediately before the rebuild.
const LIVE_COLUMNS = [
  'id',
  'institution_id',
  'learner_id',
  'leave_request_id',
  'pass_type',
  'pass_number',
  'out_time',
  'expected_return',
  'actual_return',
  'destination',
  'approved_by',
  'gate_security_out',
  'gate_security_in',
  'status',
  'qr_code',
  'parent_notified',
  'created_at',
  'updated_at',
  'reason',
  'rejected_by',
  'rejection_reason',
  'cancelled_by',
  'cancellation_reason',
];

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260912120000_gate_pass_rebuild.sql',
);
const migrationSql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : '';
const ADDED_COLUMNS = [...migrationSql.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/g)].map(
  (m) => m[1],
);
const WRITABLE_COLUMNS = new Set([...LIVE_COLUMNS, ...ADDED_COLUMNS]);

// ── Recording stand-in for the Supabase client ──────────────────────────────
type Recorded = { table: string; op: string; payload: Record<string, unknown> };
let recorded: Recorded[] = [];
let rowByTable: Record<string, unknown> = {};

function builderFor(rec: Recorded) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const result = () => ({ data: rowByTable[rec.table] ?? null, error: null });
  Object.assign(b, {
    select: chain,
    eq: chain,
    in: chain,
    is: chain,
    lt: chain,
    gte: chain,
    lte: chain,
    limit: chain,
    order: chain,
    range: chain,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok, no),
  });
  return b as never;
}

const fakeClient = {
  from(table: string) {
    return {
      select: () => builderFor({ table, op: 'select', payload: {} }),
      insert: (payload: Record<string, unknown>) => {
        const rec = { table, op: 'insert', payload };
        recorded.push(rec);
        return builderFor(rec);
      },
      update: (payload: Record<string, unknown>) => {
        const rec = { table, op: 'update', payload };
        recorded.push(rec);
        return builderFor(rec);
      },
    };
  },
};

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => fakeClient,
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  GatePassService,
  describeRequestViolation,
} from '@/lib/services/campus-living/gate-pass-service';

const NOW = new Date('2026-09-12T10:00:00.000Z');
const iso = (hoursFromNow: number) =>
  new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString();

const NO_LIMITS = {
  advance_notice_hours: null,
  default_max_duration_days: null,
  requires_attachment: false,
};

// ═══════════════════════════════════════════════════════════════════
// The three rules the settings screen configures
// ═══════════════════════════════════════════════════════════════════

describe('describeRequestViolation — a null flag means NO limit', () => {
  it('a type with no flags set imposes nothing', () => {
    expect(
      describeRequestViolation(
        NO_LIMITS,
        { plannedOutAt: iso(1), expectedReturn: iso(5) },
        NOW,
      ),
    ).toBeNull();
  });

  it('null advance_notice_hours does not mean zero notice allowed only', () => {
    // This is the trap. `?? 0` would read a deliberately-unset cap as "no
    // notice permitted at all" and forbid nothing; treating null as a FLOOR
    // instead would forbid everything. Null must simply not apply.
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, advance_notice_hours: null },
        { plannedOutAt: iso(0.01), expectedReturn: iso(3) },
        NOW,
      ),
    ).toBeNull();
  });

  it('null default_max_duration_days allows a long stay', () => {
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, default_max_duration_days: null },
        { plannedOutAt: iso(1), expectedReturn: iso(24 * 200) },
        NOW,
      ),
    ).toBeNull();
  });

  it('advance_notice_hours of 0 is a real configured value, not an absent one', () => {
    // `emergency` is configured with 0 hours on every institution. It must
    // behave as "leave right now is fine", not as an unset cap.
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, advance_notice_hours: 0 },
        { plannedOutAt: iso(0.1), expectedReturn: iso(3) },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('describeRequestViolation — what it refuses, and in what words', () => {
  it('refuses a departure inside the notice window, naming the earliest time', () => {
    const msg = describeRequestViolation(
      { ...NO_LIMITS, advance_notice_hours: 24 },
      { plannedOutAt: iso(2), expectedReturn: iso(6) },
      NOW,
    );
    expect(msg).toMatch(/24 hours notice/i);
    // The learner has to be told WHEN they could go, not just that they cannot.
    expect(msg).toMatch(/earliest/i);
  });

  it('refuses a stay longer than the type allows, naming the cap', () => {
    const msg = describeRequestViolation(
      { ...NO_LIMITS, default_max_duration_days: 2 },
      { plannedOutAt: iso(1), expectedReturn: iso(1 + 24 * 3) },
      NOW,
    );
    expect(msg).toMatch(/at most 2 days/i);
  });

  it('accepts a stay exactly at the cap', () => {
    // An off-by-one here forbids the commonest request under every type.
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, default_max_duration_days: 2 },
        { plannedOutAt: iso(1), expectedReturn: iso(1 + 48) },
        NOW,
      ),
    ).toBeNull();
  });

  it('refuses a missing document only when the type demands one', () => {
    const window = { plannedOutAt: iso(1), expectedReturn: iso(5) };
    expect(
      describeRequestViolation({ ...NO_LIMITS, requires_attachment: true }, window, NOW),
    ).toMatch(/supporting document/i);
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, requires_attachment: true },
        { ...window, attachmentUrl: 'https://example.test/doc.pdf' },
        NOW,
      ),
    ).toBeNull();
    // A whitespace-only URL is not a document.
    expect(
      describeRequestViolation(
        { ...NO_LIMITS, requires_attachment: true },
        { ...window, attachmentUrl: '   ' },
        NOW,
      ),
    ).toMatch(/supporting document/i);
  });

  it('refuses a return that is not after the departure', () => {
    for (const back of [iso(1), iso(0.5)]) {
      expect(
        describeRequestViolation(NO_LIMITS, { plannedOutAt: iso(1), expectedReturn: back }, NOW),
      ).toMatch(/after the time you leave/i);
    }
  });

  it('refuses an unparseable date instead of sending NaN to Postgres', () => {
    expect(
      describeRequestViolation(
        NO_LIMITS,
        { plannedOutAt: 'not-a-date', expectedReturn: iso(5) },
        NOW,
      ),
    ).toMatch(/valid date/i);
    expect(
      describeRequestViolation(
        NO_LIMITS,
        { plannedOutAt: iso(1), expectedReturn: '' },
        NOW,
      ),
    ).toMatch(/valid date/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// The pass a warden issues directly
// ═══════════════════════════════════════════════════════════════════

describe('generateGatePass — the staff desk lane', () => {
  beforeEach(() => {
    recorded = [];
    rowByTable = {
      profiles: { id: 'profiles-uuid-0001' },
      hostel_allocations: { block_id: 'block-uuid-0001' },
      hostel_gate_passes: { id: 'pass-uuid-0001' },
    };
  });

  const INPUT = {
    institution_id: 'inst-uuid-0001',
    learner_id: 'learners-profiles-uuid-0001',
    approved_by: 'warden-uuid-0001',
    leave_type_id: 'leave-type-uuid-0001',
    destination: '  Salem, parental home  ',
    expected_return: '2026-09-14T13:00:00.000Z',
  };

  const insertPayload = () =>
    recorded.find((r) => r.table === 'hostel_gate_passes' && r.op === 'insert')!.payload;

  it('names no key that is not a column', async () => {
    await GatePassService.generateGatePass(INPUT);
    const phantom = Object.keys(insertPayload()).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(
      phantom,
      `these keys are not columns and would raise PGRST204: ${phantom.join(', ')}`,
    ).toEqual([]);
  });

  it('arrives already approved, with everything the issued-pass CHECK wants', async () => {
    await GatePassService.generateGatePass(INPUT);
    const payload = insertPayload();

    expect(payload.status).toBe('issued');
    expect(payload.approved_by).toBe('warden-uuid-0001');
    expect(payload.approved_at).toBeTruthy();
    expect(payload.pass_number).toBeTruthy();
  });

  it('does not set out_time — leaving is recorded by the gate, not by issuing', async () => {
    await GatePassService.generateGatePass(INPUT);
    expect(insertPayload()).not.toHaveProperty('out_time');
  });

  it('resolves the picker id into the profiles id the FK needs', async () => {
    await GatePassService.generateGatePass(INPUT);
    expect(insertPayload().learner_id).toBe('profiles-uuid-0001');
  });

  it('trims the operator’s stray spaces rather than storing them', async () => {
    await GatePassService.generateGatePass(INPUT);
    expect(insertPayload().destination).toBe('Salem, parental home');
  });

  it('normalises blank optional text to null, never to an empty string', async () => {
    await GatePassService.generateGatePass({
      ...INPUT,
      reason: '   ',
      transport_mode: '',
      accompanying_person: '   ',
    });
    const payload = insertPayload();
    expect(payload.reason).toBeNull();
    expect(payload.transport_mode).toBeNull();
    expect(payload.accompanying_person).toBeNull();
  });
});
