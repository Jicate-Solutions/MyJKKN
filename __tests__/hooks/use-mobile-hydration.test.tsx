// @vitest-environment jsdom
/**
 * useIsMobile must yield the phone value AFTER hydration, not only on a
 * fresh client mount.
 *
 * The production symptom (www.jkkn.ai at 430px, 2026-09-15): <main> hydrated
 * with the server's class list — no `pb-20` — and stayed that way, because the
 * old hook seeded its state from window.innerWidth on the client (already
 * `true`), so the effect's setState(true) was a no-op and nothing re-rendered.
 * suppressHydrationWarning on the element hid the mismatch.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { useIsMobile } from '@/hooks/use-mobile';

function Shell() {
  const isMobile = useIsMobile();
  return (
    <main data-testid='main' className={isMobile ? 'pb-20' : ''} suppressHydrationWarning>
      app
    </main>
  );
}

let host: HTMLDivElement;
let root: Root | null = null;
const listeners = new Set<() => void>();

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 430 });
  window.matchMedia = ((query: string) => ({
    matches: window.innerWidth < 1024,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  listeners.clear();
});

describe('useIsMobile across server render → client hydration', () => {
  it('a phone gets the mobile classes after hydrating server (desktop) markup', async () => {
    // 1. server: no phone viewport → desktop shape, no pb-20. (jsdom keeps a
    //    `window` during renderToString, so stand in for a real server by
    //    rendering the string at a desktop width.)
    (window as unknown as { innerWidth: number }).innerWidth = 1400;
    const html = renderToString(<Shell />);
    expect(html).not.toContain('pb-20');
    host.innerHTML = html;

    // 2. client at 430px hydrates that markup
    (window as unknown as { innerWidth: number }).innerWidth = 430;
    await act(async () => {
      root = hydrateRoot(host, <Shell />);
    });
    const main = host.querySelector('main')!;
    expect(main.className).toContain('pb-20'); // fails with the old hook: stays ''
  });

  it('follows the breakpoint after mount', async () => {
    (window as unknown as { innerWidth: number }).innerWidth = 1400;
    host.innerHTML = renderToString(<Shell />);
    (window as unknown as { innerWidth: number }).innerWidth = 430;
    await act(async () => {
      root = hydrateRoot(host, <Shell />);
    });
    const main = host.querySelector('main')!;
    expect(main.className).toContain('pb-20');

    await act(async () => {
      (window as unknown as { innerWidth: number }).innerWidth = 1100;
      listeners.forEach((cb) => cb());
    });
    expect(main.className).not.toContain('pb-20');

    await act(async () => {
      (window as unknown as { innerWidth: number }).innerWidth = 430;
      listeners.forEach((cb) => cb());
    });
    expect(main.className).toContain('pb-20');
  });
});
