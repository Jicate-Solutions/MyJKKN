// ============================================================================
// The Pending tab must be able to hold a row, and Approve/Reject must be able
// to write one.
//
// /campus-living/gate-passes opens on a "Pending" tab — it is the DEFAULT
// landing view for every warden. It has a count card, a tab badge, an Approve
// button and a Reject button with a mandatory-reason dialog. None of it could
// ever do anything:
//
//   • requestGatePass wrote status = 'requested'. gate_pass_status_enum held
//     exactly issued|active|returned|overdue|cancelled, so every submit died
//     on 22P02 before reaching a constraint.
//   • the same insert omitted pass_number, qr_code and approved_by — all three
//     NOT NULL with no default — so with the enum fixed it would then die
//     on 23502.
//   • requestGatePass wrote `reason`, rejectGatePass wrote `rejected_by` +
//     `rejection_reason`, cancelGatePass wrote `cancelled_by` +
//     `cancellation_reason`. None of the five were columns → PGRST204.
//   • getPendingRequests filtered on that impossible status, so the queue
//     returned [] forever. An empty queue and a broken queue look identical.
//
// WHY THIS IS NOT SELF-AGREEMENT
// ------------------------------
// The two anchors below are NOT copied from the code under test:
//
//   LIVE_COLUMNS / LIVE_ENUM_LABELS / LIVE_NOT_NULL_NO_DEFAULT are the schema
//   as it stands on production TODAY — the same 18-column set the sibling
//   suite gate-pass-create-payload.test.tsx read from information_schema on
//   2026-08-14, and the enum from 20260222000015 line 134.
//
//   LIVE_UPDATE_POLICY is the live RLS expression captured in
//   rls_initplan_wrap_sweep.sql line 2324.
//
// Everything the service is allowed to name must be in that live schema OR
// declared by the migration file this PR ships. The migration is PARSED, not
// assumed — so deleting it, or shipping one that forgets a column, turns these
// tests red. Verified as a negative control by moving the migration aside and
// re-running: 8 of 13 fail, each naming the exact missing piece.
// ============================================================================

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Anchor 1: the live schema of public.hostel_gate_passes ──────────────────
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
];

// public.gate_pass_status_enum, 20260222000015 line 134.
const LIVE_ENUM_LABELS = ['issued', 'active', 'returned', 'overdue', 'cancelled'];

// NOT NULL, no default. A row that omits any of these raises 23502.
const LIVE_NOT_NULL_NO_DEFAULT = [
  'institution_id',
  'learner_id',
  'pass_type',
  'pass_number',
  'expected_return',
  'destination',
  'approved_by',
  'qr_code',
];

// The live UPDATE policy admits exactly one permission. The 2026-08-06 audit
// quoted in 20260903041500 measured ZERO holders of it.
const LIVE_UPDATE_POLICY_PERMISSION = 'campus_living.gate_passes.edit';

// ── Anchor 2: what this PR's migration declares ─────────────────────────────
const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20260907020000_gate_pass_request_workflow.sql',
);

const migrationSql = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : '';

function matchAll(source: string, rx: RegExp) {
  return [...source.matchAll(rx)].map((m) => m[1]);
}

const ADDED_ENUM_LABELS = matchAll(migrationSql, /ADD VALUE IF NOT EXISTS '([a-z_]+)'/g);
const ADDED_COLUMNS = matchAll(migrationSql, /ADD COLUMN IF NOT EXISTS\s+(\w+)/g);
const RELAXED_COLUMNS = matchAll(migrationSql, /ALTER COLUMN\s+(\w+)\s+DROP NOT NULL/g);

const WRITABLE_COLUMNS = new Set([...LIVE_COLUMNS, ...ADDED_COLUMNS]);
const VALID_STATUSES = new Set([...LIVE_ENUM_LABELS, ...ADDED_ENUM_LABELS]);
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
    in: chain,
    gte: chain,
    lte: chain,
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

const REQUEST_INPUT = {
  institution_id: 'inst-uuid-0001',
  learner_id: 'learners-profiles-uuid-0001',
  pass_type: 'regular_out',
  expected_return: '2026-09-08T18:30:00.000Z',
  destination: '  Salem, parental home  ',
  reason: '  Family function  ',
};

beforeEach(() => {
  recorded = [];
  rowByTable = {
    profiles: { id: 'profiles-uuid-0001' },
    [PASSES]: { id: 'pass-uuid-0001', status: 'issued' },
  };
});

