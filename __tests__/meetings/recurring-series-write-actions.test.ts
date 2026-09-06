// __tests__/meetings/recurring-series-write-actions.test.ts
//
// The WRITE paths of the EAO's recurring-series configuration (PR #3234).
//
// WHY THIS FILE EXISTS
//   #3234 shipped five tables and two screens. Its read and render path was
//   driven at 390px in light and dark and looks right. Its WRITE path was never
//   exercised once: the dev server that verified it points at PRODUCTION, so
//   clicking "+ New", "Add" or "Save order" would have written real rows into
//   five live, empty tables. Not clicking them was correct — and it left
//   creating a series, adding a blocked period and persisting a rotation order
//   completely untested end to end.
//
//   The sibling recurring-series-config.test.ts covers the PURE rules
//   (lib/services/meetings/recurring-series-config.ts) — cadence options,
//   coverage arithmetic, attendee resolution, rotation. Not one of its 31 tests
//   reaches a server action. Everything below does, and nothing below touches a
//   real database.
//
// HOW THE FAKE DATABASE EARNS ITS KEEP
//   A mock that answers {data, error:null} to everything makes every test pass,
//   including tests of code that is broken. So the fake below:
//
//     * APPLIES .eq()/.in()/.not() filters for real, so an action that forgets
//       to scope by series_id reads another series' rows and goes red here.
//     * ENFORCES the migration's actual CHECK and UNIQUE constraints. Deleting
//       validate() from actions.ts does not turn these tests green — the bad
//       payload then hits a constraint and the friendly-message assertions fail.
//     * RECORDS every payload verbatim, undefined keys included, so assertions
//       are on WHAT WAS SENT rather than on "it returned without throwing".
//       The shape assertions use toStrictEqual, which (unlike toEqual) fails
//       when a key is dropped rather than set to null.
//     * Registers the five new tables EXPLICITLY. An unknown table name throws
//       loudly instead of falling through to some other table's builder and
//       passing by accident.
//
// SCOPE. Tests only. No behaviour was changed. Three findings surfaced while
// writing these and are documented by tests named "DOCUMENTED BUG" — they are
// characterisation tests that pin what the code does TODAY, deliberately not
// fixed here, because a behaviour change belongs in its own pull request.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── mocks ────────────────────────────────────────────────────────────────────
//
// The meetings import chain builds a Resend client and a browser Supabase
// client at import time and throws without their env. The series actions do not
// use either, but searchSeriesPeople reaches ../schedule/actions through a
// dynamic import, so the stubs stay: they cost nothing and the module graph is
// one edit away from needing them.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingConfirmedEmails: vi.fn(),
    sendBookingRescheduledEmails: vi.fn(),
    sendBookingCancelledEmails: vi.fn(),
  },
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: { busyForHost: vi.fn(async () => ({ status: 'ok', busy: [] })) },
  isGoogleCalConfigured: () => true,
}));

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';

interface TableSpec {
  /**
   * Column DEFAULTs from the migration, applied when a payload omits the key.
   *
   * These are not decoration. `may_be_online` defaults to true and `is_required`
   * defaults to true, so a payload that DROPPED either key would still store a
   * value — the opposite one. Modelling the defaults is what makes the "false
   * was written, not dropped" tests below able to fail.
   */
  defaults: Row;
  /** UNIQUE constraints from the migration, as column tuples. */
  unique: string[][];
  /** CHECK constraints from the migration. Return a message to reject. */
  checks: Array<{ name: string; failsOn: (row: Row) => boolean }>;
}

/**
 * The five new tables plus the two the actions read alongside them.
 *
 * Constraints copied from supabase/migrations/20261014093000_meeting_recurring_
 * series_config.sql, not invented. They are what stops these tests passing over
 * an actions.ts whose validate() has been removed.
 */
const TABLES: Record<string, TableSpec> = {
  meeting_recurring_series: {
    defaults: {
      cadence: 'monthly',
      duration_min: 60,
      may_be_online: true,
      coverage_mode: 'all_institutions',
      priority: 100,
      rotation_cursor: 0,
      is_active: true,
    },
    unique: [['host_profile_id', 'name']], // mrs_unique_name_per_host
    checks: [
      {
        name: 'mrs_name_not_blank',
        failsOn: (r) => !String(r.name ?? '').trim(),
      },
      {
        name: 'mrs_cadence_known',
        failsOn: (r) =>
          !['weekly', 'fortnightly', 'monthly', 'twice_monthly'].includes(String(r.cadence)),
      },
      {
        name: 'mrs_coverage_mode_known',
        failsOn: (r) =>
          !['all_institutions', 'listed_only'].includes(String(r.coverage_mode)),
      },
      {
        name: 'mrs_weekday_range',
        failsOn: (r) =>
          r.preferred_weekday !== null &&
          r.preferred_weekday !== undefined &&
          !(Number(r.preferred_weekday) >= 0 && Number(r.preferred_weekday) <= 6),
      },
      {
        name: 'mrs_start_minute_range',
        failsOn: (r) =>
          r.preferred_start_minute !== null &&
          r.preferred_start_minute !== undefined &&
          !(Number(r.preferred_start_minute) >= 0 && Number(r.preferred_start_minute) <= 1439),
      },
      {
        name: 'mrs_duration_range',
        failsOn: (r) => !(Number(r.duration_min) >= 5 && Number(r.duration_min) <= 1440),
      },
      {
        name: 'mrs_priority_range',
        failsOn: (r) => !(Number(r.priority) >= 1 && Number(r.priority) <= 1000),
      },
    ],
  },
  meeting_recurring_series_units: {
    defaults: { is_excluded: false },
    unique: [['series_id', 'institution_id']], // mrsu_unique_unit_per_series
    checks: [],
  },
  meeting_recurring_series_attendees: {
    defaults: { is_required: true },
    unique: [['series_id', 'profile_id']], // mrsa_unique_person_per_series
    checks: [],
  },
  meeting_blocked_periods: {
    defaults: { block_kind: 'public_holiday', is_active: true },
    unique: [],
    checks: [
      { name: 'mbp_name_not_blank', failsOn: (r) => !String(r.name ?? '').trim() },
      {
        name: 'mbp_kind_known',
        failsOn: (r) => !['public_holiday', 'festival'].includes(String(r.block_kind)),
      },
      {
        name: 'mbp_range_ordered',
        failsOn: (r) => String(r.ends_on) < String(r.starts_on),
      },
    ],
  },
  meeting_rotation_order: {
    defaults: {},
    unique: [['institution_id']], // mro_unique_institution
    checks: [{ name: 'mro_position_nonneg', failsOn: (r) => Number(r.position) < 0 }],
  },
  profiles: { defaults: {}, unique: [], checks: [] },
  institutions: { defaults: {}, unique: [], checks: [] },
};

interface Recorded {
  table: string;
  op: Op;
  /** Exactly what the action handed supabase-js, before any id was assigned. */
  payload: Row | Row[];
}

let store: Record<string, Row[]> = {};
let recorded: Recorded[] = [];
let currentUser: string | null = 'eao-1';
let seq = 0;
/** table+op pairs forced to return an error, so failure paths are real paths. */
let failures: Array<{ table: string; op: Op; message: string }> = [];

