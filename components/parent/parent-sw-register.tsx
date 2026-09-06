'use client';

/**
 * Registers the dedicated Parent Portal service worker (/parent-sw.js) at scope
 * "/parent". This is what gives the parent app its OWN push registration —
 * separate from the faculty /sw.js at scope "/" — so the two apps' push
 * endpoints never clobber each other (see public/parent-sw.js for the why).
 *
 * Mounted once in the parent route group. Renders nothing.
 */
import { useEffect } from 'react';

export const PARENT_SW_URL = '/parent-sw.js';
export const PARENT_SW_SCOPE = '/parent';

export function ParentSWRegister() {
  useEffect(() => {
    // The SW file is a static public asset, so it exists in dev too — but the
    // faculty PWAProvider unregisters stray "/sw.js" workers in dev. Keep parent
    // registration prod-only as well, matching the rest of the push pipeline
    // (push testing happens on prod/preview deployments).
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV !== 'production'
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration(PARENT_SW_SCOPE);
        const registration =
          existing && existing.scope.endsWith(PARENT_SW_SCOPE)
            ? existing
            : await navigator.serviceWorker.register(PARENT_SW_URL, {
                scope: PARENT_SW_SCOPE,
                updateViaCache: 'none',
              });

        if (cancelled) return;

        // Activate an updated worker immediately rather than waiting for all
        // tabs to close.
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.update().catch(() => {});
      } catch {
        // Registration is best-effort; the in-app notifications center still
        // works without push.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
