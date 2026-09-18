'use client';

/**
 * Lands a bug-report link on the SPOT, not just the page.
 *
 * A report's page_url gets you to the right screen; on a long screen that still
 * leaves the verifier hunting for what the reporter meant. When a link carries
 * `?bugFocus=<css selector>` (and/or `?bugScroll=<pixels>`) this scrolls that
 * element into view and outlines it for a couple of seconds.
 *
 * It only ever READS the URL — it strips nothing and adds nothing, so the link
 * stays shareable and re-openable.
 *
 * Nothing links here yet: the reporter widget started recording the selector in
 * the same PR as this component, and appending the two params to the bug card's
 * href is a separate change. With no params present this does nothing at all.
 */

import { useEffect } from 'react';

export const FOCUS_PARAM = 'bugFocus';
export const SCROLL_PARAM = 'bugScroll';
export const HIGHLIGHT_CLASS = 'bug-report-focus-highlight';
export const HIGHLIGHT_DURATION_MS = 2500;

const STYLE_ELEMENT_ID = 'bug-report-focus-style';

/**
 * The outline lives in an injected stylesheet rather than in globals.css: this
 * is the only thing that uses it, and globals.css is shared ground.
 */
const HIGHLIGHT_STYLE = `
.${HIGHLIGHT_CLASS} {
  outline: 3px solid #dc2626;
  outline-offset: 3px;
  border-radius: 4px;
  scroll-margin: 96px;
}
`;

export interface BugFocusParams {
  focus: string | null;
  scroll: number | null;
}

/**
 * Pull the two params out of a query string. `scroll` is null unless it parses
 * to a finite, non-negative integer — a junk value must not move the page.
 */
export function parseBugFocusParams(search: string): BugFocusParams {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { focus: null, scroll: null };
  }

  const rawFocus = params.get(FOCUS_PARAM);
  const focus = rawFocus && rawFocus.trim() ? rawFocus.trim() : null;

  const rawScroll = params.get(SCROLL_PARAM);
  let scroll: number | null = null;
  if (rawScroll !== null && /^\d+$/.test(rawScroll.trim())) {
    const parsed = Number.parseInt(rawScroll.trim(), 10);
    if (Number.isFinite(parsed)) scroll = parsed;
  }

  return { focus, scroll };
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function ensureHighlightStyle(): void {
  try {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = HIGHLIGHT_STYLE;
    document.head.appendChild(style);
  } catch {
    /* no stylesheet is survivable — the scroll still happens */
  }
}

/**
 * Act on the params. Returns the element that was highlighted, if any, so the
 * caller can clean the class off it. Never throws: an invalid selector makes
 * querySelector throw, and a bug report must not be able to break a page.
 */
export function applyBugFocus(params: BugFocusParams): Element | null {
  const { focus, scroll } = params;
  if (!focus && scroll === null) return null;

  let element: Element | null = null;
  if (focus) {
    try {
      element = document.querySelector(focus);
    } catch {
      element = null;
    }
  }

  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';

  if (element) {
    ensureHighlightStyle();
    try {
      element.scrollIntoView?.({ block: 'center', behavior });
    } catch {
      /* an element we cannot scroll to is still worth outlining */
    }
    element.classList.add(HIGHLIGHT_CLASS);
    return element;
  }

  // No selector, or it resolved to nothing — fall back to where the page was.
  if (scroll !== null) {
    window.scrollTo(0, scroll);
  }

  return null;
}

export function BugReportFocus() {
  useEffect(() => {
    const params = parseBugFocusParams(window.location.search);
    if (!params.focus && params.scroll === null) return;

    let highlighted: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      highlighted = applyBugFocus(params);
      if (highlighted) {
        timer = setTimeout(() => {
          highlighted?.classList.remove(HIGHLIGHT_CLASS);
          highlighted = null;
        }, HIGHLIGHT_DURATION_MS);
      }
    };

    // One frame of slack so the page's own content is mounted before we look
    // for the element the reporter was on.
    let raf: number | undefined;
    if (typeof window.requestAnimationFrame === 'function') {
      raf = window.requestAnimationFrame(run);
    } else {
      run();
    }

    return () => {
      if (raf !== undefined) window.cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      highlighted?.classList.remove(HIGHLIGHT_CLASS);
    };
  }, []);

  return null;
}
