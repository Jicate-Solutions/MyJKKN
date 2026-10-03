// =====================================================================
// HR — which appraisal round applies to a person
// =====================================================================
// Before a round could belong to a college, opening one showed "fill in
// your appraisal" to every staff member in all nine colleges. A round now
// belongs to a college, and NULL still means all of them.
//
// The rule under test: a college's own round beats a group-wide one. Two
// people in the same college must never end up in different rounds because
// the database returned rows in a different order.
// =====================================================================

import { describe, it, expect } from 'vitest';
import {
  PerformanceReviewService,
  type HRPerformanceReviewCycle,
} from '@/lib/services/hr/performance-review-service';

const ENG = 'inst-engineering';
const DEN = 'inst-dental';

function cycle(
  id: string,
  institution_id: string | null,
  status: HRPerformanceReviewCycle['status'],
): HRPerformanceReviewCycle {
  return {
    id,
    institution_id,
    cycle_year: 2027,
    start_date: '2026-07-01',
    end_date: '2027-06-30',
    status,
    description: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
  };
}

const pick = PerformanceReviewService.pickOpenCycle;

describe('pickOpenCycle', () => {
  it('finds nothing when no round is open', () => {
    expect(pick([cycle('a', ENG, 'draft'), cycle('b', null, 'closed')], ENG)).toBeNull();
    expect(pick([], ENG)).toBeNull();
  });

  it('gives a person their own college round', () => {
    const got = pick([cycle('eng', ENG, 'open')], ENG);
    expect(got?.id).toBe('eng');
  });

  it('gives a group-wide round when the college has none', () => {
    const got = pick([cycle('all', null, 'open')], ENG);
    expect(got?.id).toBe('all');
  });

  it('prefers the college round over a group-wide one, whatever the order', () => {
    const a = [cycle('all', null, 'open'), cycle('eng', ENG, 'open')];
    const b = [cycle('eng', ENG, 'open'), cycle('all', null, 'open')];
    expect(pick(a, ENG)?.id).toBe('eng');
    expect(pick(b, ENG)?.id).toBe('eng');
  });

  it('never hands someone another college round', () => {
    expect(pick([cycle('den', DEN, 'open')], ENG)).toBeNull();
  });

  it('gives a person with no college only the group-wide round', () => {
    expect(pick([cycle('eng', ENG, 'open')], null)).toBeNull();
    expect(pick([cycle('eng', ENG, 'open'), cycle('all', null, 'open')], null)?.id).toBe('all');
  });

  it('ignores rounds that are not open', () => {
    const got = pick(
      [cycle('engDraft', ENG, 'draft'), cycle('engLocked', ENG, 'locked'), cycle('all', null, 'open')],
      ENG,
    );
    expect(got?.id).toBe('all');
  });
});