function failOn(table: string, op: Op, message: string) {
  failures.push({ table, op, message });
}

/** Shallow clone that PRESERVES explicitly-undefined keys (JSON would drop them). */
function snapshot(value: Row | Row[]): Row | Row[] {
  return Array.isArray(value) ? value.map((r) => ({ ...r })) : { ...value };
}

class FakeQuery {
  private op: Op = 'select';
  private payload: Row | Row[] = {};
  private eqs: Array<[string, unknown]> = [];
  private ins: Array<[string, unknown[]]> = [];
  private nots: Array<[string, string, unknown]> = [];
  private orders: Array<[string, boolean]> = [];

  constructor(private table: string) {
    if (!TABLES[this.table]) {
      // Loud on purpose. A stub that routes an unknown table to some other
      // table's builder is how a test passes over a typo'd table name.
      throw new Error(`FakeQuery: no explicit branch registered for table "${table}"`);
    }
  }

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.eqs.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.ins.push([col, vals]);
    return this;
  }
  not(col: string, operator: string, val: unknown) {
    this.nots.push([col, operator, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push([col, opts?.ascending !== false]);
    return this;
  }
  limit() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private rows(): Row[] {
    store[this.table] ??= [];
    return store[this.table];
  }

  private matched(): Row[] {
    const hit = this.rows().filter(
      (r) =>
        this.eqs.every(([c, v]) => r[c] === v) &&
        this.ins.every(([c, vs]) => vs.includes(r[c])) &&
        this.nots.every(([c, operator, v]) =>
          operator === 'is' && v === null ? r[c] !== null && r[c] !== undefined : r[c] !== v,
        ),
    );
    for (const [col, asc] of [...this.orders].reverse()) {
      hit.sort((a, b) => {
        const av = a[col] as never;
        const bv = b[col] as never;
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    return hit;
  }

  /** The migration's constraints, applied for real. */
  private violation(candidate: Row, batch: Row[]): string | null {
    const spec = TABLES[this.table];
    for (const c of spec.checks) {
      if (c.failsOn(candidate)) {
        return `new row for relation "${this.table}" violates check constraint "${c.name}"`;
      }
    }
    for (const cols of spec.unique) {
      const clash = (r: Row) =>
        r !== candidate && cols.every((c) => r[c] === candidate[c]);
      if (this.rows().some(clash) || batch.some(clash)) {
        return `duplicate key value violates unique constraint on (${cols.join(', ')})`;
      }
    }
    return null;
  }

  private run(): { data: Row[] | null; error: { message: string } | null } {
    const forced = failures.find((f) => f.table === this.table && f.op === this.op);
    if (forced) return { data: null, error: { message: forced.message } };

    if (this.op === 'insert') {
      recorded.push({ table: this.table, op: 'insert', payload: snapshot(this.payload) });
      const spec = TABLES[this.table];
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(
        (r) => {
          const row: Row = { id: `gen-${++seq}`, ...r };
          // Column DEFAULTs fill in for keys the payload never sent.
          for (const [col, value] of Object.entries(spec.defaults)) {
            if (row[col] === undefined) row[col] = value;
          }
          return row;
        },
      );
      const accepted: Row[] = [];
      for (const row of incoming) {
        const bad = this.violation(row, accepted);
        if (bad) return { data: null, error: { message: bad } };
        accepted.push(row);
      }
      this.rows().push(...accepted);
      return { data: accepted, error: null };
    }

    if (this.op === 'update') {
      recorded.push({ table: this.table, op: 'update', payload: snapshot(this.payload) });
      const hit = this.matched();
      for (const r of hit) {
        const merged = { ...r, ...(this.payload as Row) };
        const bad = this.violation(merged, []);
        if (bad) return { data: null, error: { message: bad } };
      }
      for (const r of hit) Object.assign(r, this.payload as Row);
      // PostgREST returns no error and no rows when the filter (or an RLS
      // policy) matched nothing. Reproduced faithfully — that is the point.
      return { data: hit, error: null };
    }

    if (this.op === 'delete') {
      const hit = this.matched();
      recorded.push({ table: this.table, op: 'delete', payload: hit.map((r) => ({ ...r })) });
      store[this.table] = this.rows().filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }

    return { data: this.matched(), error: null };
  }

  async single() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const row = (data ?? [])[0] ?? null;
    return row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } };
  }
  async maybeSingle() {
    const { data, error } = this.run();
    return { data: (data ?? [])[0] ?? null, error };
  }
  then(
    res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown,
    rej?: (e: unknown) => unknown,
  ) {
    return Promise.resolve()
      .then(() => this.run())
      .then(res, rej);
  }
}

function makeSupabase() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: currentUser ? { id: currentUser } : null },
        error: null,
      })),
    },
    from: (table: string) => new FakeQuery(table),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabase()),
}));

// Imported AFTER the mocks are registered.
import {
  createSeries,
  deleteSeries,
  listInstitutionOptions,
  listSeries,
  setSeriesAttendees,
  setSeriesUnits,
  updateSeries,
  type SeriesInput,
  type SeriesUnit,
} from '@/app/(routes)/meetings/series/actions';
import {
  createBlockedPeriod,
  deleteBlockedPeriod,
  listBlockedPeriods,
  listRotationOrder,
  saveRotationOrder,
  setBlockedPeriodActive,
} from '@/app/(routes)/meetings/series/rules/actions';

// ── fixtures ─────────────────────────────────────────────────────────────────

const DIRECTOR = 'director-1';
const EAO = 'eao-1';

/** A realistic monthly IQAC series, valid on every constraint. */
function validInput(over: Partial<SeriesInput> = {}): SeriesInput {
  return {
    name: 'IQAC Monthly Review',
    description: 'Internal quality assurance cell, all colleges.',
    cadence: 'monthly',
    preferredWeekday: 3,
    preferredStartMinute: 630, // 10:30
    durationMin: 90,
    mayBeOnline: true,
    coverageMode: 'all_institutions',
    priority: 100,
    ...over,
  };
}

function seed() {
  store = {
    meeting_recurring_series: [],
    meeting_recurring_series_units: [],
    meeting_recurring_series_attendees: [],
    meeting_blocked_periods: [],
    meeting_rotation_order: [],
    profiles: [
      { id: DIRECTOR, full_name: 'The Director', email: 'director@jkkn.ac.in' },
      { id: EAO, full_name: 'The EAO', email: 'eao@jkkn.ac.in' },
      { id: 'principal-1', full_name: 'Principal One', email: 'p1@jkkn.ac.in' },
      { id: 'principal-2', full_name: 'Principal Two', email: 'p2@jkkn.ac.in' },
    ],
    institutions: [
      { id: 'inst-dental', name: 'JKKN Dental College', display_name: null, is_active: true },
      { id: 'inst-eng', name: 'JKKN Engineering', display_name: 'Engineering', is_active: true },
      { id: 'inst-arts', name: 'Arts & Science', display_name: null, is_active: true },
      { id: 'inst-closed', name: 'Closed College', display_name: null, is_active: false },
    ],
  };
}

/** The rows a table actually holds, for read-back assertions. */
function rowsIn(table: string): Row[] {
  return store[table] ?? [];
}

