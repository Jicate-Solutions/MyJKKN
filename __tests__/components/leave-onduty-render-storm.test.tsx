// @vitest-environment jsdom
// BUG-006244 — the learner apply page logged "[PeriodSelector] Query result"
// 2,006 times in about two minutes: a render storm that froze the form on a
// low-end phone, so the attachment and Submit never went through. This counts
// PeriodSelector RENDERS (calls to its data hook), not log lines, and requires
// the count to stop growing once the form has settled.
//
// The loop lived in the apply PAGE, not the form, and #4093 (3 Oct 22:33 IST,
// after this report) removed it. Run against the page as it stood at
// 894fa66b58^, the page test fails: 302 learner reads and 903 picker renders
// in 300 ms, stopped only by the read cap below. On main: 1 read, 6 renders.
import '@testing-library/jest-dom';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

// Stable result per query key, the way react-query hands back cached data.
const detections = new Map<string, unknown>();
const periodHookCalls = vi.fn();
vi.mock('@/hooks/academic/use-leave-onduty', () => ({
  useCreateLeaveOndutyApplication: () => ({ mutate: vi.fn(), isPending: false }),
  usePeriodsForDate: (sectionId: string, semesterId: string, date: string, periodType: string) => {
    periodHookCalls(date);
    const key = [sectionId, semesterId, date, periodType].join('|');
    if (!detections.has(key)) {
      detections.set(key, {
        valid: true,
        periods: ['p1', 'p2'],
        timetable: { p1: { name: 'Period 1' }, p2: { name: 'Period 2' } },
      });
    }
    return { data: detections.get(key), isLoading: false, error: null };
  },
}));

const odType = {
  id: 'type-od', code: 'OD_EVENT', name: 'Event OD', category: 'onduty', color_code: '#000',
  description: null, max_duration_days: null, advance_notice_hours: 0, requires_attachment: false,
  requires_sponsor_approval: false, sponsor_role_hint: null, allow_half_day: true,
  allow_periodwise: true, affects_attendance: true,
};
vi.mock('@/hooks/learners/use-learner-leave-types', () => ({
  useLearnerResidency: () => ({ data: 'day_scholar', isLoading: false }),
  useEligibleLeaveTypes: () => ({ data: [odType], isLoading: false }),
}));
vi.mock('@/lib/services/academic/leave-onduty-application-service', () => ({
  LeaveOndutyApplicationService: {
    getFileRequirements: () => ({ required: false, reason: '', maxSize: 5e6, allowedTypes: [] }),
  },
}));
vi.mock('@/components/academic/leave-onduty/sponsor-picker', () => ({
  SponsorPicker: () => <div data-testid="sponsor-picker" />,
}));

// --- Page shell ---------------------------------------------------------
// Before #4093 usePermissions handed back a NEW `can` function on every
// render and the apply page listed it in a fetching effect's deps: fetch ->
// setLearnerData(new object) -> re-render -> new `can` -> fetch again, about
// 7 times a second for as long as the page was open. Every lap re-rendered
// the form and each PeriodSelector. The mock below keeps that unstable `can`
// on purpose: the page must not depend on its identity.
const learnerProfile = { id: 'u1', learner_id: 'l1', role: 'student' };
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: learnerProfile, isLoading: false, error: null }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: (_p: string) => true, isLoading: false }),
}));
const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => {
    const inner = props.children;
    return <a href={props.href}>{inner}</a>;
  },
}));
vi.mock('@/components/layout/content-layout', () => ({
  // Prop kept off the JSX line: the terminology gate reads `>{...}<` as copy.
  ContentLayout: (props: { children: React.ReactNode }) => {
    const inner = props.children;
    return <div>{inner}</div>;
  },
}));
const profileReads = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            profileReads();
            // Hard cap so a runaway loop cannot hang the run.
            if (profileReads.mock.calls.length > 300) return { data: null, error: { message: 'cap' } };
            return {
              data: { id: 'l1', institution_id: 'i1', section_id: 's1', semester_id: 'sem1' },
              error: null,
            };
          },
        }),
      }),
    }),
  }),
}));

import { ApplicationForm } from '@/components/academic/leave-onduty/application-form';
import LeaveOndutyApplyPage from '@/app/(routes)/learners/leave-onduty/apply/page';

const START = new Date(); START.setHours(0, 0, 0, 0);
const END = new Date(START); END.setDate(END.getDate() + 2);

function seedThreeDayDraft() {
  sessionStorage.setItem('leave-onduty-form-draft', JSON.stringify({
    category: 'onduty', leaveTypeId: 'type-od',
    startDate: START.toISOString(), endDate: END.toISOString(),
    periodType: 'fullday', selectedPeriods: [], selectedPeriodsByDate: {},
    reason: 'Inter-college symposium', savedAt: Date.now(),
  }));
}

beforeEach(() => {
  sessionStorage.clear();
  detections.clear();
  periodHookCalls.mockClear();
  profileReads.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function settle(ms = 500) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

describe('Leave/OD apply form — no render storm (BUG-006244)', () => {
  it('a restored three-day draft stops re-rendering the period pickers once settled', async () => {
    seedThreeDayDraft();
    render(<ApplicationForm learnerId="l1" institutionId="i1" sectionId="s1" semesterId="sem1" />);
    await screen.findAllByText(/Day 1 of 3/);
    await settle();
    const settled = periodHookCalls.mock.calls.length;
    await settle(1000);
    const later = periodHookCalls.mock.calls.length;
    console.info(`[render-storm] form: settled=${settled} later=${later}`);
    expect(later).toBe(settled);
    expect(settled).toBeLessThan(40);
  });

  it('the apply page reads the learner record once and the period pickers go quiet', async () => {
    seedThreeDayDraft();
    render(<LeaveOndutyApplyPage />);
    // Fixed windows, not a findBy: a looping page never gives the test a turn.
    await settle(300);
    const settled = periodHookCalls.mock.calls.length;
    const readsSettled = profileReads.mock.calls.length;
    await settle(700);
    const later = periodHookCalls.mock.calls.length;
    const readsLater = profileReads.mock.calls.length;
    console.info(
      `[render-storm] page: picker renders settled=${settled} later=${later}; learner reads settled=${readsSettled} later=${readsLater}`
    );
    expect(readsLater).toBe(1);
    expect(settled).toBeGreaterThan(0);
    expect(later).toBe(settled);
    expect(settled).toBeLessThan(40);
  }, 20000);
});
