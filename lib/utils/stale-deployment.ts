// lib/utils/stale-deployment.ts
//
// A tab that stayed open across a deploy still holds the previous build's
// Server Action ids. Calling one reaches a server that no longer has it and
// Next.js throws UnrecognizedActionError ("Server Action … was not found on the
// server" — Sentry JAVASCRIPT-NEXTJS-68, BUG-006164). The click silently does
// nothing until the page is reloaded, because only a fresh page carries the
// current build's action ids.
//
// Vercel Skew Protection keeps the old deployment answering for a while; these
// helpers cover a tab older than that window by reloading it once. Client-only.

import { unstable_isUnrecognizedActionError } from 'next/navigation';

/** Server Action from another deployment — the stale-tab case. */
export function isStaleServerActionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (unstable_isUnrecognizedActionError(error)) return true;
  // Fallback for an error that crossed a boundary and lost its class identity.
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'UnrecognizedActionError') return true;
  return (
    typeof message === 'string' &&
    /Server Action .* was not found on the server|Failed to find Server Action/i.test(message)
  );
}

const RELOAD_MARKER = 'stale-deployment-reload';
// One automatic reload per 30 seconds per tab. If the reloaded page still hits
// the error, something other than a stale tab is wrong — never loop.
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reload the tab to pick up the current deployment, at most once per cooldown.
 * Returns true when a reload was started.
 */
export function reloadOnceForStaleDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_MARKER) ?? 0);
    const now = Date.now();
    if (last && now - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_MARKER, String(now));
  } catch {
    // sessionStorage blocked (private window, blocked site data): skip the
    // automatic reload rather than risk a loop.
    return false;
  }
  window.location.reload();
  return true;
}
