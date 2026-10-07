// @vitest-environment jsdom
// BUG-006248 / BUG-006249 — Dental learners "can't submit on-duty" with no
// error anywhere. The Submit button was disabled whenever the form was
// incomplete, so the per-gap toasts in handleSubmit (added for BUG-003236)
// could never fire: a learner who picked only a start date for a one-day OD
// (the period list already shows for that day) saw a grey button and nothing
// else. The button must stay clickable and the click must say what is missing.
// A restored OnDuty draft must also keep its type: it was wiped twice over, by
// the category tracker and by the real Radix Select (kept unmocked here on purpose).
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Radix radio/select measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

const mutate = vi.fn();
vi.mock('@/hooks/academic/use-leave-onduty', () => ({
  useCreateLeaveOndutyApplication: () => ({ mutate, isPending: false }),
}));

const odType = {
  id: 'type-od',
  code: 'OD_EVENT',
  name: 'Event OD',
  category: 'onduty',
  color_code: '#000',
  description: null,
  max_duration_days: null,
  advance_notice_hours: 0,
  requires_attachment: false,
  requires_sponsor_approval: false,
  sponsor_role_hint: null,
  allow_half_day: true,
  allow_periodwise: true,
  affects_attendance: true,
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

// The period picker and sponsor picker hit Supabase; stub them out.
vi.mock('@/components/academic/leave-onduty/period-selector', () => ({
  PeriodSelector: () => <div data-testid="period-selector" />,
}));
vi.mock('@/components/academic/leave-onduty/sponsor-picker', () => ({
  SponsorPicker: () => <div data-testid="sponsor-picker" />,
}));

import { ApplicationForm } from '@/components/academic/leave-onduty/application-form';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function seedDraft(overrides: Record<string, unknown>) {
  sessionStorage.setItem(
    'leave-onduty-form-draft',
    JSON.stringify({
      category: 'onduty',
      leaveTypeId: 'type-od',
      startDate: TODAY.toISOString(),
      endDate: TODAY.toISOString(),
      periodType: 'fullday',
      selectedPeriods: [],
      selectedPeriodsByDate: {},
      reason: 'Inter-college symposium',
      savedAt: Date.now(),
      ...overrides,
    })
  );
}

function mount() {
  render(
    <ApplicationForm learnerId="l1" institutionId="i1" sectionId="s1" semesterId="sem1" />
  );
  return screen.getByRole('button', { name: /submit application/i });
}

beforeEach(() => {
  sessionStorage.clear();
  toastError.mockClear();
  mutate.mockClear();
});
afterEach(cleanup);

describe('On-duty apply form — submit always explains itself', () => {
  it('a one-day OD with only the start date picked says the end date is missing', async () => {
    seedDraft({ endDate: null });
    const submit = mount();
    await screen.findByTestId('period-selector');

    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(toastError).toHaveBeenCalledWith('Please pick both start and end dates.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('a missing reason is named on click instead of a silent grey button', async () => {
    seedDraft({ reason: '' });
    const submit = mount();
    await screen.findByTestId('period-selector');

    fireEvent.click(submit);

    expect(toastError).toHaveBeenCalledWith('Please enter a reason for your application.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('a restored OnDuty draft keeps its on-duty type and submits', async () => {
    seedDraft({});
    const submit = mount();
    await screen.findByTestId('period-selector');

    fireEvent.click(submit);

    expect(toastError).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].data).toMatchObject({
      category: 'onduty',
      leave_type_id: 'type-od',
      period_type: 'fullday',
    });
  });
});