describe('the status vocabulary the workflow runs on', () => {
  it('adds the two labels the enum is missing, so a request can exist at all', () => {
    expect(
      VALID_STATUSES.has(GATE_PASS_REQUESTED),
      `'${GATE_PASS_REQUESTED}' is not a gate_pass_status_enum label and no migration adds it — ` +
        `every request insert raises 22P02. Live labels: ${LIVE_ENUM_LABELS.join(', ')}`,
    ).toBe(true);
    expect(
      VALID_STATUSES.has(GATE_PASS_REJECTED),
      `'${GATE_PASS_REJECTED}' is not a gate_pass_status_enum label and no migration adds it — ` +
        `the Reject button can never record its decision.`,
    ).toBe(true);
  });

  it('does not silently rely on a label that only the TypeScript layer believes in', () => {
    // Both constants are NEW vocabulary — if either were already live, this
    // whole PR would be unnecessary and the test would be asserting nothing.
    expect(LIVE_ENUM_LABELS).not.toContain(GATE_PASS_REQUESTED);
    expect(LIVE_ENUM_LABELS).not.toContain(GATE_PASS_REJECTED);
  });
});

describe('requestGatePass — a learner asking for a pass', () => {
  it('names no key that is not a column on hostel_gate_passes', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT);

    const phantom = Object.keys(pick('insert').payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(
      phantom,
      `these keys are not columns and would raise PGRST204: ${phantom.join(', ')}`,
    ).toEqual([]);
  });

  it('writes a status the column can hold', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT);

    const status = pick('insert').payload.status as string;
    expect(VALID_STATUSES.has(status), `status '${status}' is not a valid enum label`).toBe(true);
    expect(status).toBe(GATE_PASS_REQUESTED);
  });

  it('omits pass_number, qr_code and approved_by — and the migration makes that legal', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT);
    const payload = pick('insert').payload;

    // A pass that has only been asked for genuinely has none of the three.
    for (const col of ['pass_number', 'qr_code', 'approved_by']) {
      expect(payload).not.toHaveProperty(col);
    }

    // So every NOT NULL column the payload omits must have been relaxed.
    const wouldRaise23502 = STILL_REQUIRED.filter((c) => payload[c] === undefined);
    expect(
      wouldRaise23502,
      `still NOT NULL and not supplied — the insert raises 23502 on: ${wouldRaise23502.join(', ')}`,
    ).toEqual([]);
  });

  it('resolves the picker id into the profiles id the FK and the RLS lane both need', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT);

    // learner_id is FK'd to profiles(id), and the resident INSERT policy
    // compares learner_id = auth.uid(). Passing the picker's
    // learners_profiles.id straight through is a guaranteed 23503.
    expect(pick('insert').payload.learner_id).toBe('profiles-uuid-0001');
    expect(recorded.some((r) => r.table === 'profiles')).toBe(true);
  });

  it('trims the free text the learner typed', async () => {
    await GatePassService.requestGatePass(REQUEST_INPUT);
    const payload = pick('insert').payload;

    expect(payload.destination).toBe('Salem, parental home');
    expect(payload.reason).toBe('Family function');
  });
});

