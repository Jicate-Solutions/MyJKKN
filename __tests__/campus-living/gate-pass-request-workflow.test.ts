// ============================================================================
// The gate-pass flow must be able to write what it claims to write.
//
// Every column this service names has to exist, every status has to be a label
// the enum holds, and every NOT NULL column has to be supplied or relaxed.
// Get any of those wrong and the failure is SILENT in the way this stack
// specialises in: PGRST204 on a phantom column, 22P02 on an impossible enum
// label, 23502 on a missing required one — all arriving in `{ error }` that a
// fire-and-forget caller never reads, leaving a queue that is empty and a
// queue that is broken looking identical.
//
// That is not hypothetical here. hostel_gate_passes sat at ZERO rows for a
// year because `requestGatePass` wrote a status the enum did not have, and the
// Pending tab filtered on that same impossible value.
//
// WHY THIS IS NOT SELF-AGREEMENT
// ------------------------------
// The anchors below are NOT copied from the code under test:
//
//   LIVE_COLUMNS / LIVE_ENUM_LABELS / LIVE_NOT_NULL_NO_DEFAULT are the schema
//   as it stood on production immediately BEFORE this rebuild, read from
//   information_schema and pg_enum on 2026-09-12.
//
// Everything the service is allowed to name must be in that live schema OR
// declared by the rebuild migration this PR ships. The migration is PARSED
// from disk, not assumed — so deleting it, or shipping one that forgets a
// column, turns these tests red.
// ============================================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Anchor 1: public.hostel_gate_passes BEFORE the rebuild migration ────────
// Read from information_schema 2026-09-12. The five request-workflow columns
// (reason, rejected_by, rejection_reason, cancelled_by, cancellation_reason)
// are present because 20260907020000 IS applied, despite its file header
// still saying "NOT APPLIED — FILE ONLY".
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

// public.gate_pass_status_enum, all seven labels, read from pg_enum 2026-09-12.
const LIVE_ENUM_LABELS = [
  'requested',
  'issued',
  'active',
  'returned',
  'overdue',
  'cancelled',
  'rejected',
];

// NOT NULL, no default, before the rebuild. pass_number / qr_code /
// approved_by are already nullable — 20260907020000 relaxed them.
const LIVE_NOT_NULL_NO_DEFAULT = [
  'institution_id',
  'learner_id',
  'pass_type',
  'expected_return',
  'destination',
];

// ── Anchor 2: what this PR's migration declares ─────────────────────────────
const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260912120000_gate_pass_rebuild.sql',
);

const migrationSql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : '';

function matchAll(source: string, rx: RegExp) {
  return [...source.matchAll(rx)].map((m) => m[1]);
}

const ADDED_COLUMNS = matchAll(migrationSql, /ADD COLUMN IF NOT EXISTS\s+(\w+)/g);
const RELAXED_COLUMNS = matchAll(migrationSql, /ALTER COLUMN\s+(\w+)\s+DROP NOT NULL/g);

const WRITABLE_COLUMNS = new Set([...LIVE_COLUMNS, ...ADDED_COLUMNS]);
const VALID_STATUSES = new Set(LIVE_ENUM_LABELS);
const STILL_REQUIRED = LIVE_NOT_NULL_NO_DEFAULT.filter((c) => !RELAXED_COLUMNS.includes(c));

// ── A recording stand-in for the Supabase client ────────────────────────────
type Recorded = {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload: Record<string, unknown>;
  filters: [string, unknown][];
};

let recorded: Recorded[] = [];
let rowByTable: Record<string, unknown> = {};

function builderFor(rec: Recorded) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const result = () => ({ data: rowByTable[rec.table] ?? null, error: null });

  Object.assign(b, {
    select: chain,
    eq: (col: string, val: unknown) => {
      rec.filters.push([col, val]);
      return b;
    },
    in: (col: string, val: unknown) => {
      rec.filters.push([col, val]);
      return b;
    },
    is: chain,
    gte: chain,
    lte: chain,
    lt: chain,
    limit: chain,
    order: chain,
    range: chain,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: rowByTable[rec.table] ? [rowByTable[rec.table]] : [],
        error: null,
        count: 0,
      }).then(ok, no),
  });
  return b as never;
}

