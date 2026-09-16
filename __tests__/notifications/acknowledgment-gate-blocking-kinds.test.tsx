// @vitest-environment jsdom
/**
 * Blocking feedback gate (2026-09-16) — the two new kinds of blocking item.
 *
 *   kind 'bug_feedback'  → Fixed / Not fixed / Ask me later; "Ask me later"
 *                          disappears after the 3rd snooze (ruling 2).
 *   kind 'answer'        → the announcement's option buttons replace the
 *                          "I Acknowledge" button once the read gate opens.
 */
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnacknowledgedNotification } from '@/types/notifications';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ isSuperAdmin: false, isLoading: false }) }));
vi.mock('@/hooks/notification/use-notification-pulse', () => ({
  useNotificationPulse: () => ({ data: { unacknowledged: [], pending: null, generated_at: '' }, isLoading: false }),
  invalidateNotificationPulse: vi.fn(),
  NOTIFICATION_PULSE_KEY: ['notification-pulse'],
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextDisplay: ({ content }: { content: string }) => <div data-testid='body'>{content}</div>,
}));

import { AcknowledgmentModal, BugFeedbackModal } from '@/components/notifications/acknowledgment-gate';

const scrollBox = { scrollHeight: 0, clientHeight: 0 };
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollBox.scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => scrollBox.clientHeight });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function bugItem(overrides: Partial<UnacknowledgedNotification> = {}): UnacknowledgedNotification {
  return {
    kind: 'bug_feedback',
    id: 'req-1',
    notification_id: 'req-1',
    title: 'You reported BUG-006107 — is it fixed for you?',
    body: 'The attendance page shows yesterday twice.',
    priority: 'normal',
    category: 'bug_reports:fix_feedback',
    sent_at: '2026-09-10T00:00:00Z',
    deadline_at: '2026-11-09T00:00:00Z',
    is_overdue: false,
    request_id: 'req-1',
    bug_id: 'bug-1',
    display_id: 'BUG-006107',
    snooze_count: 0,
    can_snooze: true,
    ...overrides,
  };
}

describe('BugFeedbackModal (kind bug_feedback)', () => {
  it('shows the bug, Fixed, Not fixed and Ask me later with the snoozes left', () => {
    const onAnswer = vi.fn();
    const onSnooze = vi.fn();
    const item = bugItem();
    render(
      <BugFeedbackModal current={item} notifications={[item]} currentIndex={0} busy={false} onAnswer={onAnswer} onSnooze={onSnooze}>
        <div>app</div>
      </BugFeedbackModal>
    );
    expect(screen.getByTestId('bug-description')).toHaveTextContent('The attendance page shows yesterday twice.');
    expect(screen.getByText(/You reported bug BUG-006107/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Fixed$/ }));
    expect(onAnswer).toHaveBeenCalledWith('fixed');
    fireEvent.click(screen.getByRole('button', { name: /Not fixed/ }));
    expect(onAnswer).toHaveBeenCalledWith('not_fixed');

    const later = screen.getByRole('button', { name: /Ask me later/ });
    expect(later).toHaveTextContent('(3 left)');
    fireEvent.click(later);
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });

  it('hides Ask me later after the third snooze (ruling 2) and says so', () => {
    const item = bugItem({ snooze_count: 3, can_snooze: false });
    render(
      <BugFeedbackModal current={item} notifications={[item]} currentIndex={0} busy={false} onAnswer={vi.fn()} onSnooze={vi.fn()}>
        <div>app</div>
      </BugFeedbackModal>
    );
    expect(screen.queryByRole('button', { name: /Ask me later/ })).toBeNull();
    expect(screen.getByText(/No more "ask me later"/)).toBeInTheDocument();
    // The two real answers are still there.
    expect(screen.getByRole('button', { name: /^Fixed$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Not fixed/ })).toBeEnabled();
  });

  it('disables every button while a request is in flight', () => {
    const item = bugItem();
    render(
      <BugFeedbackModal current={item} notifications={[item]} currentIndex={0} busy={true} onAnswer={vi.fn()} onSnooze={vi.fn()}>
        <div>app</div>
      </BugFeedbackModal>
    );
    expect(screen.getByRole('button', { name: /^Fixed$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Not fixed/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Ask me later/ })).toBeDisabled();
  });
});

describe('AcknowledgmentModal (kind answer)', () => {
  const answerItem: UnacknowledgedNotification = {
    kind: 'answer',
    id: 'un-1',
    notification_id: 'n-1',
    title: 'Will you attend the sports day?',
    body: 'Short notice.',
    priority: 'normal',
    category: 'general',
    sent_at: '2026-09-16T00:00:00Z',
    deadline_at: '2026-09-17T00:00:00Z',
    is_overdue: false,
    metadata: {},
    answer_options: ['Yes', 'No', "Can't tell"],
  };

  it('offers the option buttons instead of the acknowledge button once the read gate opens', () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    const onAcknowledge = vi.fn();
    // Short body that fits without scrolling → timer starts at once (5 s minimum).
    scrollBox.scrollHeight = 100;
    scrollBox.clientHeight = 400;
    render(
      <AcknowledgmentModal
        current={answerItem}
        isOverdue={false}
        timeLeft='1d'
        deadlineDate={new Date('2026-09-17T00:00:00Z')}
        notifications={[answerItem]}
        currentIndex={0}
        acknowledging={false}
        onAcknowledge={onAcknowledge}
        onAnswer={onAnswer}
      >
        <div>app</div>
      </AcknowledgmentModal>
    );
    expect(screen.getByText('Your answer is needed')).toBeInTheDocument();
    // Read gate closed: options not yet offered, disabled "Read carefully" button instead.
    expect(screen.queryByTestId('answer-options')).toBeNull();
    expect(screen.getByRole('button', { name: /Read carefully/ })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    const options = screen.getByTestId('answer-options');
    expect(options).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I Acknowledge/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Can't tell" }));
    expect(onAnswer).toHaveBeenCalledWith("Can't tell");
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  it('falls back to the acknowledge button when no onAnswer handler is wired', () => {
    vi.useFakeTimers();
    scrollBox.scrollHeight = 100;
    scrollBox.clientHeight = 400;
    render(
      <AcknowledgmentModal
        current={{ ...answerItem, kind: 'ack', answer_options: undefined }}
        isOverdue={false}
        timeLeft='1d'
        deadlineDate={new Date('2026-09-17T00:00:00Z')}
        notifications={[answerItem]}
        currentIndex={0}
        acknowledging={false}
        onAcknowledge={vi.fn()}
      >
        <div>app</div>
      </AcknowledgmentModal>
    );
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole('button', { name: /I Acknowledge/ })).toBeEnabled();
    expect(screen.queryByTestId('answer-options')).toBeNull();
  });
});
