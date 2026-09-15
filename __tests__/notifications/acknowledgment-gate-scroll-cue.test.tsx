// @vitest-environment jsdom
/**
 * A long mandatory notice must show the scroll cue, never a negative timer.
 *
 * Before the fix, `needsScroll` was read off `contentRef.current` during
 * render. The ref is null on the first render, so it evaluated to `false`,
 * and for a notice taller than its scroll box nothing ever re-rendered —
 * the disabled button read "Read carefully (-1s)" (the -1 "not started"
 * sentinel) instead of "Scroll down to read all content". Seen live on
 * www.jkkn.ai at phone width on 2026-09-14, in both themes.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnacknowledgedNotification } from '@/types/notifications';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// The gate (not the modal under test) pulls in permissions + the pulse hook,
// and the permissions hook instantiates a Supabase client at import time.
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ isSuperAdmin: false, isLoading: false }) }));
vi.mock('@/hooks/notification/use-notification-pulse', () => ({
  useUnacknowledgedNotifications: () => ({ data: [], isLoading: false }),
  useAcknowledgeNotification: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextDisplay: ({ content }: { content: string }) => <div data-testid='body'>{content}</div>,
}));

import { AcknowledgmentModal } from '@/components/notifications/acknowledgment-gate';

const scrollBox = { scrollHeight: 0, clientHeight: 0 };

beforeEach(() => {
  // jsdom has no layout; the component decides "needs scrolling" from these two.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollBox.scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => scrollBox.clientHeight });
});
afterEach(cleanup);

const notice = (body: string): UnacknowledgedNotification =>
  ({
    notification_id: 'n-1',
    title: 'IMPORTANT ANNOUNCEMENT – TUITION FEE PAYMENT',
    body,
    priority: 'urgent',
    sender_name: 'MR. VISWANATHAN S',
    created_at: '2026-09-01T00:00:00Z',
    acknowledgment_deadline: '2026-09-30T00:00:00Z',
    metadata: {},
  }) as unknown as UnacknowledgedNotification;

function renderModal(body: string) {
  const n = notice(body);
  return render(
    <AcknowledgmentModal
      current={n}
      isOverdue={true}
      timeLeft='overdue'
      deadlineDate={new Date('2026-09-30T00:00:00Z')}
      notifications={[n]}
      currentIndex={0}
      acknowledging={false}
      onAcknowledge={() => {}}
    >
      <div>app</div>
    </AcknowledgmentModal>
  );
}

describe('AcknowledgmentModal — disabled-button label', () => {
  it('a notice taller than its box shows the scroll cue, not a negative timer', () => {
    scrollBox.scrollHeight = 1400; // a long notice on a 430px-wide phone
    scrollBox.clientHeight = 320;
    renderModal('<p>Dear Learners, …</p>'.repeat(40));
    const button = screen.getByRole('button', { name: /scroll down to read all content/i });
    expect(button).toBeDisabled();
    expect(screen.queryByText(/-1s/)).toBeNull();
    expect(screen.getByText(/Please scroll down to read the full notification/i)).toBeInTheDocument();
  });

  it('a notice that fits starts the read timer at a positive number', () => {
    scrollBox.scrollHeight = 200; // fits without scrolling
    scrollBox.clientHeight = 320;
    renderModal('<p>Short notice.</p>');
    const button = screen.getByRole('button', { name: /read carefully \((\d+)s\)/i });
    expect(button).toBeDisabled();
    const seconds = Number(/\((\d+)s\)/.exec(button.textContent ?? '')?.[1]);
    expect(seconds).toBeGreaterThanOrEqual(5); // calculateReadTimeSeconds floor
  });
});