/** Every payload the actions handed a given table+op, in order. */
function writesTo(table: string, op: Op): Array<Row | Row[]> {
  return recorded.filter((r) => r.table === table && r.op === op).map((r) => r.payload);
}

beforeEach(() => {
  seq = 0;
  currentUser = EAO;
  failures = [];
  recorded = [];
  seed();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. CREATING A SERIES — the row that actually reaches the database
// ═══════════════════════════════════════════════════════════════════════════

describe('createSeries — what is written', () => {
  it('sends exactly the column set the table expects, and nothing else', async () => {
    const res = await createSeries(validInput());
    expect(res.success).toBe(true);

    // toStrictEqual, not toEqual: a dropped key must fail, not pass as
    // "undefined equals absent".
    expect(writesTo('meeting_recurring_series', 'insert')[0]).toStrictEqual({
      name: 'IQAC Monthly Review',
      description: 'Internal quality assurance cell, all colleges.',
      host_profile_id: EAO,
      institution_id: null,
      cadence: 'monthly',
      preferred_weekday: 3,
      preferred_start_minute: 630,
      duration_min: 90,
      may_be_online: true,
      coverage_mode: 'all_institutions',
      priority: 100,
      is_active: true,
      created_by: EAO,
    });
  });

  it('returns the new id so the caller can attach coverage and people to it', async () => {
    const res = await createSeries(validInput());
    expect(res.data?.id).toBe(rowsIn('meeting_recurring_series')[0].id);
  });

  it('defaults the host to whoever is signed in', async () => {
    const res = await createSeries(validInput());
    expect(res.success).toBe(true);
    expect(rowsIn('meeting_recurring_series')[0].host_profile_id).toBe(EAO);
  });

  it("places the series on the DIRECTOR's calendar when the EAO names him", async () => {
    // The real shape of this feature: the EAO configures, the Director hosts.
    await createSeries(validInput({ hostProfileId: DIRECTOR }));
    const row = rowsIn('meeting_recurring_series')[0];
    expect(row.host_profile_id).toBe(DIRECTOR);
    // created_by still records who actually did it — the audit trail must not
    // credit the Director for the EAO's action.
    expect(row.created_by).toBe(EAO);
  });

  it('writes may_be_online FALSE rather than dropping the key', async () => {
    // Load-bearing. The column DEFAULTs to true, so a payload that omitted the
    // key would silently flip "this one cannot be held online" to "it can".
    await createSeries(validInput({ mayBeOnline: false }));
    const payload = writesTo('meeting_recurring_series', 'insert')[0] as Row;
    expect(Object.prototype.hasOwnProperty.call(payload, 'may_be_online')).toBe(true);
    expect(payload.may_be_online).toBe(false);
    expect(rowsIn('meeting_recurring_series')[0].may_be_online).toBe(false);
  });

  it('would have FAILED on a variant that omitted may_be_online', () => {
    // Proves the assertion above discriminates rather than agreeing with
    // anything: the broken payload has no such key, so the column default wins.
    const broken: Row = { name: 'x', cadence: 'monthly' };
    expect(Object.prototype.hasOwnProperty.call(broken, 'may_be_online')).toBe(false);
  });

  it('trims the name and turns a blank description into null', async () => {
    await createSeries(validInput({ name: '   Weekly Review   ', description: '   ' }));
    const payload = writesTo('meeting_recurring_series', 'insert')[0] as Row;
    expect(payload.name).toBe('Weekly Review');
    expect(payload.description).toBeNull();
  });

  it('sends null — not undefined — for an unset preferred day and time', async () => {
    // undefined would be dropped in transit and read as "column not supplied".
    // Here both columns are nullable with no default, so the stored value is
    // the same either way — but the payload must still say what it means.
    await createSeries(
      validInput({ preferredWeekday: undefined, preferredStartMinute: undefined }),
    );
    const payload = writesTo('meeting_recurring_series', 'insert')[0] as Row;
    expect(payload.preferred_weekday).toBeNull();
    expect(payload.preferred_start_minute).toBeNull();
  });

  it('is active unless the EAO says otherwise', async () => {
    await createSeries(validInput());
    expect((writesTo('meeting_recurring_series', 'insert')[0] as Row).is_active).toBe(true);

    recorded = [];
    await createSeries(validInput({ name: 'Paused Series', isActive: false }));
    expect((writesTo('meeting_recurring_series', 'insert')[0] as Row).is_active).toBe(false);
  });

  it('records a college-owned series against that college', async () => {
    await createSeries(validInput({ institutionId: 'inst-dental' }));
    expect((writesTo('meeting_recurring_series', 'insert')[0] as Row).institution_id).toBe(
      'inst-dental',
    );
  });

  it("treats an empty institution as cluster-wide, which is the Director's own case", async () => {
    await createSeries(validInput({ institutionId: '' }));
    expect((writesTo('meeting_recurring_series', 'insert')[0] as Row).institution_id).toBeNull();
  });

  it('writes each of the four cadences the Director chose', async () => {
    for (const cadence of ['weekly', 'fortnightly', 'monthly', 'twice_monthly'] as const) {
      await createSeries(validInput({ name: `Series ${cadence}`, cadence }));
    }
    expect(rowsIn('meeting_recurring_series').map((r) => r.cadence)).toEqual([
      'weekly',
      'fortnightly',
      'monthly',
      'twice_monthly',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CREATING A SERIES — validation, and that a rejection writes NOTHING
// ═══════════════════════════════════════════════════════════════════════════

describe('createSeries — refuses a payload before it reaches the table', () => {
  async function expectRejected(input: SeriesInput, message: string) {
    const res = await createSeries(input);
    expect(res.success).toBe(false);
    expect(res.error).toBe(message);
    // The half of this that matters: nothing was written on the way to the
    // refusal. A validate() that ran after the insert would fail here.
    expect(writesTo('meeting_recurring_series', 'insert')).toHaveLength(0);
    expect(rowsIn('meeting_recurring_series')).toHaveLength(0);
  }

  it('a nameless series is refused in plain English', async () => {
    await expectRejected(validInput({ name: '' }), 'Give the series a name.');
  });

  it('a whitespace-only name is a blank name', async () => {
    await expectRejected(validInput({ name: '    ' }), 'Give the series a name.');
  });

  it('a cadence outside the four is refused', async () => {
    await expectRejected(
      validInput({ cadence: 'daily' as unknown as SeriesInput['cadence'] }),
      'Pick how often the series repeats.',
    );
  });

  it('a missing cadence is refused', async () => {
    await expectRejected(
      validInput({ cadence: undefined as unknown as SeriesInput['cadence'] }),
      'Pick how often the series repeats.',
    );
  });

  // Both sides of the coverage-mode branch. The failing side first:
  it('an unknown coverage mode is refused', async () => {
    await expectRejected(
      validInput({ coverageMode: 'some_colleges' as unknown as SeriesInput['coverageMode'] }),
      'Pick which units the series covers.',
    );
  });

  it('all_institutions is accepted and stored', async () => {
    const res = await createSeries(validInput({ coverageMode: 'all_institutions' }));
    expect(res.success).toBe(true);
    expect(rowsIn('meeting_recurring_series')[0].coverage_mode).toBe('all_institutions');
  });

  it('listed_only is accepted and stored', async () => {
    const res = await createSeries(validInput({ coverageMode: 'listed_only' }));
    expect(res.success).toBe(true);
    expect(rowsIn('meeting_recurring_series')[0].coverage_mode).toBe('listed_only');
  });

  it('a duration shorter than 5 minutes or longer than a day is refused', async () => {
    await expectRejected(
      validInput({ durationMin: 4 }),
      'Duration must be between 5 minutes and 24 hours.',
    );
    recorded = [];
    await expectRejected(
      validInput({ durationMin: 1441 }),
      'Duration must be between 5 minutes and 24 hours.',
    );
  });

  it('accepts the exact boundaries — 5 minutes and 24 hours', async () => {
    expect((await createSeries(validInput({ name: 'Five', durationMin: 5 }))).success).toBe(true);
    expect((await createSeries(validInput({ name: 'Day', durationMin: 1440 }))).success).toBe(
      true,
    );
  });

  it('a priority outside 1..1000 is refused', async () => {
    await expectRejected(
      validInput({ priority: 0 }),
      'Priority must be between 1 and 1000.',
    );
    recorded = [];
    await expectRejected(
      validInput({ priority: 1001 }),
      'Priority must be between 1 and 1000.',
    );
  });

  it('accepts priority 1 and priority 1000', async () => {
    expect((await createSeries(validInput({ name: 'First', priority: 1 }))).success).toBe(true);
    expect((await createSeries(validInput({ name: 'Last', priority: 1000 }))).success).toBe(true);
  });

  it('a weekday outside Sunday..Saturday is refused', async () => {
    await expectRejected(
      validInput({ preferredWeekday: 7 }),
      'Preferred day is not a valid weekday.',
    );
    recorded = [];
    await expectRejected(
      validInput({ preferredWeekday: -1 }),
      'Preferred day is not a valid weekday.',
    );
  });

  it('accepts Sunday (0) and Saturday (6), and "any day" as null', async () => {
    expect((await createSeries(validInput({ name: 'Sun', preferredWeekday: 0 }))).success).toBe(
      true,
    );
    expect((await createSeries(validInput({ name: 'Sat', preferredWeekday: 6 }))).success).toBe(
      true,
    );
    expect(
      (await createSeries(validInput({ name: 'Any', preferredWeekday: null }))).success,
    ).toBe(true);
  });

  it('a start minute past the end of the day is refused', async () => {
    await expectRejected(
      validInput({ preferredStartMinute: 1440 }),
      'Preferred time is not a valid time of day.',
    );
  });

  it('accepts midnight (0) and 23:59 (1439), and "no preference" as null', async () => {
    expect(
      (await createSeries(validInput({ name: 'Midnight', preferredStartMinute: 0 }))).success,
    ).toBe(true);
    expect(
      (await createSeries(validInput({ name: 'Late', preferredStartMinute: 1439 }))).success,
    ).toBe(true);
    expect(
      (await createSeries(validInput({ name: 'None', preferredStartMinute: null }))).success,
    ).toBe(true);
  });

  it('refuses to create anything for a signed-out caller', async () => {
    currentUser = null;
    const res = await createSeries(validInput());
    expect(res).toEqual({ success: false, error: 'You are not signed in.' });
    expect(rowsIn('meeting_recurring_series')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CREATING A SERIES — a database refusal must not read as success
// ═══════════════════════════════════════════════════════════════════════════

describe('createSeries — a refusal from the database surfaces', () => {
  it('a duplicate series name for the same host is reported, not swallowed', async () => {
    expect((await createSeries(validInput())).success).toBe(true);
    const second = await createSeries(validInput());
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/unique constraint/);
    expect(rowsIn('meeting_recurring_series')).toHaveLength(1);
  });

  it('the SAME name on a DIFFERENT host is allowed — the constraint is per host', async () => {
    expect((await createSeries(validInput())).success).toBe(true);
    const other = await createSeries(validInput({ hostProfileId: DIRECTOR }));
    expect(other.success).toBe(true);
    expect(rowsIn('meeting_recurring_series')).toHaveLength(2);
  });

  it('any other insert error comes back as a structured failure', async () => {
    failOn('meeting_recurring_series', 'insert', 'permission denied for table');
    const res = await createSeries(validInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied for table');
    expect(res.data).toBeUndefined();
  });

  it('a thrown error becomes a failure result rather than an unhandled rejection', async () => {
    const server = await import('@/lib/supabase/server');
    const spy = vi
      .spyOn(server, 'createClient')
      .mockRejectedValueOnce(new Error('cookies() unavailable'));
    const res = await createSeries(validInput());
    expect(res.success).toBe(false);
    expect(res.error).toBe('cookies() unavailable');
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. EDITING AND DELETING A SERIES
// ═══════════════════════════════════════════════════════════════════════════

describe('updateSeries', () => {
  async function seedOne() {
    const res = await createSeries(validInput());
    recorded = [];
    return res.data!.id;
  }

  it('writes the same column set as create, minus created_by', async () => {
    const id = await seedOne();
    const res = await updateSeries(id, validInput({ name: 'IQAC Renamed', durationMin: 45 }));
    expect(res.success).toBe(true);

    const payload = writesTo('meeting_recurring_series', 'update')[0] as Row;
    expect(payload).toStrictEqual({
      name: 'IQAC Renamed',
      description: 'Internal quality assurance cell, all colleges.',
      host_profile_id: EAO,
      institution_id: null,
      cadence: 'monthly',
      preferred_weekday: 3,
      preferred_start_minute: 630,
      duration_min: 45,
      may_be_online: true,
      coverage_mode: 'all_institutions',
      priority: 100,
      is_active: true,
    });
    // An update that also wrote created_by would rewrite who created the row.
    expect(Object.prototype.hasOwnProperty.call(payload, 'created_by')).toBe(false);
  });

  it('actually changes the stored row', async () => {
    const id = await seedOne();
    await updateSeries(id, validInput({ name: 'IQAC Renamed', cadence: 'weekly' }));
    const row = rowsIn('meeting_recurring_series').find((r) => r.id === id)!;
    expect(row.name).toBe('IQAC Renamed');
    expect(row.cadence).toBe('weekly');
  });

  it('touches only the series named, never its siblings', async () => {
    const id = await seedOne();
    await createSeries(validInput({ name: 'Other Series' }));
    await updateSeries(id, validInput({ name: 'Edited' }));
    const other = rowsIn('meeting_recurring_series').find((r) => r.name === 'Other Series');
    expect(other).toBeTruthy();
    expect(other!.cadence).toBe('monthly');
  });

  it('runs the same validation as create, and leaves the row alone when it fails', async () => {
    const id = await seedOne();
    const res = await updateSeries(id, validInput({ name: '  ' }));
    expect(res).toEqual({ success: false, error: 'Give the series a name.' });
    expect(writesTo('meeting_recurring_series', 'update')).toHaveLength(0);
    expect(rowsIn('meeting_recurring_series')[0].name).toBe('IQAC Monthly Review');
  });

  it('reports a database refusal instead of claiming the edit landed', async () => {
    const id = await seedOne();
    failOn('meeting_recurring_series', 'update', 'permission denied');
    const res = await updateSeries(id, validInput({ name: 'Edited' }));
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });

  it('refuses for a signed-out caller', async () => {
    const id = await seedOne();
    currentUser = null;
    const res = await updateSeries(id, validInput({ name: 'Edited' }));
    expect(res).toEqual({ success: false, error: 'You are not signed in.' });
    expect(writesTo('meeting_recurring_series', 'update')).toHaveLength(0);
  });

  it('DOCUMENTED BUG: an update that changed NOTHING still reports success', async () => {
    // PostgREST answers an UPDATE whose filter matched no row with 200/no error
    // and zero rows. An RLS policy that denies the row produces the IDENTICAL
    // response — mrs_update USING(...) is super-admin / admin / host / active
    // delegate / meetings.series.manage, so anyone outside that set editing a
    // series they can nonetheless SEE gets "Series updated." while the row is
    // untouched. The action never asks how many rows it changed.
    //
    // Reproduced here with a row id that does not exist, which is the same
    // zero-match shape. NOT FIXED HERE: adding .select() and checking the count
    // is a behaviour change and belongs in its own pull request.
    await seedOne();
    const res = await updateSeries('no-such-series', validInput({ name: 'Ghost Edit' }));

    expect(res.success).toBe(true); // <- what it does today
    expect(res.data).toEqual({ id: 'no-such-series' });
    expect(rowsIn('meeting_recurring_series').some((r) => r.name === 'Ghost Edit')).toBe(false);
  });
});

describe('deleteSeries', () => {
  it('removes the series it names and no other', async () => {
    const first = await createSeries(validInput());
    await createSeries(validInput({ name: 'Keep Me' }));
    const res = await deleteSeries(first.data!.id);
    expect(res).toEqual({ success: true, data: null });
    expect(rowsIn('meeting_recurring_series').map((r) => r.name)).toEqual(['Keep Me']);
  });

  it('reports a database refusal', async () => {
    const first = await createSeries(validInput());
    failOn('meeting_recurring_series', 'delete', 'permission denied');
    const res = await deleteSeries(first.data!.id);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });

  it('DOCUMENTED BUG: deleting something that was not there reports success', async () => {
    // Same zero-match shape as the update case, and the same consequence: an
    // RLS-denied delete shows the EAO a "deleted" toast while the series stays.
    const res = await deleteSeries('no-such-series');
    expect(res).toEqual({ success: true, data: null });
  });

  it('CHARACTERISATION: delete does not check for a signed-in user at all', async () => {
    // Deliberate in the source — the comment says the migration's policy is the
    // access answer and no check is duplicated in the action. Pinned so that if
    // that reasoning ever changes, this test says so out loud rather than the
    // behaviour drifting quietly. RLS still refuses an anonymous caller in
    // production; this only records that the ACTION does not.
    const first = await createSeries(validInput());
    currentUser = null;
    const res = await deleteSeries(first.data!.id);
    expect(res.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. COVERAGE — which colleges the series runs for
// ═══════════════════════════════════════════════════════════════════════════

describe('setSeriesUnits', () => {
  let seriesId: string;

  beforeEach(async () => {
    seriesId = (await createSeries(validInput())).data!.id;
    recorded = [];
  });

  it('writes one row per college, in the column shape the table expects', async () => {
    const res = await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: '  no IQAC here  ' },
      { institutionId: 'inst-eng', isExcluded: false, exclusionReason: null },
    ]);
    expect(res).toEqual({ success: true, data: null });

    expect(writesTo('meeting_recurring_series_units', 'insert')[0]).toStrictEqual([
      {
        series_id: seriesId,
        institution_id: 'inst-dental',
        is_excluded: true,
        exclusion_reason: 'no IQAC here',
      },
      {
        series_id: seriesId,
        institution_id: 'inst-eng',
        is_excluded: false,
        exclusion_reason: null,
      },
    ]);
  });

  it('turns a blank exclusion reason into null rather than an empty string', async () => {
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: '   ' },
    ]);
    expect(rowsIn('meeting_recurring_series_units')[0].exclusion_reason).toBeNull();
  });

  it('replaces the previous coverage instead of appending to it', async () => {
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: null },
    ]);
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-eng', isExcluded: true, exclusionReason: null },
    ]);
    expect(rowsIn('meeting_recurring_series_units').map((r) => r.institution_id)).toEqual([
      'inst-eng',
    ]);
  });

  it("replaces only THIS series' coverage, never a sibling's", async () => {
    // The discriminating test for the .eq('series_id', ...) filter on the
    // delete. Drop that filter and every other series loses its exceptions.
    const other = (await createSeries(validInput({ name: 'Other Series' }))).data!.id;
    await setSeriesUnits(other, [
      { institutionId: 'inst-arts', isExcluded: true, exclusionReason: 'closed that week' },
    ]);
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: null },
    ]);

    const otherRows = rowsIn('meeting_recurring_series_units').filter(
      (r) => r.series_id === other,
    );
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].institution_id).toBe('inst-arts');
  });

  it('keeps the first mention of a college named twice', async () => {
    // The table's UNIQUE (series_id, institution_id) would reject the second
    // row outright, so de-duplicating in the action is what stops a double-click
    // in the picker becoming an error the EAO cannot explain.
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: 'first' },
      { institutionId: 'inst-dental', isExcluded: false, exclusionReason: 'second' },
    ]);
    const rows = rowsIn('meeting_recurring_series_units');
    expect(rows).toHaveLength(1);
    expect(rows[0].exclusion_reason).toBe('first');
  });

  it('drops a row with no college rather than sending a null institution_id', async () => {
    await setSeriesUnits(seriesId, [
      { institutionId: '', isExcluded: true, exclusionReason: null },
      { institutionId: 'inst-eng', isExcluded: true, exclusionReason: null },
    ]);
    expect(rowsIn('meeting_recurring_series_units').map((r) => r.institution_id)).toEqual([
      'inst-eng',
    ]);
  });

  it('an empty coverage list clears the rows and inserts nothing', async () => {
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: null },
    ]);
    recorded = [];
    const res = await setSeriesUnits(seriesId, []);
    expect(res.success).toBe(true);
    expect(rowsIn('meeting_recurring_series_units')).toHaveLength(0);
    expect(writesTo('meeting_recurring_series_units', 'insert')).toHaveLength(0);
  });

  it('reports a failed delete without going on to insert', async () => {
    failOn('meeting_recurring_series_units', 'delete', 'permission denied');
    const res = await setSeriesUnits(seriesId, [
      { institutionId: 'inst-eng', isExcluded: true, exclusionReason: null },
    ]);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
    expect(writesTo('meeting_recurring_series_units', 'insert')).toHaveLength(0);
  });

  it('DOCUMENTED BUG: a failed insert leaves the coverage list EMPTY, not intact', async () => {
    // Delete-then-insert with no transaction. The delete has already committed
    // when the insert fails, so the exceptions the EAO had recorded are gone and
    // the series now silently covers every college. The action correctly returns
    // a failure — but the caller (series-manager.tsx) shows that error AND then
    // shows "Series updated." and closes the dialog, so the loss is invisible.
    //
    // NOT FIXED HERE: the repair is an RPC that replaces the set in one
    // statement, which is a behaviour change for its own pull request.
    await setSeriesUnits(seriesId, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: 'agreed exception' },
    ]);
    expect(rowsIn('meeting_recurring_series_units')).toHaveLength(1);

    failOn('meeting_recurring_series_units', 'insert', 'deadlock detected');
    const res = await setSeriesUnits(seriesId, [
      { institutionId: 'inst-eng', isExcluded: true, exclusionReason: null },
    ]);

    expect(res.success).toBe(false);
    expect(rowsIn('meeting_recurring_series_units')).toHaveLength(0); // <- the loss
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. REQUIRED ATTENDEES — each series carries its own list
// ═══════════════════════════════════════════════════════════════════════════

describe('setSeriesAttendees', () => {
  let seriesId: string;

  beforeEach(async () => {
    seriesId = (await createSeries(validInput({ hostProfileId: DIRECTOR }))).data!.id;
    recorded = [];
  });

  it('writes one row per person in the column shape the table expects', async () => {
    const res = await setSeriesAttendees(seriesId, [
      { profileId: 'principal-1', isRequired: true },
      { profileId: 'principal-2', isRequired: false },
    ]);
    expect(res).toEqual({ success: true, data: null });

    expect(writesTo('meeting_recurring_series_attendees', 'insert')[0]).toStrictEqual([
      { series_id: seriesId, profile_id: 'principal-1', is_required: true },
      { series_id: seriesId, profile_id: 'principal-2', is_required: false },
    ]);
  });

  it('an optional attendee stays optional — false is written, not defaulted away', async () => {
    // is_required DEFAULTs to true in the table, so dropping the key would turn
    // "invited, does not veto a slot" into "must be free", and the engine would
    // refuse slots it should have allowed.
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-2', isRequired: false }]);
    expect(rowsIn('meeting_recurring_series_attendees')[0].is_required).toBe(false);
  });

  it('an unstated preference means required', async () => {
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-1' }] as unknown as Array<{
      profileId: string;
      isRequired: boolean;
    }>);
    expect(rowsIn('meeting_recurring_series_attendees')[0].is_required).toBe(true);
  });

  it('keeps the first mention of a person named twice', async () => {
    await setSeriesAttendees(seriesId, [
      { profileId: 'principal-1', isRequired: true },
      { profileId: 'principal-1', isRequired: false },
    ]);
    const rows = rowsIn('meeting_recurring_series_attendees');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_required).toBe(true);
  });

  it('drops an entry with no person', async () => {
    await setSeriesAttendees(seriesId, [
      { profileId: '', isRequired: true },
      { profileId: 'principal-2', isRequired: true },
    ]);
    expect(rowsIn('meeting_recurring_series_attendees').map((r) => r.profile_id)).toEqual([
      'principal-2',
    ]);
  });

  it('replaces the previous list rather than appending', async () => {
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-1', isRequired: true }]);
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-2', isRequired: true }]);
    expect(rowsIn('meeting_recurring_series_attendees').map((r) => r.profile_id)).toEqual([
      'principal-2',
    ]);
  });

  it("does not disturb another series' people", async () => {
    const other = (await createSeries(validInput({ name: 'Other Series' }))).data!.id;
    await setSeriesAttendees(other, [{ profileId: 'principal-1', isRequired: true }]);
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-2', isRequired: true }]);

    const otherRows = rowsIn('meeting_recurring_series_attendees').filter(
      (r) => r.series_id === other,
    );
    expect(otherRows.map((r) => r.profile_id)).toEqual(['principal-1']);
  });

  it('reports a failed delete without inserting', async () => {
    failOn('meeting_recurring_series_attendees', 'delete', 'permission denied');
    const res = await setSeriesAttendees(seriesId, [
      { profileId: 'principal-1', isRequired: true },
    ]);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
    expect(writesTo('meeting_recurring_series_attendees', 'insert')).toHaveLength(0);
  });

  it('DOCUMENTED BUG: a failed insert leaves the people list EMPTY', async () => {
    // Same non-atomic delete-then-insert as coverage. Worse consequence: the
    // series now records that NOBODY must be free, so the proposal engine
    // (piece 3) would place it over any principal's calendar.
    await setSeriesAttendees(seriesId, [{ profileId: 'principal-1', isRequired: true }]);
    expect(rowsIn('meeting_recurring_series_attendees')).toHaveLength(1);

    failOn('meeting_recurring_series_attendees', 'insert', 'deadlock detected');
    const res = await setSeriesAttendees(seriesId, [
      { profileId: 'principal-2', isRequired: true },
    ]);

    expect(res.success).toBe(false);
    expect(rowsIn('meeting_recurring_series_attendees')).toHaveLength(0); // <- the loss
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. THE ROUND TRIP — written here, read back against the right series
// ═══════════════════════════════════════════════════════════════════════════

describe('the whole save, read back', () => {
  it('coverage and people come back attached to the series that owns them', async () => {
    const iqac = (await createSeries(validInput({ hostProfileId: DIRECTOR }))).data!.id;
    await setSeriesUnits(iqac, [
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: 'runs its own' },
    ]);
    await setSeriesAttendees(iqac, [{ profileId: 'principal-1', isRequired: true }]);

    const weekly = (
      await createSeries(
        validInput({ name: 'Weekly Team Review', cadence: 'weekly', priority: 50 }),
      )
    ).data!.id;
    await setSeriesUnits(weekly, [
      { institutionId: 'inst-eng', isExcluded: false, exclusionReason: null },
    ]);
    await setSeriesAttendees(weekly, [{ profileId: 'principal-2', isRequired: false }]);

    const res = await listSeries();
    expect(res.success).toBe(true);

    // Ordered by priority, so the weekly series (50) comes before IQAC (100).
    const [first, second] = res.data!;
    expect(first.id).toBe(weekly);
    expect(second.id).toBe(iqac);

    expect(first.units).toEqual([
      { institutionId: 'inst-eng', isExcluded: false, exclusionReason: null },
    ]);
    expect(first.attendees).toEqual([
      {
        profileId: 'principal-2',
        name: 'Principal Two',
        email: 'p2@jkkn.ac.in',
        isRequired: false,
      },
    ]);

    expect(second.units).toEqual([
      { institutionId: 'inst-dental', isExcluded: true, exclusionReason: 'runs its own' },
    ]);
    expect(second.attendees.map((a) => a.profileId)).toEqual(['principal-1']);
    expect(second.hostName).toBe('The Director');
  });

  it('every field the form set survives the round trip', async () => {
    const id = (
      await createSeries(
        validInput({
          name: 'Fortnightly Ops',
          cadence: 'fortnightly',
          preferredWeekday: 5,
          preferredStartMinute: 900,
          durationMin: 30,
          mayBeOnline: false,
          coverageMode: 'listed_only',
          priority: 7,
          institutionId: 'inst-eng',
        }),
      )
    ).data!.id;

    const found = (await listSeries()).data!.find((s) => s.id === id)!;
    expect(found).toMatchObject({
      name: 'Fortnightly Ops',
      cadence: 'fortnightly',
      preferredWeekday: 5,
      preferredStartMinute: 900,
      durationMin: 30,
      mayBeOnline: false,
      coverageMode: 'listed_only',
      priority: 7,
      institutionId: 'inst-eng',
      isActive: true,
    });
  });

  it('a series with no coverage and no people reads back as empty, not as an error', async () => {
    await createSeries(validInput());
    const res = await listSeries();
    expect(res.success).toBe(true);
    expect(res.data![0].units).toEqual([]);
    expect(res.data![0].attendees).toEqual([]);
  });

  it('DOCUMENTED BUG: a failed profiles read degrades silently to success', async () => {
    // listSeries checks unitsRes.error and attendeesRes.error but NOT
    // hostsRes.error, and the follow-up attendee-profiles query destructures
    // only { data }. So when the profiles read fails, every series comes back
    // with hostName null and every named attendee as "Unknown" — reported as
    // success:true. The EAO sees a screen that looks like nobody is configured.
    //
    // NOT FIXED HERE: returning a failure changes what the screen renders.
    const id = (await createSeries(validInput({ hostProfileId: DIRECTOR }))).data!.id;
    await setSeriesAttendees(id, [{ profileId: 'principal-1', isRequired: true }]);

    failOn('profiles', 'select', 'permission denied for table profiles');
    const res = await listSeries();

    expect(res.success).toBe(true); // <- what it does today
    expect(res.data![0].hostName).toBeNull();
    expect(res.data![0].attendees[0].name).toBe('Unknown');
    expect(res.data![0].attendees[0].email).toBeNull();
  });

  it('a failed coverage read IS reported — the check that is present works', async () => {
    // The contrast that proves the finding above is a missing check rather than
    // a deliberate policy: the very next query in the same Promise.all does
    // surface its error.
    await createSeries(validInput());
    failOn('meeting_recurring_series_units', 'select', 'permission denied');
    const res = await listSeries();
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });

  it('the college picker offers active colleges only, display name first', async () => {
    const res = await listInstitutionOptions();
    expect(res.success).toBe(true);
    expect(res.data).toEqual([
      { id: 'inst-arts', name: 'Arts & Science' },
      { id: 'inst-dental', name: 'JKKN Dental College' },
      { id: 'inst-eng', name: 'Engineering' }, // display_name wins over name
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. BLOCKED PERIODS — holidays and festivals, added and removed
// ═══════════════════════════════════════════════════════════════════════════

describe('createBlockedPeriod', () => {
  it('writes the row shape the table expects', async () => {
    const res = await createBlockedPeriod({
      name: '  Pongal  ',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-17',
      notes: '  four days  ',
    });
    expect(res.success).toBe(true);

    expect(writesTo('meeting_blocked_periods', 'insert')[0]).toStrictEqual({
      name: 'Pongal',
      block_kind: 'festival',
      starts_on: '2027-01-14',
      ends_on: '2027-01-17',
      institution_id: null, // null = blocks every college
      notes: 'four days',
      created_by: EAO,
    });
  });

  it('a period scoped to one college records that college', async () => {
    await createBlockedPeriod({
      name: 'Local holiday',
      blockKind: 'public_holiday',
      startsOn: '2027-03-01',
      endsOn: '2027-03-01',
      institutionId: 'inst-dental',
    });
    expect(rowsIn('meeting_blocked_periods')[0].institution_id).toBe('inst-dental');
  });

  it('a one-day period is allowed — the end may equal the start', async () => {
    const res = await createBlockedPeriod({
      name: 'Republic Day',
      blockKind: 'public_holiday',
      startsOn: '2027-01-26',
      endsOn: '2027-01-26',
    });
    expect(res.success).toBe(true);
  });

  it('refuses a nameless period and writes nothing', async () => {
    const res = await createBlockedPeriod({
      name: '   ',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-14',
    });
    expect(res).toEqual({ success: false, error: 'Give it a name.' });
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(0);
  });

  it('refuses "travel" as a block kind — travel turns a meeting online instead', async () => {
    // The Director's decision, enforced at the write path rather than only in
    // the dropdown. A hand-built POST naming 'travel' must not land.
    const res = await createBlockedPeriod({
      name: 'Director travelling',
      blockKind: 'travel' as never,
      startsOn: '2027-02-01',
      endsOn: '2027-02-05',
    });
    expect(res).toEqual({
      success: false,
      error: 'Pick whether this is a public holiday or a festival.',
    });
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(0);
  });

  it('accepts both kinds that ARE allowed', async () => {
    expect(
      (
        await createBlockedPeriod({
          name: 'Independence Day',
          blockKind: 'public_holiday',
          startsOn: '2027-08-15',
          endsOn: '2027-08-15',
        })
      ).success,
    ).toBe(true);
    expect(
      (
        await createBlockedPeriod({
          name: 'Deepavali',
          blockKind: 'festival',
          startsOn: '2027-11-05',
          endsOn: '2027-11-06',
        })
      ).success,
    ).toBe(true);
  });

  it('refuses a date that is not a plain ISO date', async () => {
    for (const bad of ['14-01-2027', '2027-1-14', '2027-01-14T00:00:00Z', '']) {
      const res = await createBlockedPeriod({
        name: 'Pongal',
        blockKind: 'festival',
        startsOn: bad,
        endsOn: '2027-01-17',
      });
      expect(res).toEqual({ success: false, error: 'Pick a start and an end date.' });
    }
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(0);
  });

  it('refuses a period that ends before it starts', async () => {
    const res = await createBlockedPeriod({
      name: 'Backwards',
      blockKind: 'festival',
      startsOn: '2027-01-17',
      endsOn: '2027-01-14',
    });
    expect(res).toEqual({
      success: false,
      error: 'The end date cannot be before the start date.',
    });
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(0);
  });

  it('refuses a signed-out caller', async () => {
    currentUser = null;
    const res = await createBlockedPeriod({
      name: 'Pongal',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-17',
    });
    expect(res).toEqual({ success: false, error: 'You are not signed in.' });
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(0);
  });

  it('reports a database refusal instead of a new id', async () => {
    failOn('meeting_blocked_periods', 'insert', 'permission denied');
    const res = await createBlockedPeriod({
      name: 'Pongal',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-17',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });
});

describe('blocked periods — turning one off and removing it', () => {
  async function seedPeriods() {
    await createBlockedPeriod({
      name: 'Pongal',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-17',
    });
    await createBlockedPeriod({
      name: 'Republic Day',
      blockKind: 'public_holiday',
      startsOn: '2027-01-26',
      endsOn: '2027-01-26',
    });
    return (await listBlockedPeriods()).data!;
  }

  it('lists periods oldest first, with the fields the screen renders', async () => {
    const periods = await seedPeriods();
    expect(periods.map((p) => p.name)).toEqual(['Pongal', 'Republic Day']);
    expect(periods[0]).toEqual({
      id: rowsIn('meeting_blocked_periods')[0].id,
      name: 'Pongal',
      blockKind: 'festival',
      startsOn: '2027-01-14',
      endsOn: '2027-01-17',
      institutionId: null,
      isActive: true,
      notes: null,
    });
  });

  it('switching a period off writes only is_active', async () => {
    const [pongal] = await seedPeriods();
    recorded = [];
    const res = await setBlockedPeriodActive(pongal.id, false);
    expect(res).toEqual({ success: true, data: null });
    expect(writesTo('meeting_blocked_periods', 'update')[0]).toStrictEqual({ is_active: false });

    const after = (await listBlockedPeriods()).data!;
    expect(after.find((p) => p.id === pongal.id)!.isActive).toBe(false);
    expect(after.find((p) => p.name === 'Republic Day')!.isActive).toBe(true);
  });

  it('switching it back on works too', async () => {
    const [pongal] = await seedPeriods();
    await setBlockedPeriodActive(pongal.id, false);
    await setBlockedPeriodActive(pongal.id, true);
    expect(rowsIn('meeting_blocked_periods')[0].is_active).toBe(true);
  });

  it('removing a period removes exactly one', async () => {
    const [pongal] = await seedPeriods();
    const res = await deleteBlockedPeriod(pongal.id);
    expect(res).toEqual({ success: true, data: null });
    expect(rowsIn('meeting_blocked_periods').map((r) => r.name)).toEqual(['Republic Day']);
  });

  it('reports a refused delete', async () => {
    const [pongal] = await seedPeriods();
    failOn('meeting_blocked_periods', 'delete', 'permission denied');
    const res = await deleteBlockedPeriod(pongal.id);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(2);
  });

  it('reports a refused update', async () => {
    const [pongal] = await seedPeriods();
    failOn('meeting_blocked_periods', 'update', 'permission denied');
    const res = await setBlockedPeriodActive(pongal.id, false);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });

  it('DOCUMENTED BUG: toggling or removing a period that matched nothing reports success', async () => {
    // Third instance of the same zero-match shape as updateSeries/deleteSeries.
    await seedPeriods();
    expect(await setBlockedPeriodActive('no-such-period', false)).toEqual({
      success: true,
      data: null,
    });
    expect(await deleteBlockedPeriod('no-such-period')).toEqual({ success: true, data: null });
    expect(rowsIn('meeting_blocked_periods')).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. ROTATION ORDER — the order must round-trip in the order given
// ═══════════════════════════════════════════════════════════════════════════

describe('saveRotationOrder', () => {
  const ORDER = ['inst-eng', 'inst-dental', 'inst-arts'];

  it('numbers the colleges 0..n-1 in the order submitted', async () => {
    const res = await saveRotationOrder(ORDER);
    expect(res).toEqual({ success: true, data: null });

    expect(writesTo('meeting_rotation_order', 'insert')[0]).toStrictEqual([
      { institution_id: 'inst-eng', position: 0, created_by: EAO },
      { institution_id: 'inst-dental', position: 1, created_by: EAO },
      { institution_id: 'inst-arts', position: 2, created_by: EAO },
    ]);
  });

  it('reads back in the order given, not in any other order', async () => {
    await saveRotationOrder(ORDER);
    const res = await listRotationOrder();
    expect(res.success).toBe(true);
    expect(res.data!.map((e) => e.institutionId)).toEqual(ORDER);
    expect(res.data!.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('would have FAILED if the order had been sorted instead of preserved', () => {
    // The discrimination check for the assertion above: alphabetical order of
    // these ids differs from the submitted order, so "it round-trips" is a real
    // claim rather than an accident of the fixture.
    expect([...ORDER].sort()).not.toEqual(ORDER);
  });

  it('a reorder replaces the whole order rather than layering a second one', async () => {
    await saveRotationOrder(ORDER);
    const reversed = [...ORDER].reverse();
    await saveRotationOrder(reversed);

    expect(rowsIn('meeting_rotation_order')).toHaveLength(3);
    const read = (await listRotationOrder()).data!;
    expect(read.map((e) => e.institutionId)).toEqual(reversed);
    expect(read.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('de-duplicates and re-numbers contiguously, leaving no gap', async () => {
    // Positions are recomputed from the surviving sequence, so a duplicate does
    // not leave a hole at position 1. UNIQUE (institution_id) would reject the
    // repeat outright, so the de-duplication is what keeps the save working.
    await saveRotationOrder(['inst-eng', 'inst-eng', 'inst-dental']);
    const read = (await listRotationOrder()).data!;
    expect(read.map((e) => e.institutionId)).toEqual(['inst-eng', 'inst-dental']);
    expect(read.map((e) => e.position)).toEqual([0, 1]);
  });

  it('drops empty entries', async () => {
    await saveRotationOrder(['', 'inst-arts', '']);
    expect(rowsIn('meeting_rotation_order').map((r) => r.institution_id)).toEqual(['inst-arts']);
  });

  it('an empty order clears the table and inserts nothing', async () => {
    await saveRotationOrder(ORDER);
    recorded = [];
    const res = await saveRotationOrder([]);
    expect(res.success).toBe(true);
    expect(rowsIn('meeting_rotation_order')).toHaveLength(0);
    expect(writesTo('meeting_rotation_order', 'insert')).toHaveLength(0);
  });

  it('refuses a signed-out caller BEFORE deleting anything', async () => {
    // Order of operations matters here: the auth check sits above the delete,
    // so a signed-out request cannot wipe the order it was not allowed to set.
    await saveRotationOrder(ORDER);
    currentUser = null;

    const res = await saveRotationOrder(['inst-arts']);
    expect(res).toEqual({ success: false, error: 'You are not signed in.' });
    expect(rowsIn('meeting_rotation_order')).toHaveLength(3);
  });

  it('reports a failed delete without inserting', async () => {
    failOn('meeting_rotation_order', 'delete', 'permission denied');
    const res = await saveRotationOrder(ORDER);
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
    expect(writesTo('meeting_rotation_order', 'insert')).toHaveLength(0);
  });

  it('DOCUMENTED BUG: a failed insert wipes the ENTIRE rotation order', async () => {
    // The worst of the three non-atomic cases, because this delete carries no
    // filter at all — .not('id','is',null) matches every row in the table. The
    // order is global (one per institution, shared by every series), so a failed
    // insert leaves every series with no rotation rule and the screen showing an
    // empty list where an agreed order used to be.
    //
    // NOT FIXED HERE: replacing this with a single-statement RPC is a behaviour
    // change for its own pull request.
    await saveRotationOrder(ORDER);
    expect(rowsIn('meeting_rotation_order')).toHaveLength(3);

    failOn('meeting_rotation_order', 'insert', 'deadlock detected');
    const res = await saveRotationOrder(['inst-arts', 'inst-eng']);

    expect(res.success).toBe(false);
    expect(res.error).toBe('deadlock detected');
    expect(rowsIn('meeting_rotation_order')).toHaveLength(0); // <- the whole order, gone
    expect((await listRotationOrder()).data).toEqual([]);
  });

  it('an unset rotation order reads back as empty rather than failing', async () => {
    const res = await listRotationOrder();
    expect(res).toEqual({ success: true, data: [] });
  });

  it('reports a failed read', async () => {
    failOn('meeting_rotation_order', 'select', 'permission denied');
    const res = await listRotationOrder();
    expect(res.success).toBe(false);
    expect(res.error).toBe('permission denied');
  });
});
