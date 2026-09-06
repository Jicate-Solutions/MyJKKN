'use client';

/**
 * InstallPromptBanner — dismissable bottom-anchored banner that surfaces the
 * native PWA install dialog when the browser supports it.
 *
 * Renders when ALL of the following are true:
 *   1. The browser has fired `beforeinstallprompt` (Chromium-based: Chrome,
 *      Edge, Brave, Opera, Samsung Internet, etc).
 *   2. The user has not dismissed the banner in the last 7 days
 *      (localStorage flag with timestamp).
 *   3. The app is not already running in standalone / installed mode
 *      (display-mode: standalone OR navigator.standalone for iOS quirks).
 *
 * iOS caveat: Safari/iOS does NOT fire `beforeinstallprompt`. iOS users
 * install a PWA via Share -> Add to Home Screen. v1 ships Chromium/Edge
 * only; an iOS-specific hint is a fast follow-up.
 *
 * SSR-safe — all browser APIs are accessed inside useEffect, so the
 * component renders nothing on the server.
 *
 * The 7-day cooldown is shared with the older `<InstallPrompt />` chip via
 * the same localStorage key (`pwa-install-dismissed-until`) so a dismissal
 * of either suppresses both surfaces.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_UNTIL_KEY = 'pwa-install-dismissed-until';
const INSTALL_COMPLETED_KEY = 'pwa-install-completed';
const COOLDOWN_DAYS = 7;

function isStillInCooldown(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const until = window.localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (!until) return false;
    return new Date() < new Date(until);
  } catch {
    return false;
  }
}

function isAlreadyInstalled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.localStorage.getItem(INSTALL_COMPLETED_KEY) === 'true') {
      return true;
    }
  } catch {
    // localStorage may be unavailable (private mode, blocked); fall through.
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari exposes navigator.standalone; not in the standard typings.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
    .standalone === true;
  return standalone || iosStandalone;
}

export function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isAlreadyInstalled()) return;
    if (isStillInCooldown()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      try {
        window.localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
        window.localStorage.removeItem(DISMISSED_UNTIL_KEY);
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      try {
        if (outcome === 'accepted') {
          window.localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
        } else {
          // User dismissed the native dialog — start the 7-day cooldown.
          const until = new Date();
          until.setDate(until.getDate() + COOLDOWN_DAYS);
          window.localStorage.setItem(
            DISMISSED_UNTIL_KEY,
            until.toISOString()
          );
        }
      } catch {
        // ignore localStorage errors
      }
    } catch {
      // Prompt can throw if already used; swallow.
    } finally {
      setDeferredPrompt(null);
      setVisible(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    try {
      const until = new Date();
      until.setDate(until.getDate() + COOLDOWN_DAYS);
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, until.toISOString());
    } catch {
      // ignore
    }
    setVisible(false);
  }, []);

  if (!visible || !deferredPrompt) return null;

  return (
    <div
      role="dialog"
      aria-label="Install MyJKKN"
      // The bottom nav is `lg:hidden`, so the desktop offset has to wait for
      // `lg` — at `md` the nav is still on screen.
      //
      // Two insets, both only below `lg`:
      //
      // `right-20` (80px), not `right-4`: the floating FAB column occupies
      // right-4 and is 48px wide (16px..64px from the right edge), with the
      // 56px echo bubble reaching 72px. A full-bleed banner put the red
      // bug-reporter FAB directly on top of the "Not now" button. 80px clears
      // the widest of them by 8px.
      //
      // `bottom-nav-safe-2`, not `bottom-nav-safe`: the platform Help FAB
      // (components/guide/platform-guide-fab.tsx) is left-4 at nav-safe and
      // z-40, and both are mounted globally in app/layout.tsx — a banner at
      // nav-safe covered it completely and made Help unclickable until the
      // banner was dismissed. Slot 2 clears its ~44px pill by 20px.
      //
      // At `lg` the nav, the FAB column and the mobile Help FAB position are
      // all gone, so both insets lift.
      className="fixed bottom-nav-safe-2 lg:bottom-6 left-4 right-20 md:left-auto md:max-w-sm lg:right-6 bg-background border shadow-lg rounded-lg p-3 z-50"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            <span aria-hidden="true">📱 </span>
            Install MyJKKN
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Works offline, opens in one tap.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleInstall}
            className="text-xs font-medium px-3 h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-medium px-3 h-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