const fakeClient = {
  from(table: string) {
    return {
      select: () => {
        const rec: Recorded = { table, op: 'select', payload: {}, filters: [] };
        recorded.push(rec);
        return builderFor(rec);
      },
      insert: (payload: Record<string, unknown>) => {
        const rec: Recorded = { table, op: 'insert', payload, filters: [] };
        recorded.push(rec);
        return builderFor(rec);
      },
      update: (payload: Record<string, unknown>) => {
        const rec: Recorded = { table, op: 'update', payload, filters: [] };
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
  GATE_PASS_REJECTED,
  GATE_PASS_REQUESTED,
  GatePassService,
} from '@/lib/services/campus-living/gate-pass-service';

const PASSES = 'hostel_gate_passes';
const pick = (op: Recorded['op']) => recorded.find((r) => r.table === PASSES && r.op === op)!;

/** A type with no policy limits — the rules themselves are tested separately. */
const NO_LIMITS = {
  advance_notice_hours: null,
  default_max_duration_days: null,
  requires_attachment: false,
};

const REQUEST_INPUT = {
  institution_id: 'inst-uuid-0001',
  learner_id: 'learners-profiles-uuid-0001',
  leave_type_id: 'leave-type-uuid-0001',
  destination: '  Salem, parental home  ',
  reason: '  Family function  ',
  planned_out_at: '2026-09-13T04:30:00.000Z',
  expected_return: '2026-09-14T13:00:00.000Z',
  transport_mode: '  College bus  ',
  accompanying_person: '  Father — R. Kumar  ',
};

beforeEach(() => {
  recorded = [];
  rowByTable = {
    profiles: { id: 'profiles-uuid-0001' },
    hostel_allocations: { block_id: 'block-uuid-0001' },
    [PASSES]: { id: 'pass-uuid-0001', status: 'issued' },
  };
});

describe('the status vocabulary the workflow runs on', () => {
  it('uses only labels the enum actually holds', () => {
    // Both were added by 20260907020000 and ARE live — verified against
    // pg_enum on 2026-09-12. An insert naming anything else dies on 22P02.
    expect(VALID_STATUSES.has(GATE_PASS_REQUESTED)).toBe(true);
    expect(VALID_STATUSES.has(GATE_PASS_REJECTED)).toBe(true);
  });
});

describe('requestGatePass — a learner asking for a pass', () => {
  it('names no key that is not a column on hostel_gate_passes', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);

    const phantom = Object.keys(pick('insert').payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(
      phantom,
      `these keys are not columns and would raise PGRST204: ${phantom.join(', ')}`,
    ).toEqual([]);
  });

  it('writes a status the column can hold', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);

    const status = pick('insert').payload.status as string;
    expect(VALID_STATUSES.has(status), `status '${status}' is not a valid enum label`).toBe(true);
    expect(status).toBe(GATE_PASS_REQUESTED);
  });

  it('omits pass_number and approved_by — a request has neither', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);
    const payload = pick('insert').payload;

    for (const col of ['pass_number', 'approved_by', 'qr_code']) {
      expect(payload).not.toHaveProperty(col);
    }

    // So every NOT NULL column the payload omits must have been relaxed.
    const wouldRaise23502 = STILL_REQUIRED.filter((c) => payload[c] === undefined);
    expect(
      wouldRaise23502,
      `still NOT NULL and not supplied — the insert raises 23502 on: ${wouldRaise23502.join(', ')}`,
    ).toEqual([]);
  });

  it('classifies by leave_type_id, the list the settings screen configures', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);
    const payload = pick('insert').payload;

    expect(payload.leave_type_id).toBe('leave-type-uuid-0001');
    // pass_type is the retired 4-value enum. Writing it would re-introduce a
    // second, disagreeing classification.
    expect(payload).not.toHaveProperty('pass_type');
  });

  it('resolves the picker id into the profiles id the FK and the RLS lane both need', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);

    // learner_id is FK'd to profiles(id), and the resident INSERT policy
    // compares learner_id = auth.uid(). Passing the picker's
    // learners_profiles.id straight through is a guaranteed 23503.
    expect(pick('insert').payload.learner_id).toBe('profiles-uuid-0001');
    expect(recorded.some((r) => r.table === 'profiles')).toBe(true);
  });

  it('stamps the block from the active allocation, for the gate audit log', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);

    // hostel_access_log.block_id is NOT NULL; without this stamp the gate
    // scan has nothing to attribute the movement to.
    expect(pick('insert').payload.block_id).toBe('block-uuid-0001');
  });

  it('trims the free text the learner typed', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT, NO_LIMITS);
    const payload = pick('insert').payload;

    expect(payload.destination).toBe('Salem, parental home');
    expect(payload.reason).toBe('Family function');
    expect(payload.transport_mode).toBe('College bus');
    expect(payload.accompanying_person).toBe('Father — R. Kumar');
  });

  it('re-checks the leave-type rules before inserting, not only on the form', async () => {
    // The form is a courtesy. This is the boundary — a learner who bypasses
    // the UI must hit the same refusal.
    await expect(
      GatePassService.requestGatePass(REQUEST_INPUT, {
        ...NO_LIMITS,
        requires_attachment: true,
      }),
    ).rejects.toThrow(/supporting document/i);

    expect(recorded.some((r) => r.table === PASSES && r.op === 'insert')).toBe(false);
  });
});

