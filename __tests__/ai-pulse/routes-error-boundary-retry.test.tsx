// @vitest-environment jsdom
/**
 * app/(routes)/error.tsx — the network auto-retry.
 * =============================================================================
 *
 * When a page's own request is cut or stalled the browser reports "network
 * error", which has no server digest, and this boundary rendered it as a
 * permanently dead page. All four of BUG-005574 / 005576 / 005579 / 005581 were
 * that page, and none of the reporters reached the "Try Again" button.
 *
 * The boundary is now the LAST resort — the pages themselves degrade a failed
 * read to an inline retry — so the one rule that matters here is: retry exactly
 * ONCE per navigation, and never spin.
 *
 * Next.js unmounts this component in both outcomes of a retry: when the
 * children finally render, and for an instant when they throw again. These
 * tests pin both, because telling them apart is the whole trick.
 */

import '@testing-library/jest-dom';
import { render, screen, act, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ai-pulse/my-pulse',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import RoutesError from '@/app/(routes)/error';

const RETRY_DELAY_MS = 1500;
const GRACE_MS = 3000;

function networkError() {
  return new Error('network error') as Error & { digest?: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  // Let the pending marker-clear run so module state does not leak between
  // tests, then drop the fake clock.
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('network error auto-retry', () => {
  it('retries once, about a second and a half later', () => {
    const reset = vi.fn();
    render(<RoutesError error={networkError()} reset={reset} />);

    expect(reset).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not retry again when the retry fails and the boundary comes back', () => {
    const reset = vi.fn();
    const first = render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(reset).toHaveBeenCalledTimes(1);

    // What Next does when the retry throws again: unmount, then immediately
    // mount with the new error. The marker must survive that.
    first.unmount();
    render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10);
    });

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('retries again on a later navigation, once the page rendered successfully', () => {
    const reset = vi.fn();
    const first = render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(reset).toHaveBeenCalledTimes(1);

    // The retry worked: the boundary unmounts and nothing comes back, so the
    // marker is dropped once the grace window passes.
    first.unmount();
    act(() => {
      vi.advanceTimersByTime(GRACE_MS + 100);
    });

    const laterReset = vi.fn();
    render(<RoutesError error={networkError()} reset={laterReset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(laterReset).toHaveBeenCalledTimes(1);
  });

  it('leaves a non-network error alone', () => {
    const reset = vi.fn();
    render(
      <RoutesError
        error={new Error('Cannot read properties of undefined') as Error}
        reset={reset}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10);
    });
    expect(reset).not.toHaveBeenCalled();
  });

  it('matches the other shapes a cut request arrives as', () => {
    for (const message of ['Failed to fetch', 'Load failed', 'NETWORK ERROR']) {
      sessionStorage.clear();
      const reset = vi.fn();
      const view = render(
        <RoutesError error={new Error(message) as Error} reset={reset} />,
      );
      act(() => {
        vi.advanceTimersByTime(RETRY_DELAY_MS);
      });
      expect(reset, message).toHaveBeenCalledTimes(1);
      view.unmount();
      act(() => {
        vi.advanceTimersByTime(GRACE_MS + 100);
      });
    }
  });

  it('skips the auto retry rather than looping when storage is blocked', () => {
    // jsdom's sessionStorage does not dispatch through Storage.prototype, so
    // replace the global outright — which is also closer to what a private
    // window actually does.
    const blocked = () => {
      throw new Error('The operation is insecure.');
    };
    vi.stubGlobal('sessionStorage', {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    const reset = vi.fn();
    render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10);
    });
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('the card itself', () => {
  it('always offers Try Again, retry or no retry', () => {
    render(<RoutesError error={networkError()} reset={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('shows the error message and the path', () => {
    render(<RoutesError error={networkError()} reset={vi.fn()} />);
    expect(screen.getByText('network error')).toBeInTheDocument();
    expect(screen.getByText(/ai-pulse\/my-pulse/)).toBeInTheDocument();
  });
});