describe('approveGatePass — the Approve button', () => {
  it('names no key that is not a column', async () => {
    rowByTable[PASSES] = { id: 'pass-uuid-0001', status: 'issued' };
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');

    const phantom = Object.keys(pick('update').payload).filter((k) => !WRITABLE_COLUMNS.has(k));
    expect(phantom, `not columns: ${phantom.join(', ')}`).toEqual([]);
  });

  it('fills the three fields the issued-pass CHECK now demands', async () => {
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');
    const payload = pick('update').payload;

    expect(payload.status).toBe('issued');
    expect(payload.approved_by).toBe('warden-uuid-0001');
    expect(payload.pass_number).toBeTruthy();
    expect(payload.qr_code).toBeTruthy();
  });

  it('only acts on a row that is still pending', async () => {
    await GatePassService.approveGatePass('pass-uuid-0001', 'warden-uuid-0001');

    // Without this filter a second click on a stale tab re-issues an already
    // active pass a NEW qr_code, invalidating the one the learner is carrying.
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

  it('records who refused, why, and a status the column can hold', async () => {
    await GatePassService.rejectGatePass('pass-uuid-0001', 'warden-uuid-0001', '  Exams this week  ');
    const payload = pick('update').payload;

    expect(VALID_STATUSES.has(payload.status as string)).toBe(true);
    expect(payload.status).toBe(GATE_PASS_REJECTED);
    expect(payload.rejected_by).toBe('warden-uuid-0001');
    expect(payload.rejection_reason).toBe('Exams this week');
  });

  it('will not refuse a request without telling the learner why', async () => {
    await expect(
      GatePassService.rejectGatePass('pass-uuid-0001', 'warden-uuid-0001', '   '),
    ).rejects.toThrow(/reason/i);
    expect(recorded.some((r) => r.table === PASSES && r.op === 'update')).toBe(false);
  });
});

describe('getPendingRequests — what fills the tab', () => {
  it('filters on a status a row can actually hold', async () => {
    await GatePassService.getPendingRequests('inst-uuid-0001');

    const statusFilter = pick('select').filters.find(([col]) => col === 'status');
    expect(statusFilter, 'the pending queue does not filter on status at all').toBeTruthy();
    expect(
      VALID_STATUSES.has(statusFilter![1] as string),
      `the queue filters on '${statusFilter![1]}', which no row can ever hold — the tab stays empty forever`,
    ).toBe(true);
  });
});

describe('the migration keeps the write lane open for the people who decide', () => {
  it('admits approve and reject without closing the lane that already exists', () => {
    expect(
      migrationSql.includes('campus_living.gate_passes.approve'),
      'the UPDATE policy still does not admit .approve — every Approve click updates 0 rows and reports success',
    ).toBe(true);
    expect(
      migrationSql.includes('campus_living.gate_passes.reject'),
      'the UPDATE policy still does not admit .reject',
    ).toBe(true);
    expect(
      migrationSql.includes(LIVE_UPDATE_POLICY_PERMISSION),
      `the replacement policy dropped the live lane ${LIVE_UPDATE_POLICY_PERMISSION}`,
    ).toBe(true);
  });

  it('keeps the issued-pass guarantee the dropped NOT NULLs used to carry', () => {
    expect(RELAXED_COLUMNS.sort()).toEqual(['approved_by', 'pass_number', 'qr_code']);
    expect(
      migrationSql.includes('hostel_gate_passes_issued_pass_is_complete'),
      'nothing replaces the NOT NULLs — an issued pass could exist with no QR code and no guard would find out until midnight',
    ).toBe(true);
  });

  it('never casts a label it added in the same file, so it can be rehearsed in a transaction', () => {
    // ALTER TYPE ... ADD VALUE forbids USING the new value in the same
    // transaction. The two places Postgres would coerce a literal to
    // gate_pass_status_enum are the CHECK expression and the policy body; a
    // label there would abort any BEGIN ... ROLLBACK review rehearsal while
    // still working unwrapped — a difference that only shows up on production.
    // (Comparisons against pg_enum.enumlabel::text are text, never a cast.)
    const checkExpr = migrationSql.slice(
      migrationSql.indexOf('CHECK ('),
      migrationSql.indexOf('END $$;', migrationSql.indexOf('CHECK (')),
    );
    const policyStart = migrationSql.indexOf('CREATE POLICY hostel_gate_passes_update_permission');
    const policyExpr = migrationSql.slice(policyStart, migrationSql.indexOf('\n);', policyStart));

    expect(checkExpr, 'the issued-pass CHECK is not in the file at all').toContain('status NOT IN');

    for (const label of ADDED_ENUM_LABELS) {
      expect(
        checkExpr.includes(`'${label}'`),
        `the CHECK names '${label}', a label added by this same file — that raises 55000 in a transaction`,
      ).toBe(false);
      expect(
        policyExpr.includes(`'${label}'`),
        `the UPDATE policy names '${label}', a label added by this same file`,
      ).toBe(false);
      expect(
        migrationSql.includes(`'${label}'::`),
        `the file casts '${label}' to a type explicitly`,
      ).toBe(false);
    }
  });
});

describe('the detail page reads only fields its own query produces', () => {
  it('touches no property that is neither a column nor an embed', () => {
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

    // getGatePass selects '*' plus two embeds. Anything else the page reads off
    // `pass` is undefined on a real row — and `.map`/`.name` on undefined is a
    // crash, not a blank. hostel_gate_passes held zero rows, so nobody hit it.
    const allowed = new Set([...WRITABLE_COLUMNS, 'learner', 'hostel_leave_requests']);

    // Property reads only — skip `pass.foo(` style calls, there are none.
    const read = [...source.matchAll(/\bpass\.(\w+)/g)].map((m) => m[1]);
    const invented = [...new Set(read)].filter((p) => !allowed.has(p));

    expect(
      invented,
      `the page reads these off the gate-pass row and the query produces none of them: ${invented.join(', ')}`,
    ).toEqual([]);
  });
});
