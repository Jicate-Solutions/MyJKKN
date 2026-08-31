/**
 * Shared one-shot reload for the PWA update flow.
 *
 * History (2026-08-02): update-prompt.tsx used to register an UNCONDITIONAL
 * `controllerchange -> window.location.reload()` listener on every mount, and
 * pwa-provider.tsx#updateApp() stacked another anonymous one per call.
 * Combined with `skipWaiting: true` in app/sw.ts, every deploy — and even the
 * very first service-worker activation via clients.claim() — force-reloaded
 * every open tab with no user action. On www.jkkn.ai this showed up as
 * /dashboard fully re-bootstrapping 2-3x per visit.
 *
 * This module is now the ONLY place a reload may be wired to
 * `controllerchange`: armed at most once per page (`armed` guard),
 * self-removing (`{ once: true }`), and only ever called from an explicit
 * user action (the "Update Now" buttons) right before SKIP_WAITING is posted
 * to the waiting service worker.
 */

let armed = false;

export function armReloadOnControllerChange(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  if (armed) return;
  armed = true;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      window.location.reload();
    },
    { once: true }
  );
}
