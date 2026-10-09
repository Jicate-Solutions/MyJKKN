// @vitest-environment jsdom
// =====================================================================
// HR appraisals — the round page lists people by name, not by id
// =====================================================================
// The round page's "Staff progress" table showed each person as the
// first 8 characters of their staff id. It now reads names and
// departments through PerformanceReviewService.listPeople (under the
// admin's own access) and falls back to "Team member" plus a short
// reference when a name cannot be read. The service is mocked, so this
// proves the SCREEN; listPeople itself is tested in
// appraisal-team-board.test.tsx.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  getCycle: vi.fn(),
  listReviews: vi.fn(),
  listPeople: vi.fn(),
  getPolicyForStaff: vi.fn(),
  updateCycle: vi.fn(),
  // The round page asks who is the Director (Sign off gate, 1 Oct 2026).
  isTheDirector: vi.fn(async () => false),
}));

vi.mock('@/lib/services/hr/performance-review-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/hr/performance-review-service')>(
    '@/lib/services/hr/performance-review-service',
  );
  return { ...actual, PerformanceReviewService: svc };
});
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'cyc-1' }) }));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (props: { children: React.ReactNode }) => props.children,
}));
vi.mock('@/components/auth/admin-permission-guard', () => ({
  SuperAdminOnly: (props: { children: React.ReactNode }) => props.children,
}));
vi.mock('@/lib/supabase/client', () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'admin-profile' } } }) } };
  return { createClientSupabaseClient: () => client };
});

import HrPerformanceReviewCycleDetailPage from '@/app/(routes)/hr/admin/performance-reviews/cycles/[id]/page';
import type { HRPerformanceReview, ReviewStatus } from '@/lib/services/hr/performance-review-service';

function appraisal(staffId: string, status: ReviewStatus): HRPerformanceReview {
  return {
    id: `rev-${staffId}`,
    cycle_id: 'cyc-1',
    staff_id: staffId,
    self_appraisal_jsonb: null,
    supervisor_review_jsonb: null,
    sedc_review_jsonb: null,
    final_score: null,
    final_remarks: null,
    status,
    self_submitted_at: null,
    supervisor_reviewed_at: null,
    sedc_reviewed_at: null,
    final_approved_at: null,
    final_approved_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };
}

const NAMED = appraisal('aaaa1111-0000-0000-0000-000000000001', 'supervisor_reviewed');
const UNNAMED = appraisal('bbbb2222-0000-0000-0000-000000000002', 'draft');

beforeEach(() => {
  vi.clearAllMocks();
  svc.getCycle.mockResolvedValue({
    id: 'cyc-1',
    cycle_year: 2027,
    status: 'open',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
    description: null,
  });
  svc.listReviews.mockResolvedValue([NAMED, UNNAMED]);
  svc.listPeople.mockResolvedValue({
    [NAMED.staff_id]: { name: 'Anitha Raman', department: 'Physics' },
  });
  svc.getPolicyForStaff.mockResolvedValue(null);
});

function firstCells() {
  return [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td') as HTMLElement);
}

describe('the round page table', () => {
  it('shows each person by name and department, read for exactly the people listed', async () => {
    render(<HrPerformanceReviewCycleDetailPage />);
    expect(await screen.findByText('Anitha Raman')).toBeInTheDocument();
    expect(screen.getByText('Physics')).toBeInTheDocument();
    expect(svc.listPeople).toHaveBeenCalledWith(expect.anything(), [NAMED.staff_id, UNNAMED.staff_id]);
    // A named person has no id shown at all.
    expect(firstCells()[0].textContent).toBe('Anitha RamanPhysics');
    expect(document.body.textContent).not.toContain('aaaa1111');
    expect(document.querySelector('thead th')?.textContent).toBe('Team member');
  });

  it('falls back to "Team member" and a short reference when a name cannot be read', async () => {
    render(<HrPerformanceReviewCycleDetailPage />);
    await screen.findByText('Anitha Raman');
    expect(firstCells()[1].textContent).toBe('Team memberref bbbb2222');
  });

  it('reads the names again on refresh', async () => {
    render(<HrPerformanceReviewCycleDetailPage />);
    await screen.findByText('Anitha Raman');
    svc.listPeople.mockResolvedValueOnce({
      [NAMED.staff_id]: { name: 'Anitha Raman', department: 'Physics' },
      [UNNAMED.staff_id]: { name: 'Bala Kumar', department: null },
    });
    const refresh = document.querySelector('svg.lucide-refresh-cw')?.closest('button') as HTMLElement;
    fireEvent.click(refresh);
    expect(await screen.findByText('Bala Kumar')).toBeInTheDocument();
    await waitFor(() => expect(svc.listPeople).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('ref bbbb2222')).not.toBeInTheDocument();
  });
});
