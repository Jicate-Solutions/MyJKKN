// @vitest-environment jsdom
// =====================================================================
// HR appraisal — the "is this appraisal measuring anything?" panel
// =====================================================================
// Pairs are built only from appraisals the first head has handed on AND
// whose second rating is submitted; the verdict and the saturation warning
// read in plain words.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstrumentCheckPanel, buildPairs } from '@/features/hr/appraisal/instrument-check-panel';
import type { HRPerformanceReview } from '@/lib/services/hr/performance-review-service';
import type { HRSecondRating } from '@/lib/services/hr/appraisal-second-rating-service';

const MEETS = { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' };

function review(id: string, status: HRPerformanceReview['status'], sup: object | null): HRPerformanceReview {
  return {
    id,
    cycle_id: 'c',
    staff_id: `p-${id}`,
    self_appraisal_jsonb: { ratings: { teaching: 'exceeds' } },
    supervisor_review_jsonb: sup as Record<string, unknown> | null,
    sedc_review_jsonb: null,
    final_score: null,
    final_remarks: null,
    status,
    self_submitted_at: null,
    supervisor_reviewed_at: null,
    sedc_reviewed_at: null,
    final_approved_at: null,
    final_approved_by: null,
    created_at: '',
    updated_at: '',
  };
}

function second(reviewId: string, ratings: object, submitted = true): HRSecondRating {
  return {
    id: `s-${reviewId}`,
    review_id: reviewId,
    rater_id: 'x',
    rating_jsonb: { ratings },
    submitted_at: submitted ? '2027-01-01' : null,
    institution_id: null,
    assigned_by: null,
    created_at: '',
    updated_at: '',
  };
}

describe('pairs for the agreement report', () => {
  it('pair only a handed-on appraisal with a submitted second rating', () => {
    const reviews = [
      review('a', 'supervisor_reviewed', { ratings: MEETS }),
      review('b', 'self_submitted', { ratings: MEETS }), // head not finished
      review('c', 'final_approved', { ratings: MEETS }),
      review('d', 'sedc_reviewed', { ratings: MEETS }),
    ];
    const seconds = [second('a', MEETS), second('b', MEETS), second('c', MEETS, false)];
    expect(buildPairs(reviews, seconds)).toHaveLength(1);
  });

  it('never uses the self-rating as either side', () => {
    const [p] = buildPairs([review('a', 'supervisor_reviewed', { ratings: MEETS })], [second('a', MEETS)]);
    expect(p.first.teaching).toBe('meets');
  });
});

describe('the panel, in words', () => {
  it('says there are not enough pairs yet', () => {
    render(<InstrumentCheckPanel reviews={[]} secondRatings={[]} policy={null} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Not enough pairs yet: 0 of the 5 needed/);
  });

  it('says ratings should not be used for promotion when agreement is poor', () => {
    const reviews = Array.from({ length: 5 }, (_, i) =>
      review(`r${i}`, 'supervisor_reviewed', { ratings: MEETS }),
    );
    const seconds = reviews.map((r) => second(r.id, { ...MEETS, teaching: 'exceeds' }));
    render(<InstrumentCheckPanel reviews={reviews} secondRatings={seconds} policy={null} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /not yet measuring consistently in Teaching.*should not be used for promotion/,
    );
  });

  it('warns when nearly everyone is rated the same in an area', () => {
    const reviews = Array.from({ length: 10 }, (_, i) =>
      review(`r${i}`, 'supervisor_reviewed', { ratings: MEETS }),
    );
    render(<InstrumentCheckPanel reviews={reviews} secondRatings={[]} policy={null} />);
    expect(
      screen.getByText(/Nearly everyone is rated Meets in Research/),
    ).toHaveTextContent(/stopped telling people apart here/);
  });

  it('counts what the college did not provide', () => {
    const reviews = [
      review('a', 'supervisor_reviewed', {
        ratings: { ...MEETS, service: 'below' },
        conditions: { service: { missing: ['workload'], note: 'Three extra duties' } },
      }),
    ];
    render(<InstrumentCheckPanel reviews={reviews} secondRatings={[]} policy={null} />);
    expect(screen.getByText('Workload')).toBeInTheDocument();
  });
});
