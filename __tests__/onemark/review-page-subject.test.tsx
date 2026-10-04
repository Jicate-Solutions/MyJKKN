// @vitest-environment jsdom
// REVIEW-DEFAULT (BUG-006062): the OneMark review page runs ONE subject for
// both the "Ask for AI questions" panel and the queue under it, opens on
// ?subject=<config_key> or this browser's last choice, and keeps a change.

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ isLoading: false, canAccess: () => true, userProfile: { id: 'u1' } }),
}));
vi.mock('@/app/(routes)/foundation/_components/foundation-header', () => ({ FoundationHeader: () => null }));
vi.mock('@/app/(routes)/foundation/onemark/review/_lib/drafts', () => ({
  useOneMarkExams: () => ({
    data: [
      { id: 'phy', config_key: 'tn_hsc_physics', display_name: 'Physics' },
      { id: 'eng', config_key: 'tn_hsc_english', display_name: 'English' },
    ],
  }),
}));
vi.mock('@/app/(routes)/foundation/onemark/review/_components/request-drafts-panel', () => ({
  RequestDraftsPanel: ({ examId, onSubjectChange }: { examId: string | null; onSubjectChange: (id: string) => void }) => (
    <button data-testid="panel" onClick={() => onSubjectChange('phy')}>
      panel:{examId}
    </button>
  ),
}));
vi.mock('@/app/(routes)/foundation/onemark/review/_components/draft-queue', async (orig) => {
  const real = await orig<typeof import('@/app/(routes)/foundation/onemark/review/_components/draft-queue')>();
  return {
    ...real,
    DraftQueue: ({ examId }: { examId: string | null }) => <p data-testid="queue">queue:{examId}</p>,
  };
});

import OneMarkReviewPage from '@/app/(routes)/foundation/onemark/review/page';

// A plain in-memory Storage: some Node versions shadow jsdom's localStorage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true });
  window.history.replaceState(null, '', '/foundation/onemark/review');
});
afterEach(cleanup);

describe('REVIEW-DEFAULT — one subject for the whole review page', () => {
  it('opens both the request panel and the queue on ?subject=', () => {
    window.history.replaceState(null, '', '/foundation/onemark/review?subject=tn_hsc_english');
    render(<OneMarkReviewPage />);
    expect(screen.getByTestId('panel').textContent).toBe('panel:eng');
    expect(screen.getByTestId('queue').textContent).toBe('queue:eng');
  });

  it("falls back to this browser's last choice", () => {
    window.localStorage.setItem('onemark.review.subject', 'tn_hsc_english');
    render(<OneMarkReviewPage />);
    expect(screen.getByTestId('queue').textContent).toBe('queue:eng');
  });

  it('a pick in the request panel moves the queue too, and is kept in the URL and storage', () => {
    window.history.replaceState(null, '', '/foundation/onemark/review?subject=tn_hsc_english');
    render(<OneMarkReviewPage />);
    act(() => screen.getByTestId('panel').click());
    expect(screen.getByTestId('queue').textContent).toBe('queue:phy');
    expect(window.location.search).toBe('?subject=tn_hsc_physics');
    expect(window.localStorage.getItem('onemark.review.subject')).toBe('tn_hsc_physics');
  });

  it('nothing chosen: the first subject, as before', () => {
    render(<OneMarkReviewPage />);
    expect(screen.getByTestId('queue').textContent).toBe('queue:phy');
  });
});
