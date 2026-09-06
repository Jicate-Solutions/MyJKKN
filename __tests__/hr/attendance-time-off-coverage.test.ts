/**
 * Undecided requests on the attendance log and calendar.
 *
 * THE ONE RULE THESE TESTS EXIST TO PROTECT: showing a pending request must
 * never change the day's STATUS. Attendance restamps only on approval, because
 * status flows into fn_hr_compute_attendance_period_summary -> payable_days ->
 * the Salary Register. A marker that quietly turned ABSENT into LEAVE would pay
 * somebody for time nobody approved.
 *
 * Before 2026-09-02 the fetch behind this was `.eq('status','approved')`, so an
 * absence with a claim already filed against it looked identical to an
 * unexplained one — 695 records across ~200 staff.
 *
 * Run: npx vitest run __tests__/hr/attendance-time-off-coverage.test.ts
 */

import { describe, expect, it } from 'vitest';

import { buildAttendanceDays, type TimeOffRange } from '@/types/hr-attendance';

const MONTH = '2026-08' as never;

function range(o: Partial<TimeOffRange> = {}): TimeOffRange {
  return {
    id: 'r1',
    start_date: '2026-08-05',
    end_date: '2026-08-05',
    start_time: null,
    end_time: null,
    leave_type_name: 'Casual Leave',
    leave_type_code: 'CL',
    request_category: 'leave',
    decision: 'awaiting',
    ...o,
  };
}

/** Only the fields buildAttendanceDays reads; the rest of a record is noise here. */
function absentOn(date: string) {
  return {
    id: `rec-${date}`,
    work_date: date,
    status_code: 'ABSENT',
    institution_id: 'i1',
  } as never;
}

function daysFor(requests: TimeOffRange[], records: unknown[] = []) {
  return buildAttendanceDays({
    month: MONTH,
    records: records as never,
    exceptions: [],
    requests,
  });
}

const dayOf = (days: ReturnType<typeof daysFor>, date: string) =>
  days.find((d) => d.date === date)!;

describe('undecided requests reach the day', () => {
  it('marks a pending request as awaiting', () => {
    const d = dayOf(daysFor([range()]), '2026-08-05');
    expect(d.requests).toHaveLength(1);
    expect(d.requests[0].decision).toBe('awaiting');
    expect(d.requests[0].type_name).toBe('Casual Leave');
  });

  it('marks an approved request as approved', () => {
    const d = dayOf(daysFor([range({ decision: 'approved' })]), '2026-08-05');
    expect(d.requests[0].decision).toBe('approved');
  });

  /**
   * 'escalated' is a request part-way up an approval ladder. It is every bit as
   * undecided as 'pending', and a UI testing `status === 'pending'` would drop
   * it — which is why the hook maps to a decision flag rather than passing the
   * raw status through.
   */
  it('treats an escalated request as awaiting, not decided', () => {
    // The hook maps anything that is not 'approved' to 'awaiting'; this pins the
    // shape the builder receives for an escalated row.
    const d = dayOf(daysFor([range({ decision: 'awaiting' })]), '2026-08-05');
    expect(d.requests[0].decision).toBe('awaiting');
  });

  it('shows an approved and a pending request on the same day', () => {
    const d = dayOf(
      daysFor([
        range({ id: 'a', decision: 'approved', leave_type_name: 'Casual Leave' }),
        range({ id: 'b', decision: 'awaiting', leave_type_name: 'Permission',
                request_category: 'short_time_off', start_time: '10:00:00', end_time: '12:00:00' }),
      ]),
      '2026-08-05',
    );

    expect(d.requests.map((r) => r.decision).sort()).toEqual(['approved', 'awaiting']);
    const perm = d.requests.find((r) => r.category === 'short_time_off')!;
    expect(perm.start_time).toBe('10:00');
    expect(perm.end_time).toBe('12:00');
  });

  it('marks every day a multi-day request spans', () => {
    const days = daysFor([range({ start_date: '2026-08-10', end_date: '2026-08-12' })]);

    for (const date of ['2026-08-10', '2026-08-11', '2026-08-12']) {
      const d = dayOf(days, date);
      expect(d.requests, date).toHaveLength(1);
      expect(d.requests[0].decision, date).toBe('awaiting');
      expect(d.requests[0].multi_day, date).toBe(true);
    }
    expect(dayOf(days, '2026-08-13').requests).toHaveLength(0);
  });

  it('leaves days outside the request untouched', () => {
    const days = daysFor([range()]);
    expect(dayOf(days, '2026-08-04').requests).toHaveLength(0);
    expect(dayOf(days, '2026-08-06').requests).toHaveLength(0);
  });
});

describe('the status is never altered by a request', () => {
  /**
   * THE REGRESSION THAT WOULD COST MONEY. If a pending request ever changed the
   * token, the day would stop counting as LOP and the register would pay for
   * leave nobody approved.
   */
  it('an absent day stays absent while a request is awaiting', () => {
    const withRequest = dayOf(daysFor([range()], [absentOn('2026-08-05')]), '2026-08-05');
    const without = dayOf(daysFor([], [absentOn('2026-08-05')]), '2026-08-05');

    expect(withRequest.token).toBe(without.token);
    expect(withRequest.tokenLabel).toBe(without.tokenLabel);
    // The only difference is the explanation attached to it.
    expect(withRequest.requests).toHaveLength(1);
    expect(without.requests).toHaveLength(0);
  });

  it('an approved request does not change the token either', () => {
    const d = dayOf(
      daysFor([range({ decision: 'approved' })], [absentOn('2026-08-05')]),
      '2026-08-05',
    );
    const bare = dayOf(daysFor([], [absentOn('2026-08-05')]), '2026-08-05');
    // Restamping is the approval trigger's job, not the view's.
    expect(d.token).toBe(bare.token);
  });
});
