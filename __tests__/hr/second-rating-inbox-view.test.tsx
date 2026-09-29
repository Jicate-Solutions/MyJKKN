// @vitest-environment jsdom
// =====================================================================
// HR appraisals — the second rater reads the self-appraisal in words
// =====================================================================
// The second-rater form showed the self-appraisal as a raw JSON dump. It
// now uses the same readable view the head of department sees. The form
// must stay blind: whatever arrives, the first head's ratings never show
// until both ratings are in.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';

const svc = vi.hoisted(() => ({ listMine: vi.fn(), getEvidence: vi.fn(), save: vi.fn() }));
const policySvc = vi.hoisted(() => ({ getPolicy: vi.fn() }));

vi.mock('@/lib/services/hr/appraisal-second-rating-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/hr/appraisal-second-rating-service')
  >('@/lib/services/hr/appraisal-second-rating-service');
  return { ...actual, AppraisalSecondRatingService: svc };
});
vi.mock('@/lib/services/hr/performance-review-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/hr/performance-review-service')
  >('@/lib/services/hr/performance-review-service');
  return { ...actual, PerformanceReviewService: policySvc };
});
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Records what the shared view is handed, then draws the real thing.
const viewProps = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock('@/features/hr/appraisal/self-appraisal-view', async () => {
  const actual = await vi.importActual<typeof import('@/features/hr/appraisal/self-appraisal-view')>(
    '@/features/hr/appraisal/self-appraisal-view',
  );
  return {
    ...actual,
    SelfAppraisalView: (props: Parameters<typeof actual.SelfAppraisalView>[0]) => {
      viewProps.calls.push(props as unknown as Record<string, unknown>);
      return actual.SelfAppraisalView(props);
    },
  };
});

import { SecondRatingInbox } from '@/features/hr/appraisal/second-rating-inbox';
import type {
  HRSecondRating,
  SecondRatingEvidence,
} from '@/lib/services/hr/appraisal-second-rating-service';

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'rater-1' } } }) },
} as unknown as SupabaseClient;

function request(over: Partial<HRSecondRating> = {}): HRSecondRating {
  return {
    id: 'sr-1',
    review_id: 'rev-1',
    rater_id: 'rater-1',
    rating_jsonb: null,
    submitted_at: null,
    institution_id: 'inst-1',
    assigned_by: 'hr-1',
    created_at: '2026-09-29T00:00:00Z',
    updated_at: '2026-09-29T00:00:00Z',
    ...over,
  };
}

function evidence(over: Partial<SecondRatingEvidence> = {}): SecondRatingEvidence {
  return {
    secondRatingId: 'sr-1',
    reviewId: 'rev-1',
    personName: 'Priya Raman',
    designation: 'Physics',
    institutionId: 'inst-1',
    selfAppraisal: {
      achievements: 'Published two papers and ran the first-year mentoring.',
      goals_next_year: 'Finish the thesis.',
      ratings: { teaching: 'exceeds', research: 'exceeds', service: 'exceeds', collegiality: 'exceeds' },
    },
    bothIn: false,
    firstHeadRatings: null,
    ...over,
  };
}

async function openTheRequest() {
  render(<SecondRatingInbox supabase={supabase} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  const heading = await screen.findByText('Their self-appraisal');
  return heading.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  viewProps.calls = [];
  policySvc.getPolicy.mockResolvedValue(null);
});

describe('second-rater form', () => {
  it('shows the self-appraisal in words, not as JSON', async () => {
    svc.listMine.mockResolvedValue([request()]);
    svc.getEvidence.mockResolvedValue(evidence());
    const section = await openTheRequest();

    expect(within(section).getByText('Achievements')).toBeInTheDocument();
    expect(
      within(section).getByText('Published two papers and ran the first-year mentoring.'),
    ).toBeInTheDocument();
    expect(within(section).getByText('Goals for next year')).toBeInTheDocument();
    // The shared view draws one row per area, each with the person's band.
    expect(section.querySelectorAll('[data-area]')).toHaveLength(4);
    expect(within(section).getAllByText('Exceeds')).toHaveLength(4);
    expect(section.querySelector('pre')).toBeNull();
    expect(section.textContent).not.toMatch(/[{}"]/);
    expect(section.textContent).not.toContain('achievements');
  });

  it('never shows the first head while the rater is still rating, even if a rating leaks in', async () => {
    svc.listMine.mockResolvedValue([request()]);
    svc.getEvidence.mockResolvedValue(
      evidence({
        firstHeadRatings: { teaching: 'below', research: 'below', service: 'below', collegiality: 'below' },
      }),
    );
    const section = await openTheRequest();

    expect(within(section).queryByText('Below')).toBeNull();
    expect(screen.queryByText('Their head')).toBeNull();
    expect(screen.queryByText('Both ratings are in')).toBeNull();
  });

  it('keeps the head hidden after submitting until the head has handed on', async () => {
    svc.listMine.mockResolvedValue([request({ submitted_at: '2026-09-29T10:00:00Z' })]);
    svc.getEvidence.mockResolvedValue(
      evidence({
        bothIn: false,
        firstHeadRatings: { teaching: 'below', research: 'below', service: 'below', collegiality: 'below' },
      }),
    );
    const section = await openTheRequest();

    expect(within(section).queryByText('Below')).toBeNull();
    expect(screen.queryByText('Their head')).toBeNull();
    expect(screen.getByText(/The head.s ratings will show here once they have finished too/)).toBeInTheDocument();
  });

  it('hands the shared view only the person\'s own self-appraisal, never the head\'s ratings', async () => {
    const head = { teaching: 'below', research: 'below', service: 'below', collegiality: 'below' };
    svc.listMine.mockResolvedValue([request()]);
    const ev = evidence({ firstHeadRatings: head });
    svc.getEvidence.mockResolvedValue(ev);
    await openTheRequest();

    expect(viewProps.calls.length).toBeGreaterThan(0);
    for (const props of viewProps.calls) {
      expect(props.payload).toBe(ev.selfAppraisal);
      expect(JSON.stringify(props)).not.toContain('below');
    }
  });
});
