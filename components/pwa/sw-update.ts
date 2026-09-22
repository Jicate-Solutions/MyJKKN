/**
 * Safe wrapper around `ServiceWorkerRegistration.update()`.
 *
 * WHY THIS EXISTS (Sentry groups 7459568684 / JAVASCRIPT-NEXTJS-1J and
 * 7514970624 / JAVASCRIPT-NEXTJS-41):
 *
 *   TypeError: Failed to update a ServiceWorker for scope
 *   ('https://www.jkkn.ai/') with script ('https://www.jkkn.ai/sw.js'):
 *   An unknown error occurred when fetching the script.
 *
 *   InvalidStateError: Failed to update a ServiceWorker for scope (...)
 *
 * 309 events across 23 users since 2026-05-04, spread over many releases, and
 * reported with `mechanism: auto.browser.global_handlers.onunhandledrejection`
 * — i.e. nobody was catching the promise. The one unguarded caller was the
 * 30-minute poll in `update-prompt.tsx`, which called `registration.update()`
 * as a floating promise; every other `update()` site in the repo already had
 * a `.catch()` or sat inside a try/catch.
 *
 * An UPDATE check is best-effort by definition. It fails when the tab is
 * offline, when sw.js cannot be fetched (a deploy is mid-flight, the network
 * dropped, a captive portal answered instead), or when the registration was
 * unregistered by another tab (InvalidStateError). In every one of those cases
 * the already-active worker keeps serving the page and nothing in the app
 * breaks — so a failed update must be a warning, never a reported error.
 *
 * Guards applied here, in order:
 *   - no registration, or no active worker  -> skip (this is the state that
 *     makes `update()` reject with InvalidStateError)
 *   - the browser reports itself offline    -> skip
 *   - an update check is already in flight  -> skip (at most one per page)
 *   - the call itself rejects               -> warn with the error name, never
 *     rethrow, never reach the global unhandledrejection handler
 */

export type SwUpdateOutcome =
  | 'updated'
  | 'offline'
  | 'not-active'
  | 'in-flight'
  | 'failed';

/** At most one update check in flight per page load. */
let inFlight = false;

function isOnline(): boolean {
  // `navigator.onLine` is absent in non-browser environments; absence means
  // "no reason to believe we are offline", not "offline".
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export async function safeServiceWorkerUpdate(
  registration: ServiceWorkerRegistration | null | undefined
): Promise<SwUpdateOutcome> {
  if (!registration || !registration.active) return 'not-active';
  if (!isOnline()) return 'offline';
  if (inFlight) return 'in-flight';

  inFlight = true;
  try {
    await registration.update();
    return 'updated';
  } catch (error) {
    const name =
      error instanceof Error && error.name ? error.name : 'UnknownError';
    console.warn(
      `[pwa] service worker update check skipped (${name}) — the active worker keeps serving`
    );
    return 'failed';
  } finally {
    inFlight = false;
  }
}

/** Test-only: reset the per-page in-flight latch. */
export function __resetSwUpdateStateForTests(): void {
  inFlight = false;
}
