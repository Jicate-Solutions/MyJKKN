/**
 * CDC drive attendance.
 *
 * Regression cover for the 2026-09-18 finding: `cdc_drive_attendance` was created
 * with the CDC substrate in May 2026 with a full, deliberate shape and had ZERO
 * rows and ZERO writers anywhere in the repository. Two drives ran on 17 September
 * (150 and 127 learners declared willing) and nobody could record who turned up.
 *
 * The load-bearing cases here are the CORRECTION ones: a mark that is changed after
 * it was first saved must not leave a stale arrival time or a stale absence reason
 * behind, because both of those are read as fact by anyone auditing the drive later.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildAttendanceUpsertRows,
  getDriveAttendanceRoster,
  isDeclinedWillingness,
  normaliseRoundNo,
  normaliseRoundType,
  saveDriveAttendance,
  summariseRoster,
  NOT_CDC_TEAM_MESSAGE,
  MAX_ROUND_NO,
} from '@/lib/services/cdc/attendance-service';

const DRIVE = 'drive-1';
const MARKER = 'profile-of-the-coordinator';
const NOW = new Date('2026-09-18T09:30:00.000Z');

describe('normaliseRoundNo', () => {
  it('defaults to round 1 when the caller says nothing', () => {
    // A coordinator opening the screen right after a drive has exactly one
    // round; making them pick a number before they can mark anything is the
    // kind of friction that leaves the table empty for another four months.
    expect(normaliseRoundNo(undefined)).toBe(1);
    expect(normaliseRoundNo(null)).toBe(1);
    expect(normaliseRoundNo('')).toBe(1);
  });

  it('accepts a numeric string from the query parameter', () => {
    expect(normaliseRoundNo('3')).toBe(3);
  });

  it('refuses anything the table CHECK would refuse, with a sentence', () => {
    // round_no integer NOT NULL CHECK (round_no BETWEEN 1 AND 10)
    expect(() => normaliseRoundNo(0)).toThrow(/between 1 and 10/i);
    expect(() => normaliseRoundNo(MAX_ROUND_NO + 1)).toThrow(/between 1 and 10/i);
    expect(() => normaliseRoundNo(2.5)).toThrow(/whole number/i);
    expect(() => normaliseRoundNo('later')).toThrow();
  });
});

describe('normaliseRoundType', () => {
  it('accepts every value the live cdc_drive_round_type enum has', () => {
    for (const t of [
      'pre_placement_talk',
      'technical',
      'aptitude',
      'group_discussion',
      'hr',
      'final',
    ]) {
      expect(normaliseRoundType(t)).toBe(t);
    }
  });

  it('refuses "interview" — types/cdc.ts carries it but the database enum does not', () => {
    // Non-vacuity control for the case above: if this ever passes, the guard is
    // accepting everything, and the drift documented in the service header would
    // reach the database as a 22P02 at write time instead of as a message here.
    expect(() => normaliseRoundType('interview')).toThrow(/must be one of/i);
  });

  it('treats an unset round type as null rather than an error', () => {
    expect(normaliseRoundType(null)).toBeNull();
    expect(normaliseRoundType('')).toBeNull();
    expect(normaliseRoundType(undefined)).toBeNull();
  });
});

describe('buildAttendanceUpsertRows', () => {
  it('stamps attended_at and clears the reason when a learner is present', () => {
    const [row] = buildAttendanceUpsertRows(
      DRIVE,
      { marks: [{ learner_id: 'l1', attended: true, no_show_reason: 'stale reason' }] },
      MARKER,
      NOW
    );
    expect(row.attended).toBe(true);
    expect(row.attended_at).toBe(NOW.toISOString());
    // The correction case: someone marked absent with a reason, then found in the
    // hall. Keeping the reason would leave the audit trail saying both.
    expect(row.no_show_reason).toBeNull();
  });

  it('clears attended_at and keeps the reason when a learner is absent', () => {
    const [row] = buildAttendanceUpsertRows(
      DRIVE,
      { marks: [{ learner_id: 'l1', attended: false, no_show_reason: '  went home  ' }] },
      MARKER,
      NOW
    );
    expect(row.attended).toBe(false);
    // The mirror correction: marked present by mistake, then corrected. A left-over
    // arrival time would read as "they were here at 09:30 and also absent".
    expect(row.attended_at).toBeNull();
    expect(row.no_show_reason).toBe('went home');
  });

  it('records an absence with no reason as null, not as an empty string', () => {
    const [row] = buildAttendanceUpsertRows(
      DRIVE,
      { marks: [{ learner_id: 'l1', attended: false, no_show_reason: '   ' }] },
      MARKER,
      NOW
    );
    expect(row.no_show_reason).toBeNull();
  });

  it('always stamps marked_by from the caller, never from the payload', () => {
    const rows = buildAttendanceUpsertRows(
      DRIVE,
      {
        marks: [
          { learner_id: 'l1', attended: true },
          { learner_id: 'l2', attended: false },
        ],
      } as never,
      MARKER,
      NOW
    );
    expect(rows.every((r) => r.marked_by === MARKER)).toBe(true);
  });

  it('collapses a learner sent twice to one row, last mark winning', () => {
    // Postgres refuses an ON CONFLICT batch that touches the same unique key
    // twice (21000, "cannot affect row a second time"), and the unique key here
    // is (drive_id, learner_id, round_no). A double-click on the screen must not
    // fail the whole save.
    const rows = buildAttendanceUpsertRows(
      DRIVE,
      {
        marks: [
          { learner_id: 'l1', attended: true },
          { learner_id: 'l1', attended: false, no_show_reason: 'corrected' },
        ],
      },
      MARKER,
      NOW
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].attended).toBe(false);
    expect(rows[0].no_show_reason).toBe('corrected');
  });

  it('carries the round number and type onto every row', () => {
    const rows = buildAttendanceUpsertRows(
      DRIVE,
      {
        round_no: 4,
        round_type: 'group_discussion',
        marks: [
          { learner_id: 'l1', attended: true },
          { learner_id: 'l2', attended: true },
        ],
      },
      MARKER,
      NOW
    );
    expect(rows.every((r) => r.round_no === 4 && r.round_type === 'group_discussion')).toBe(true);
  });

  it('refuses an empty save, a nameless mark and a missing verdict', () => {
    expect(() => buildAttendanceUpsertRows(DRIVE, { marks: [] }, MARKER, NOW)).toThrow(
      /at least one learner/i
    );
    expect(() =>
      buildAttendanceUpsertRows(DRIVE, { marks: [{ learner_id: '  ', attended: true }] }, MARKER, NOW)
    ).toThrow(/must name a learner/i);
    expect(() =>
      buildAttendanceUpsertRows(
        DRIVE,
        { marks: [{ learner_id: 'l1', attended: 'yes' as unknown as boolean }] },
        MARKER,
        NOW
      )
    ).toThrow(/attended/i);
  });

  it('refuses to write without a signed-in marker', () => {
    expect(() =>
      buildAttendanceUpsertRows(DRIVE, { marks: [{ learner_id: 'l1', attended: true }] }, '', NOW)
    ).toThrow(/signed-in/i);
  });
});

describe('summariseRoster', () => {
  it('counts an unmarked learner as unmarked, not as absent', () => {
    // The whole point of the screen is the difference between "we checked and
    // they were not there" and "nobody has got to them yet".
    const s = summariseRoster([
      { attended: true, declined: false },
      { attended: true, declined: false },
      { attended: false, declined: false },
      { attended: null, declined: false },
    ]);
    expect(s).toEqual({
      total: 4,
      marked: 3,
      unmarked: 1,
      present: 2,
      absent: 1,
      declined: 0,
      declined_present: 0,
    });
  });

  it('reports an untouched roster as entirely unmarked', () => {
    const s = summariseRoster([
      { attended: null, declined: false },
      { attended: null, declined: false },
    ]);
    expect(s).toEqual({
      total: 2,
      marked: 0,
      unmarked: 2,
      present: 0,
      absent: 0,
      declined: 0,
      declined_present: 0,
    });
  });

  it('keeps declined learners out of "N of M marked" and counts them on their own', () => {
    // Director ruling 2026-09-18: a learner who declined and turned up anyway can
    // be marked. If they were folded into `total`, a coordinator who has marked
    // every learner they expected would read "2 of 4 marked" and go hunting for
    // two people who said weeks ago that they were not coming.
    const s = summariseRoster([
      { attended: true, declined: false },
      { attended: false, declined: false },
      { attended: true, declined: true }, // declined, walked in
      { attended: null, declined: true }, // declined, stayed away
    ]);
    expect(s.total).toBe(2);
    expect(s.marked).toBe(2);
    expect(s.unmarked).toBe(0);
    expect(s.present).toBe(1);
    expect(s.declined).toBe(2);
    expect(s.declined_present).toBe(1);
  });
});

describe('isDeclinedWillingness', () => {
  it('treats withdrawn as declined', () => {
    expect(isDeclinedWillingness('withdrawn')).toBe(true);
  });

  it('does not treat willing, confirmed or no_show as declined', () => {
    // Non-vacuity control. `no_show` matters especially: it is an outcome the
    // system records after the fact, not a declaration the learner made, so it
    // must not be dressed up on the screen as "this learner said no".
    expect(isDeclinedWillingness('willing')).toBe(false);
    expect(isDeclinedWillingness('confirmed')).toBe(false);
    expect(isDeclinedWillingness('no_show')).toBe(false);
    expect(isDeclinedWillingness(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The roster read and the save, against a stubbed Supabase client.
// ---------------------------------------------------------------------------

interface StubTables {
  willingness: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
  learners: Array<Record<string, unknown>>;
}

/** Minimal Supabase stub: enough for getDriveAttendanceRoster's five reads. */
function makeReadClient(tables: StubTables) {
  const seenStatusFilter: { value: unknown } = { value: undefined };
  const seenRoundFilter: { value: unknown } = { value: undefined };

  function listBuilder(rows: Array<Record<string, unknown>>) {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = (col: string, val: unknown) => {
      if (col === 'round_no') seenRoundFilter.value = val;
      return builder;
    };
    builder.in = (col: string, val: unknown) => {
      if (col === 'status') seenStatusFilter.value = val;
      return builder;
    };
    builder.order = chain;
    builder.limit = async () => ({ data: rows, error: null });
    builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows, error: null });
    return builder;
  }

  return {
    seenStatusFilter,
    seenRoundFilter,
    from(table: string) {
      if (table === 'cdc_drive_willingness') return listBuilder(tables.willingness);
      if (table === 'cdc_drive_attendance') return listBuilder(tables.attendance);
      if (table === 'learners_profiles') return listBuilder(tables.learners);
      return listBuilder([]);
    },
  };
}

