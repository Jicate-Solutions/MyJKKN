// @vitest-environment jsdom
// =====================================================================
// HR staff harness — proof of done (2): the termination review screen
// =====================================================================
// G5 (the signed termination order) and G6 (the second check of the final
// settlement) are recorded on the termination case's review screen,
// /hr/admin/terminations/[id]/review. Without these two panels there is no
// place in the app to attach the order or check the settlement, and the
// backend for both duties cannot be reached.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const CASE_ID = '00000000-0000-4000-8000-00000000f001';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: CASE_ID }) }));
// Plain elements stand in for the link, the guard and the layout: each just
// renders what it wraps.
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('@/components/auth/admin-permission-guard', () => ({ SuperAdminOnly: 'div' }));
vi.mock('@/components/layout/content-layout', () => ({ ContentLayout: 'div' }));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const staffQuery = {
  select: () => staffQuery,
  eq: () => staffQuery,
  maybeSingle: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => staffQuery }),
}));

vi.mock('@/lib/services/hr/termination-service', () => ({
  APPROVAL_STEP_LABEL: { sedc: 'SEDC', legal: 'Legal', director: 'Director' },
  TerminationService: {
    getTerminationCase: async () => ({
      id: CASE_ID,
      staff_id: '00000000-0000-4000-8000-00000000d001',
      institution_id: '00000000-0000-4000-8000-00000000b001',
      initiated_by: null,
      initiated_at: '2026-10-01T10:00:00Z',
      reason: 'Termination after inquiry',
      recommended_last_day: null,
      current_step_index: 0,
      status: 'open',
      separation_type: 'termination',
      termination_approval_chain: [
        { step: 'sedc', status: 'approved' },
        { step: 'legal', status: 'approved' },
        { step: 'director', status: 'approved', acted_at: '2026-10-02T10:00:00Z' },
      ],
      legal_review_status: 'approved',
      termination_grounds: 'Documented grounds',
      notice_period_waived: false,
      metadata: {},
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-02T10:00:00Z',
    }),
    advanceApprovalChain: vi.fn(),
  },
}));

vi.mock('@/components/hr/duty-proof/duty-proof-panel', () => ({
  DutyProofPanel: ({ duty, itemId }: { duty: string; itemId?: string }) => (
    <div data-testid={`mounted-${duty}`}>{itemId ?? 'no item'}</div>
  ),
}));

import TerminationReviewPage from '@/app/(routes)/hr/admin/terminations/[id]/review/page';

describe('termination review screen — proof of done panels', () => {
  it('shows the signed-order panel (G5) for this case', async () => {
    render(<TerminationReviewPage />);
    const g5 = await screen.findByTestId('mounted-G5');
    expect(g5.textContent).toBe(CASE_ID);
  });

  it('shows the final settlement second-check panel (G6) for this case', async () => {
    render(<TerminationReviewPage />);
    const g6 = await screen.findByTestId('mounted-G6');
    expect(g6.textContent).toBe(CASE_ID);
  });
});
