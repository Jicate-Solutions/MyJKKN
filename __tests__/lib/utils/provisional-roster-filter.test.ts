/**
 * The provisional-fresher roster predicate.
 *
 * Spec: specs/provisional-freshers-spec-2026-08-05.md
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE — stated up front, because the failure
 * this feature exists to fix is precisely a screen that looks fine while
 * omitting people, and a test suite can wear the same disguise.
 *
 * They prove the INVARIANTS of the shared predicate: that `active` is never
 * dropped, that the provisional set is exactly the two seat-holding statuses
 * and not the wider induction set, and that a missing or malformed current
 * intake degrades to today's behaviour instead of to an expression that means
 * something else. Those are the properties a future edit is most likely to
 * break silently.
 *
 * They deliberately do NOT re-implement PostgREST or SQL filter semantics
 * against fixture rows. A test that models the query engine only ever proves
 * that the test agrees with itself; it would pass just as happily over a live
 * roster that returns nobody. The behavioural claim — that a provisional
 * learner appears on a real section's roster and did not before — is proven
 * against the database and reported in the PR body, not here.
 *
 * No live count is asserted anywhere. Roughly nine sessions write this
 * database and the cohort figures move within hours, so every assertion below
 * is about a RELATIONSHIP that must hold at any population.
 */

import { describe, it, expect } from 'vitest';
import {
  ACTIVE_ONLY_LIFECYCLE_FILTER,
  buildRosterLifecycleFilter,
} from '@/lib/utils/academic/provisional-roster-filter';
import {
  ATTENDANCE_ROSTER_LIFECYCLE_STATUSES,
  PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES,
  isProvisionalAttendanceStatus,
} from '@/lib/constants/provisional-access';
import { INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES } from '@/lib/constants/induction-access';

// Shape-valid identifiers. Values are arbitrary — nothing here depends on a
// real admission year existing, which is the point.
const YEAR_A = '11111111-2222-4333-8444-555555555555';
const YEAR_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('buildRosterLifecycleFilter', () => {
  it('keeps active learners in every expression it can produce', () => {
    // The one property that must never break: this change is additive, so no
    // learner who appears on a roster today may stop appearing.
    for (const input of [
      null,
      undefined,
      [],
      [YEAR_A],
      [YEAR_A, YEAR_B],
      ['not-a-uuid'],
    ]) {
      expect(buildRosterLifecycleFilter(input)).toContain(
        ACTIVE_ONLY_LIFECYCLE_FILTER
      );
    }
  });

  it('falls back to active-only when the current intake cannot be resolved', () => {
    // Fail closed. An empty list must not become `in.()`, which PostgREST reads
    // as a different filter rather than rejecting it.
    expect(buildRosterLifecycleFilter([])).toBe(ACTIVE_ONLY_LIFECYCLE_FILTER);
    expect(buildRosterLifecycleFilter(null)).toBe(ACTIVE_ONLY_LIFECYCLE_FILTER);
    expect(buildRosterLifecycleFilter(undefined)).toBe(
      ACTIVE_ONLY_LIFECYCLE_FILTER
    );
    expect(buildRosterLifecycleFilter([])).not.toContain('in.()');
  });

  it('admits provisional learners only alongside a current-intake identifier', () => {
    const withoutIntake = buildRosterLifecycleFilter([]);
    const withIntake = buildRosterLifecycleFilter([YEAR_A]);

    // The control: before an intake is known, no provisional status is named.
    for (const status of PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES) {
      expect(withoutIntake).not.toContain(status);
      expect(withIntake).toContain(status);
    }
    expect(withIntake).toContain(YEAR_A);
    expect(withIntake.length).toBeGreaterThan(withoutIntake.length);
  });

  it('names the same statuses the SQL half names', () => {
    // Drift guard. The migration and this expression must always agree on the
    // provisional set; the induction tier's manually mirrored list is the
    // documented precedent for how that goes wrong.
    const filter = buildRosterLifecycleFilter([YEAR_A]);
    expect(filter).toContain(
      `lifecycle_status.in.(${PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES.join(',')})`
    );
  });

  it('drops values that are not identifiers, and degrades if none survive', () => {
    // A comma or parenthesis inside an `in.(…)` list changes what the
    // expression means rather than failing loudly.
    const poisoned = buildRosterLifecycleFilter([
      'x,y',
      '',
      'DROP TABLE learners_profiles',
      YEAR_A,
    ]);
    expect(poisoned).toContain(YEAR_A);
    expect(poisoned).not.toContain('DROP TABLE');
    expect(poisoned).not.toContain('x,y');

    expect(buildRosterLifecycleFilter(['x,y', 'nope', null])).toBe(
      ACTIVE_ONLY_LIFECYCLE_FILTER
    );
  });

  it('emits each identifier once', () => {
    const filter = buildRosterLifecycleFilter([YEAR_A, YEAR_A, YEAR_B]);
    expect(filter.split(YEAR_A).length - 1).toBe(1);
    expect(filter).toContain(YEAR_B);
  });
});

describe('isProvisionalAttendanceStatus', () => {
  it('answers true for the seat-holding statuses and false for active', () => {
    for (const status of PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES) {
      expect(isProvisionalAttendanceStatus(status)).toBe(true);
    }
    // A settled learner must never be chipped as provisional.
    expect(isProvisionalAttendanceStatus('active')).toBe(false);
    expect(isProvisionalAttendanceStatus('graduated')).toBe(false);
  });

  it('treats an unknown or absent status as not provisional', () => {
    // A wrongly-drawn chip on a fully-enrolled learner is worse than a missing
    // one, so absence of evidence resolves to false.
    for (const value of [null, undefined, '', 'nonsense', 'ACTIVE']) {
      expect(isProvisionalAttendanceStatus(value)).toBe(false);
    }
  });
});

describe('the provisional set, as a design invariant', () => {
  it('is a strict subset of the induction tier it reuses', () => {
    // The induction tier also admits enquiry, enquiry_submitted and account.
    // Those must never reach an attendance roster — an enquiry is not a seat.
    for (const status of PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES) {
      expect(INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES).toContain(status);
    }
    expect(PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES.length).toBeLessThan(
      INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES.length
    );

    const provisional = new Set<string>(PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES);
    for (const inductionOnly of ['enquiry', 'enquiry_submitted', 'account']) {
      expect(provisional.has(inductionOnly)).toBe(false);
      expect(buildRosterLifecycleFilter([YEAR_A])).not.toContain(inductionOnly);
    }
  });

  it('never overlaps active, so the roster set is a clean union', () => {
    expect(PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES).not.toContain('active');
    expect(ATTENDANCE_ROSTER_LIFECYCLE_STATUSES).toContain('active');

    // roster == active + provisional, with nothing counted twice.
    expect(new Set(ATTENDANCE_ROSTER_LIFECYCLE_STATUSES).size).toBe(
      1 + PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES.length
    );
    expect(ATTENDANCE_ROSTER_LIFECYCLE_STATUSES.length).toBe(
      new Set(ATTENDANCE_ROSTER_LIFECYCLE_STATUSES).size
    );
  });
});
