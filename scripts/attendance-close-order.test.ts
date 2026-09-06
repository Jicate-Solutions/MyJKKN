/**
 * The month-close console: default order, month bounds, and biometric coverage.
 *
 * Ready -> Needs review -> Closed -> No data. Sorting the status column by its
 * LABEL would put "Closed" above "Ready", which is the opposite of the working
 * order, so the rank is numeric and this pins it.
 *
 * The coverage cases use July 2026 as it actually stands, because the whole
 * point of that column is that the real numbers are alarming: 4 of 152 at Dental
 * College, and 25 of 24 at Nursing.
 *
 * Run: npx tsx scripts/attendance-close-order.test.ts
 */

import {
  CLOSE_STATE_RANK, closeStateOf, CLOSE_STATE_LABEL, monthBounds, coverageOf,
} from '../app/(routes)/hr/attendance/close/_components/close-console-columns';
import type { AttendancePeriodConsoleRow } from '../lib/services/hr/attendance/attendance-period-service';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, extra = '') =>
  cond ? (passed++, console.log(`PASS  ${name}`))
       : (failed++, console.log(`FAIL  ${name} ${extra}`));

const row = (over: Partial<AttendancePeriodConsoleRow>): AttendancePeriodConsoleRow => ({
  institution_id: 'i', institution_name: 'X', period_id: null, status: 'open',
  locked_at: null, staff_with_records: 10, active_staff: 10, relieved_with_records: 0,
  record_count: 100,
  pending_total: 0, pending_leave: 0, pending_short_time_off: 0, pending_comp_off: 0,
  approved_leave: 0, approved_short_time_off: 0, approved_comp_off: 0,
  unprocessed_days: 0, ...over,
});

// ---------------------------------------------------------------------------
// Working order
// ---------------------------------------------------------------------------
const ready  = row({ institution_name: 'Education', record_count: 31, pending_total: 0 });
const review = row({ institution_name: 'Dental', record_count: 124, pending_total: 67 });
const closed = row({ institution_name: 'Pharmacy', record_count: 2011, status: 'locked', locked_at: '2026-08-22T05:00:00Z' });
const nodata = row({ institution_name: 'Aided Arts', record_count: 0 });

check('a month with data and nothing pending is READY', closeStateOf(ready) === 'ready');
check('pending requests make it NEEDS REVIEW', closeStateOf(review) === 'review');
check('a locked month is CLOSED', closeStateOf(closed) === 'closed');
check('no records is NO DATA', closeStateOf(nodata) === 'nodata');
// The close is the more significant fact, and it could only have happened with records.
check('locked beats no-data', closeStateOf(row({ record_count: 0, status: 'locked' })) === 'closed');

const sorted = [nodata, closed, review, ready]
  .sort((a, b) => CLOSE_STATE_RANK[closeStateOf(a)] - CLOSE_STATE_RANK[closeStateOf(b)])
  .map((r) => closeStateOf(r));
check('default order is ready -> review -> closed -> nodata',
  JSON.stringify(sorted) === JSON.stringify(['ready', 'review', 'closed', 'nodata']),
  JSON.stringify(sorted));

check('ready sorts before review', CLOSE_STATE_RANK.ready < CLOSE_STATE_RANK.review);
check('nodata sorts last',
  Math.max(...Object.values(CLOSE_STATE_RANK)) === CLOSE_STATE_RANK.nodata);
// The bug the numeric rank exists to avoid.
check('an ALPHABETICAL sort would be wrong (Closed before Ready)',
  CLOSE_STATE_LABEL.closed.localeCompare(CLOSE_STATE_LABEL.ready) < 0 &&
  CLOSE_STATE_RANK.closed > CLOSE_STATE_RANK.ready);

// ---------------------------------------------------------------------------
// Month bounds — these feed the approvals links, and a toISOString() slip here
// shifts the range by a day.
// ---------------------------------------------------------------------------
check('month bounds cover a 31-day month',
  JSON.stringify(monthBounds(2026, 7)) === JSON.stringify({ from: '2026-07-01', to: '2026-07-31' }),
  JSON.stringify(monthBounds(2026, 7)));
check('month bounds handle February in a leap year',
  monthBounds(2028, 2).to === '2028-02-29', monthBounds(2028, 2).to);
check('month bounds handle February in a common year',
  monthBounds(2026, 2).to === '2026-02-28', monthBounds(2026, 2).to);

// ---------------------------------------------------------------------------
// Biometric coverage
// ---------------------------------------------------------------------------
const cov = (covered: number, active: number, relieved = 0) =>
  coverageOf(row({
    staff_with_records: covered, active_staff: active, relieved_with_records: relieved,
    record_count: covered * 31,
  }));

const dental = cov(4, 152, 1);
check('Dental: 4 of 152 is 3% coverage with 148 uncovered',
  dental.pct === 3 && dental.uncovered === 148 && dental.hasGap,
  `${dental.pct}% / ${dental.uncovered}`);

const pharmacy = cov(65, 71, 11);
check('Pharmacy: 65 of 71 is 92% with 6 uncovered',
  pharmacy.pct === 92 && pharmacy.uncovered === 6 && pharmacy.hasGap);

// Nursing has MORE covered than active because relieved staff are counted.
const nursing = cov(25, 24, 8);
check('Nursing: coverage above 100% is reported, not clamped',
  nursing.pct === 104, String(nursing.pct));
check('Nursing: over-coverage is NOT treated as a gap',
  !nursing.hasGap && nursing.uncovered === 0);

const full = cov(50, 50);
check('full coverage has no gap', !full.hasGap && full.pct === 100);

const none = cov(0, 40);
check('zero coverage reports the whole roster as uncovered',
  none.pct === 0 && none.uncovered === 40 && none.hasGap);

// An institution with no active staff at all must not divide by zero.
const empty = cov(0, 0);
check('no roster yields a null percentage rather than NaN',
  empty.pct === null && !empty.hasGap);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
