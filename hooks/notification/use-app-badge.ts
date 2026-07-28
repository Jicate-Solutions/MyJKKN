'use client';

import { useEffect } from 'react';

/**
 * Sync the installed-app icon badge (Badging API) to the global unread count.
 *
 * `navigator.setAppBadge(n)` puts the number `n` on the Home-Screen / dock icon of
 * an INSTALLED PWA; `clearAppBadge()` removes it. Supported on installed web apps:
 * iOS/iPadOS 16.4+ (Home-Screen web apps) and desktop Chrome/Edge. It is a guarded
 * no-op everywhere it is unsupported (a normal browser tab, Firefox, etc.), and any
 * rejection from the async Badging calls is swallowed so a permission/engine quirk
 * can never surface into the React tree.
 *
 * The count passed in is the GLOBAL unread figure from the notifications COUNT
 * query (`unread_count`) — never a page length — so the icon matches the in-app
 * bell exactly.
 */
export function useAppBadge(unreadCount: number | undefined): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) {
      return;
    }
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const n = Math.max(0, Math.floor(unreadCount ?? 0));
    // setAppBadge(0) clears on most engines, but clearAppBadge() is the explicit
    // contract and avoids a lingering dot on some platforms.
    const result = n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.();
    // Badging rejects (e.g. a transient permission state) must never throw into UI.
    void result?.catch?.(() => {});
  }, [unreadCount]);
}