describe('getDriveAttendanceRoster', () => {
  const tables: StubTables = {
    willingness: [
      { learner_id: 'l1', learner_name: 'Anitha R', status: 'willing', declared_at: '2026-09-16T04:00:00Z' },
      { learner_id: 'l2', learner_name: null, status: 'confirmed', declared_at: '2026-09-16T05:00:00Z' },
    ],
    attendance: [
      {
        id: 'a1',
        learner_id: 'l1',
        round_type: 'aptitude',
        attended: true,
        attended_at: '2026-09-17T04:00:00Z',
        no_show_reason: null,
        marked_by: MARKER,
        updated_at: '2026-09-17T04:00:00Z',
      },
    ],
    learners: [
      { id: 'l1', first_name: 'Anitha', last_name: 'R', register_number: 'REG1', institution_id: null, department_id: null, semester_id: null },
      { id: 'l2', first_name: 'Bala', last_name: 'K', register_number: 'REG2', institution_id: null, department_id: null, semester_id: null },
    ],
  };

  it('returns every willing learner, marked and unmarked, with the counts', async () => {
    const client = makeReadClient(tables);
    const roster = await getDriveAttendanceRoster(client as never, DRIVE, '2');

    expect(roster.round_no).toBe(2);
    expect(roster.data).toHaveLength(2);
    expect(roster.summary).toEqual({
      total: 2,
      marked: 1,
      unmarked: 1,
      present: 1,
      absent: 0,
      declined: 0,
      declined_present: 0,
    });

    const marked = roster.data.find((r) => r.learner_id === 'l1');
    expect(marked?.attended).toBe(true);
    expect(marked?.attendance_id).toBe('a1');

    const unmarked = roster.data.find((r) => r.learner_id === 'l2');
    // Not false — nobody has looked for this learner yet.
    expect(unmarked?.attended).toBeNull();
    expect(unmarked?.attendance_id).toBeNull();
    // Falls back to the profile name when the willingness row carried none.
    expect(unmarked?.learner_name).toBe('Bala K');
  });

  it('scopes the roster to answered willingness and the attendance read to the round asked for', async () => {
    // Non-vacuity control: proves the two filters were actually applied rather
    // than the stub simply handing back everything it holds.
    //
    // 'withdrawn' joined this list on 2026-09-18 (Director ruling — "let them be
    // marked"). 'no_show' deliberately did NOT: it is an outcome the system
    // records, not an answer a learner gave.
    const client = makeReadClient(tables);
    await getDriveAttendanceRoster(client as never, DRIVE, '2');
    expect(client.seenStatusFilter.value).toEqual(['willing', 'confirmed', 'withdrawn']);
    expect(client.seenStatusFilter.value).not.toContain('no_show');
    expect(client.seenRoundFilter.value).toBe(2);
  });
});

