// @vitest-environment jsdom
/**
 * app/(routes)/error.tsx — recovering from a cut request.
 * =============================================================================
 *
 * When a page's own request is cut or stalled the browser reports "network
 * error", which has no server digest, and this boundary rendered it as a
 * permanently dead page. All four of BUG-005574 / 005576 / 005579 / 005581 were
 * that page, and none of the reporters reached the "Try Again" button.
 *
 * Two rules are pinned here.
 *
 * 1. Recovery has to REFETCH. `reset()` alone only clears this boundary's state
 *    and re-renders the segment; for an error thrown by a Server Component it
 *    can replay the very RSC payload that failed, leaving the page just as dead.
 *    `router.refresh()` is what refetches it, and it has to happen first.
 *    https://nextjs.org/docs/app/api-reference/file-conventions/error#reset
 *
 * 2. Exactly ONE automatic retry per route, and never a loop. The marker lives
 *    in sessionStorage keyed by pathname; it is dropped when the boundary
 *    mounts for a different route, or when the learner presses Try Again. A
 *    repeat failure on the same route re-mounts with the marker still set.
 */

import '@testing-library/jest-dom';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const nav = vi.hoisted(() => ({
  pathname: '/ai-pulse/my-pulse',
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: nav.refresh }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import RoutesError from '@/app/(routes)/error';

const RETRY_DELAY_MS = 1500;

function networkError() {
  return new Error('network error') as Error & { digest?: string };
}

function tryAgainButton() {
  return screen.getByRole('button', { name: /try again/i });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  nav.pathname = '/ai-pulse/my-pulse';
  nav.refresh = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recovery refetches, it does not just re-render', () => {
  it('refreshes the route before resetting the boundary', () => {
    const reset = vi.fn();
    render(<RoutesError error={networkError()} reset={reset} />);

    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });

    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    // Order matters: resetting first can re-render against the same failed
    // payload before the refetch has replaced it.
    expect(nav.refresh.mock.invocationCallOrder[0]).toBeLessThan(
      reset.mock.invocationCallOrder[0],
    );
  });

  it('does the same when the learner presses Try Again', () => {
    const reset = vi.fn();
    render(<RoutesError error={new Error('boom') as Error} reset={reset} />);

    act(() => {
      fireEvent.click(tryAgainButton());
    });

    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(nav.refresh.mock.invocationCallOrder[0]).toBeLessThan(
      reset.mock.invocationCallOrder[0],
    );
  });
});

describe('one automatic retry per route', () => {
  it('does not retry a second time when the retry fails and the boundary returns', () => {
    const reset = vi.fn();
    const first = render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(reset).toHaveBeenCalledTimes(1);

    // The refetch did not help: Next unmounts and mounts again with the new
    // error, same route. The marker must still be there.
    first.unmount();
    render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10);
    });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it('re-arms when the boundary next mounts for a different route', () => {
    const reset = vi.fn();
    const first = render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(reset).toHaveBeenCalledTimes(1);
    first.unmount();

    // A different page fails later in the same tab: its own first retry is due.
    nav.pathname = '/ai-pulse';
    const laterReset = vi.fn();
    render(<RoutesError error={networkError()} reset={laterReset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(laterReset).toHaveBeenCalledTimes(1);

    // And the route the learner left no longer holds a spent marker.
    expect(sessionStorage.getItem('network-retry:/ai-pulse/my-pulse')).toBeNull();
  });

  it('re-arms the automatic retry once the learner has pressed Try Again', () => {
    const reset = vi.fn();
    const first = render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(sessionStorage.getItem('network-retry:/ai-pulse/my-pulse')).toBe('1');

    act(() => {
      fireEvent.click(tryAgainButton());
    });
    expect(sessionStorage.getItem('network-retry:/ai-pulse/my-pulse')).toBeNull();

    // A later failure on the same route gets its automatic retry back.
    first.unmount();
    const laterReset = vi.fn();
    render(<RoutesError error={networkError()} reset={laterReset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
    });
    expect(laterReset).toHaveBeenCalledTimes(1);
  });
});

describe('what counts as a cut request', () => {
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
    expect(nav.refresh).not.toHaveBeenCalled();
    // The button is still the way out.
    expect(tryAgainButton()).toBeInTheDocument();
  });

  it('matches the other shapes a cut request arrives as', () => {
    const shapes = ['Failed to fetch', 'Load failed', 'NETWORK ERROR'];
    shapes.forEach((message, i) => {
      nav.pathname = `/route-${i}`;
      const reset = vi.fn();
      const view = render(
        <RoutesError error={new Error(message) as Error} reset={reset} />,
      );
      act(() => {
        vi.advanceTimersByTime(RETRY_DELAY_MS);
      });
      expect(reset, message).toHaveBeenCalledTimes(1);
      view.unmount();
    });
  });
});

describe('when storage is unavailable', () => {
  const blocked = () => {
    throw new Error('The operation is insecure.');
  };

  // jsdom's sessionStorage does not dispatch through Storage.prototype, so
  // replace the global outright — closer to what a private window does.
  function blockStorage() {
    vi.stubGlobal('sessionStorage', {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
      key: blocked,
      get length() {
        return blocked();
      },
    });
  }

  it('skips the automatic retry rather than looping', () => {
    blockStorage();
    const reset = vi.fn();
    render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10);
    });
    expect(reset).not.toHaveBeenCalled();
  });

  it('still recovers when the learner presses Try Again', () => {
    blockStorage();
    const reset = vi.fn();
    render(<RoutesError error={networkError()} reset={reset} />);
    act(() => {
      fireEvent.click(tryAgainButton());
    });
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('the card itself', () => {
  it('always offers Try Again, retry or no retry', () => {
    render(<RoutesError error={networkError()} reset={vi.fn()} />);
    expect(tryAgainButton()).toBeInTheDocument();
  });

  it('shows the error message and the path', () => {
    render(<RoutesError error={networkError()} reset={vi.fn()} />);
    expect(screen.getByText('network error')).toBeInTheDocument();
    expect(screen.getByText(/ai-pulse\/my-pulse/)).toBeInTheDocument();
  });
});