describe('approveGatePass — the Approve button', () => {
  it('names no key that is not a column', async () => {
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');

    const phantom = Object.keys(pick('update').payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(phantom, `not columns: ${phantom.join(', ')}`).toEqual([]);
  });

  it('fills what the issued-pass CHECK demands, and nothing it does not', async () => {
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');
    const payload = pick('update').payload;

    expect(payload.status).toBe('issued');
    expect(payload.approved_by).toBe('warden-uuid-0001');
    expect(payload.pass_number).toBeTruthy();
    expect(payload.approved_at).toBeTruthy();

    // No per-pass QR any more: the gate scans the learner's permanent MyJKKN
    // QR. Generating one would be dead data, and the CHECK no longer wants it.
    expect(payload).not.toHaveProperty('qr_code');
  });

  it('only acts on a row that is still pending', async () => {
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');

    // Without this filter a second click on a stale tab re-issues an already
    // active pass a NEW pass_number, invalidating the learner's reference.
    expect(pick('update').filters).toContainEqual(['status', GATE_PASS_REQUESTED]);
  });

  it('refuses out loud when nothing was updated, instead of reporting success', async () => {
    rowByTable[PASSES] = null as never;

    await expect(
      GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001'),
    ).rejects.toThrow(/no longer pending|permission/i);
  });
});

describe('rejectGatePass — the Reject button', () => {
  it('names no key that is not a column', async () => {
    await GatePassService.rejectGatePass('pass-uuid-0001', 'warden-uuid-0001', 'Exams this week');

    const phantom = Object.keys(pick('update').payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(phantom, `not columns: ${phantom.join(', ')}`).toEqual([]);
  });

  it('records who refused, when, why, and a status the column can hold', async () => {
    await GatePassService.rejectGatePass(
      'pass-uuid-0001',
      'warden-uuid-0001',
      '  Exams this week  ',
    );
    const payload = pick('update').payload;

    expect(VALID_STATUSES.has(payload.status as string)).toBe(true);
    expect(payload.status).toBe(GATE_PASS_REJECTED);
    expect(payload.rejected_by).toBe('warden-uuid-0001');
    expect(payload.rejected_at).toBeTruthy();
    expect(payload.rejection_reason).toBe('Exams this week');
  });

  it('will not refuse a request without telling the learner why', async () => {
    await expect(
      GatePassService.rejectGatePass('pass-uuid-0001', 'warden-uuid-0001', '   '),
    ).rejects.toThrow(/reason/i);
    expect(recorded.some((r) => r.table === PASSES && r.op === 'update')).toBe(false);
  });
});

describe('recordParentCall — the phone call, recorded', () => {
  it('stores WHICH number was dialled, not just that somebody was called', async () => {
    await GatePassService.recordParentCall('pass-uuid-0001', 'warden-uuid-0001', '9876543210');
    const payload = pick('update').payload;

    // A learner has three numbers on file. "A parent was contacted" without
    // naming one is not a record anybody can act on later.
    expect(payload.parent_confirmed_number).toBe('9876543210');
    expect(payload.parent_confirmed_by).toBe('warden-uuid-0001');
    expect(payload.parent_confirmed_at).toBeTruthy();

    const phantom = Object.keys(payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(phantom, `not columns: ${phantom.join(', ')}`).toEqual([]);
  });
});

describe('cancelGatePass — withdrawing a pass', () => {
  it('cannot rewrite closed history', async () => {
    await GatePassService.cancelGatePass('pass-uuid-0001', 'warden-uuid-0001', 'Plans changed');

    // Before the rebuild this had no status filter at all and would happily
    // "cancel" a pass the learner had already returned on.
    const statusFilter = pick('update').filters.find(([col]) => col === 'status');
    expect(statusFilter, 'cancel does not scope by status — it can rewrite a closed pass').toBeTruthy();
    expect(statusFilter![1]).toEqual(['requested', 'issued']);
  });
});

describe('getPendingRequests — what fills the tab', () => {
  it('filters on a status a row can actually hold', async () => {
    await GatePassService.getPendingRequests(['inst-uuid-0001']);

    const statusFilter = pick('select').filters.find(([col]) => col === 'status');
    expect(statusFilter, 'the pending queue does not filter on status at all').toBeTruthy();
    expect(
      VALID_STATUSES.has(statusFilter![1] as string),
      `the queue filters on '${statusFilter![1]}', which no row can ever hold — the tab stays empty forever`,
    ).toBe(true);
  });

  it('scopes to the institutions it was given, without an isSuperAdmin branch', async () => {
    await GatePassService.getPendingRequests(['inst-a', 'inst-b']);

    // Passing accessible ids through — rather than dropping the filter for a
    // super admin — is what keeps a scope='all' secondary role working.
    expect(pick('select').filters).toContainEqual(['institution_id', ['inst-a', 'inst-b']]);
  });
});

describe('the rebuild migration matches what the service assumes', () => {
  it('adds every column the service writes but the live schema lacks', () => {
    const needed = [
      'leave_type_id',
      'block_id',
      'planned_out_at',
      'transport_mode',
      'accompanying_person',
      'attachment_url',
      'approved_at',
      'rejected_at',
      'parent_confirmed_at',
      'parent_confirmed_by',
      'parent_confirmed_number',
    ];
    const missing = needed.filter((c) => !ADDED_COLUMNS.includes(c));
    expect(
      missing,
      `the migration does not add these, so every write naming them raises PGRST204: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('makes pass_type optional, since nothing writes it any more', () => {
    expect(
      RELAXED_COLUMNS,
      'pass_type is still NOT NULL — every request insert would fail on 23502',
    ).toContain('pass_type');
  });

  it('drops qr_code from the issued-pass CHECK, since no pass generates one', () => {
    expect(
      migrationSql.includes('hostel_gate_passes_issued_pass_is_complete'),
      'the issued-pass CHECK is gone entirely — an issued pass could exist with no number and no approver',
    ).toBe(true);

    // Line endings in this repo are MIXED per file and git rewrites them on
    // checkout, so the slice must never anchor on a literal '\n'.
    const checkExpr =
      /ADD CONSTRAINT\s+hostel_gate_passes_issued_pass_is_complete\s+CHECK\s*\(([\s\S]*?)\);/.exec(
        migrationSql,
      )?.[1] ?? '';
    expect(checkExpr, 'could not locate the CHECK expression in the migration').not.toBe('');
    expect(
      checkExpr.includes('qr_code'),
      'the CHECK still requires qr_code, so approval fails on 23514 for a pass that correctly has none',
    ).toBe(false);
    expect(checkExpr).toContain('pass_number');
    expect(checkExpr).toContain('approved_by');
  });

  it('grants the leave-type read the learner form depends on', () => {
    // hostel_leave_types SELECT requires campus_living.leave_types.view, and
    // `student` did not hold it. Without this the type dropdown renders empty
    // with no error at all.
    expect(
      migrationSql.includes('campus_living.leave_types.view'),
      'nothing grants leave_types.view — the learner sees an empty type dropdown and no error',
    ).toBe(true);
    expect(migrationSql).toMatch(/permissions\s*\|\|\s*jsonb_build_object/);
    // A bare jsonb_build_object REPLACES the whole permissions object.
    expect(migrationSql).not.toMatch(/SET permissions\s*=\s*jsonb_build_object/);
  });

  it('indexes the lookup the gate runs on every single scan', () => {
    expect(
      migrationSql.includes('idx_hgp_learner_status'),
      'learner_id + status is unindexed, and it is the query every gate scan makes',
    ).toBe(true);
  });

  it('contains no transaction block — exec_sql EXECUTEs inside a function', () => {
    // scripts/apply-migration-file.mjs ships the body through
    // public.exec_sql(), where BEGIN/COMMIT is a syntax error.
    expect(migrationSql).not.toMatch(/^\s*BEGIN;\s*$/m);
    expect(migrationSql).not.toMatch(/^\s*COMMIT;\s*$/m);
  });
});

describe('the detail page reads only fields its own query produces', () => {
  it('touches no property that is neither a column nor a resolved name', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/(routes)/campus-living/gate-passes/[id]/page.tsx',
    );
    // Comments are stripped first: this page's own notes quote the property
    // names that used to be read, and scanning those would report the bug as
    // still present forever.
    const source = readFileSync(pagePath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    // getGatePassDetail returns the row plus embeds. Anything else the page
    // reads off `pass` is undefined on a real row — and `.map`/`.name` on
    // undefined is a crash, not a blank.
    const allowed = new Set([...WRITABLE_COLUMNS, 'learner', 'leave_type']);

    const read = [...source.matchAll(/\bpass\.(\w+)/g)].map((m) => m[1]);
    const invented = [...new Set(read)].filter((p) => !allowed.has(p));

    expect(
      invented,
      `the page reads these off the gate-pass row and the query produces none of them: ${invented.join(', ')}`,
    ).toEqual([]);
  });
});
