/**
 * @vitest-environment jsdom
 *
 * The `scrolling-down:` Tailwind variant is only as good as the attribute that
 * drives it, so the direction/threshold/reset logic is pinned here. The CSS
 * half is verified by compiling the config; this is the half that can silently
 * regress — a stranded `data-scrolling-down` leaves the Help FAB invisible.
 */

import { renderHook } from '@testing-library/react';
import { useFloatingStackRetract } from '@/hooks/use-floating-stack-retract';

const ATTR = 'data-scrolling-down';

const retracted = () => document.body.hasAttribute(ATTR);

/** Move the page and fire the scroll event the hook listens for. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', {
    value: y,
    configurable: true,
    writable: true
  });
  window.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  // Run the rAF callback synchronously so each scroll is observable inline.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  scrollTo(0);
  document.body.removeAttribute(ATTR);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.removeAttribute(ATTR);
});

describe('useFloatingStackRetract', () => {
  it('retracts the stack on a downward scroll past the top zone', () => {
    renderHook(() => useFloatingStackRetract(true, '/dashboard'));

    expect(retracted()).toBe(false);
    scrollTo(300);
    expect(retracted()).toBe(true);
  });

  it('restores the stack on any upward scroll', () => {
    renderHook(() => useFloatingStackRetract(true, '/dashboard'));

    scrollTo(300);
    expect(retracted()).toBe(true);

    scrollTo(240);
    expect(retracted()).toBe(false);
  });

  it('stays visible near the top of the page even while scrolling down', () => {
    renderHook(() => useFloatingStackRetract(true, '/dashboard'));

    // 80px down is still inside the 96px top zone.
    scrollTo(80);
    expect(retracted()).toBe(false);

    // Past it, the same downward direction now retracts.
    scrollTo(300);
    expect(retracted()).toBe(true);
  });

  it('ignores sub-threshold jitter, and accumulates it rather than resetting', () => {
    renderHook(() => useFloatingStackRetract(true, '/dashboard'));

    scrollTo(300);
    expect(retracted()).toBe(true);

    // 12px of rubber-band is below the 24px threshold — no flap.
    scrollTo(288);
    expect(retracted()).toBe(true);

    // A second 12px step reaches 24px measured from the last COMMITTED
    // position (300), not from 288 — so it registers as a real scroll up.
    // If the baseline had been reset by the ignored step this would still
    // read as -12 and the stack would stay wrongly retracted.
    scrollTo(276);
    expect(retracted()).toBe(false);
  });

  it('never leaves the stack retracted after a route change', () => {
    const { rerender } = renderHook(
      ({ path }: { path: string }) => useFloatingStackRetract(true, path),
      { initialProps: { path: '/dashboard' } }
    );

    scrollTo(300);
    expect(retracted()).toBe(true);

    rerender({ path: '/notifications' });
    expect(retracted()).toBe(false);
  });

  it('never leaves the stack retracted after unmount', () => {
    const { unmount } = renderHook(() => useFloatingStackRetract(true, '/dashboard'));

    scrollTo(300);
    expect(retracted()).toBe(true);

    unmount();
    expect(retracted()).toBe(false);
  });

  it('does nothing while disabled (hidden routes attach no listener)', () => {
    renderHook(() => useFloatingStackRetract(false, '/auth/login'));

    scrollTo(500);
    expect(retracted()).toBe(false);
  });
});