describe('a learner who declined and turned up anyway', () => {
  // Director ruling, 2026-09-18: "let them be marked." Before it, the roster query
  // filtered withdrawn learners out entirely, so a coordinator standing in the hall
  // with that learner in front of them had no row to press — the only way to record
  // the truth was to not record it.
  //
  // `l3` is listed FIRST in the willingness rows and declared EARLIEST on purpose:
  // the stub's .order() is a no-op, so if the service did not re-order the roster
  // itself, l3 would come back at position 0 and the ordering assertion would fail.
  const declinedTables: StubTables = {
    willingness: [
      { learner_id: 'l3', learner_name: 'Chitra M', status: 'withdrawn', declared_at: '2026-09-16T03:00:00Z' },
      { learner_id: 'l1', learner_name: 'Anitha R', status: 'willing', declared_at: '2026-09-16T04:00:00Z' },
      { learner_id: 'l2', learner_name: 'Bala K', status: 'confirmed', declared_at: '2026-09-16T05:00:00Z' },
    ],
    attendance: [
      {
        id: 'a3',
        learner_id: 'l3',
        round_type: 'aptitude',
        attended: true,
        attended_at: '2026-09-17T04:10:00Z',
        no_show_reason: null,
        marked_by: MARKER,
        updated_at: '2026-09-17T04:10:00Z',
      },
    ],
    learners: [
      { id: 'l1', first_name: 'Anitha', last_name: 'R', register_number: 'REG1', institution_id: null, department_id: null, semester_id: null },
      { id: 'l2', first_name: 'Bala', last_name: 'K', register_number: 'REG2', institution_id: null, department_id: null, semester_id: null },
      { id: 'l3', first_name: 'Chitra', last_name: 'M', register_number: 'REG3', institution_id: null, department_id: null, semester_id: null },
    ],
  };

  it('appears on the roster, flagged as declined and listed after the invited ones', async () => {
    const roster = await getDriveAttendanceRoster(makeReadClient(declinedTables) as never, DRIVE, '1');

    const declined = roster.data.find((r) => r.learner_id === 'l3');
    expect(declined).toBeDefined();
    expect(declined?.declined).toBe(true);
    expect(declined?.willingness_status).toBe('withdrawn');
    // Flagged, not blended: a coordinator reading the sheet can see who was
    // expected and who walked in.
    expect(roster.data.map((r) => r.learner_id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('still returns the willing and confirmed learners, unflagged', async () => {
    // Non-vacuity control for the case above. Without this, "the declined learner
    // appears" could pass simply because the filter stopped excluding anyone —
    // including because it had started returning rows it should not.
    const roster = await getDriveAttendanceRoster(makeReadClient(declinedTables) as never, DRIVE, '1');

    const willing = roster.data.find((r) => r.learner_id === 'l1');
    const confirmed = roster.data.find((r) => r.learner_id === 'l2');
    expect(willing?.willingness_status).toBe('willing');
    expect(confirmed?.willingness_status).toBe('confirmed');
    expect(willing?.declined).toBe(false);
    expect(confirmed?.declined).toBe(false);
    expect(roster.data).toHaveLength(3);
  });

  it('can be marked present, and that mark is read back off the roster', async () => {
    const roster = await getDriveAttendanceRoster(makeReadClient(declinedTables) as never, DRIVE, '1');

    const declined = roster.data.find((r) => r.learner_id === 'l3');
    expect(declined?.attended).toBe(true);
    expect(declined?.attendance_id).toBe('a3');
    expect(declined?.attended_at).toBe('2026-09-17T04:10:00Z');

    // ...and the counts keep the two groups apart: both invited learners are still
    // waiting to be marked, and the walk-in is reported on its own track.
    expect(roster.summary.total).toBe(2);
    expect(roster.summary.marked).toBe(0);
    expect(roster.summary.unmarked).toBe(2);
    expect(roster.summary.present).toBe(0);
    expect(roster.summary.declined).toBe(1);
    expect(roster.summary.declined_present).toBe(1);
  });

  it('is written like any other mark — nothing on the write path blocks a declined learner', async () => {
    // cdc_drive_attendance has no constraint tying a mark to willingness (verified
    // against the table DDL), so "let them be marked" needed no migration. This
    // asserts the service does not add a rule of its own on the way through.
    const upsert = vi.fn(() => ({ select: async () => ({ data: [{ id: 'a3' }], error: null }) }));
    const out = await saveDriveAttendance(
      { from: () => ({ upsert }) } as never,
      DRIVE,
      { round_no: 1, marks: [{ learner_id: 'l3', attended: true }] },
      MARKER,
      NOW
    );

    expect(out).toEqual({ saved: 1, round_no: 1 });
    const [rows] = upsert.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
    expect(rows).toHaveLength(1);
    expect(rows[0].learner_id).toBe('l3');
    expect(rows[0].attended).toBe(true);
    expect(rows[0].attended_at).toBe(NOW.toISOString());
  });
});

describe('saveDriveAttendance', () => {
  function makeWriteClient(result: { data?: unknown; error?: { code?: string; message?: string } }) {
    const upsert = vi.fn(() => ({
      select: async () => ({ data: result.data ?? null, error: result.error ?? null }),
    }));
    return { upsert, client: { from: () => ({ upsert }) } };
  }

  it('upserts on the table\'s own unique key and reports how many landed', async () => {
    const { upsert, client } = makeWriteClient({ data: [{ id: 'a1' }, { id: 'a2' }] });
    const out = await saveDriveAttendance(
      client as never,
      DRIVE,
      {
        round_no: 1,
        marks: [
          { learner_id: 'l1', attended: true },
          { learner_id: 'l2', attended: false, no_show_reason: 'no reply' },
        ],
      },
      MARKER,
      NOW
    );
    expect(out).toEqual({ saved: 2, round_no: 1 });
    expect(upsert).toHaveBeenCalledOnce();
    const [rows, options] = upsert.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];
    expect(options.onConflict).toBe('drive_id,learner_id,round_no');
    expect(rows.map((r) => r.learner_id)).toEqual(['l1', 'l2']);
    expect(rows.every((r) => r.marked_by === MARKER)).toBe(true);
  });

  it('turns an RLS refusal into a sentence the coordinator can act on', async () => {
    // A caller can hold cdc.drives.edit and still not satisfy is_cdc_staff().
    // Without this, the save fails with a bare "42501" or silently writes nothing.
    const { client } = makeWriteClient({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(
      saveDriveAttendance(client as never, DRIVE, { marks: [{ learner_id: 'l1', attended: true }] }, MARKER, NOW)
    ).rejects.toThrow(NOT_CDC_TEAM_MESSAGE);
  });

  it('passes an unrelated database error straight through', async () => {
    // Non-vacuity control for the case above: the mapping must be narrow, or a
    // real fault gets reported to the coordinator as a permissions problem.
    const { client } = makeWriteClient({ error: { code: '08006', message: 'connection failure' } });
    await expect(
      saveDriveAttendance(client as never, DRIVE, { marks: [{ learner_id: 'l1', attended: true }] }, MARKER, NOW)
    ).rejects.toThrow(/connection failure/);
  });

  it('never reaches the database when the payload is invalid', async () => {
    const { upsert, client } = makeWriteClient({ data: [] });
    await expect(
      saveDriveAttendance(client as never, DRIVE, { marks: [] }, MARKER, NOW)
    ).rejects.toThrow(/at least one learner/i);
    expect(upsert).not.toHaveBeenCalled();
  });
});
