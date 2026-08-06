'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { UpdatePrompt } from './update-prompt';
import { armReloadOnControllerChange } from './sw-reload';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextType {
  isInstalled: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  isOnline: boolean;
  isHydrated: boolean;
  installApp: () => Promise<void>;
  updateApp: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within PWAProvider');
  }
  return context;
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOnline, setIsOnline] = useState(true); // Default to true for SSR
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Skip PWA registration on auth pages to prevent refresh loops
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/auth/')) {
        setIsHydrated(true);
        setIsOnline(navigator.onLine);
        return;
      }
    }
    // Mark as hydrated
    setIsHydrated(true);

    // Initialize online status after hydration
    setIsOnline(navigator.onLine);

    // Check installation status
    const checkInstallStatus = () => {
      const installed =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');

      setIsInstalled(installed);
      return installed;
    };

    // Handle install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the default browser install banner
      // Note: Chrome will show an info message about this in console - this is expected behavior
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);
    };

    // Handle app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };

    // Handle online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Handle service worker updates.
    // A page that loads with NO controlling SW receives its first
    // `controllerchange` when the freshly-installed SW calls clients.claim()
    // — that's the initial claim, not an update. Only a controller SWAP
    // counts; without this gate every first visit flagged a phantom update.
    let initialClaimPending = false;
    const handleSWUpdate = () => {
      // Don't set update available on auth pages to prevent refresh loops
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/')) {
        return;
      }
      if (initialClaimPending) {
        initialClaimPending = false;
        return;
      }
      setUpdateAvailable(true);
    };

    // Handle display mode changes
    const handleDisplayModeChange = () => {
      checkInstallStatus();
    };

    // Initial check
    checkInstallStatus();

    // Event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Display mode listener
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    // Dev-mode safety net: proactively unregister any leftover Serwist
    // production service worker + purge its caches. Without this, a stale
    // /sw.js from a previous `next build` run keeps firing
    // `bad-precaching-response` for font hashes that no longer exist in the
    // current dev bundle. Scope the sweep to /sw.js only — other workers
    // (e.g. /sw-dashboard.js for push at its dedicated narrow scope) must
    // not be unregistered or they race with their own registrations
    // elsewhere in the tree. (Root-scoped sw-dashboard.js leftovers are
    // handled by the dedicated cleanup below.)
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          const scriptURL =
            r.active?.scriptURL ??
            r.waiting?.scriptURL ??
            r.installing?.scriptURL ??
            '';
          if (scriptURL.endsWith('/sw.js')) {
            r.unregister().catch(() => {});
          }
        });
      }).catch(() => {});
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((n) => caches.delete(n).catch(() => {}));
        }).catch(() => {});
      }
    }

    // One-time cleanup for browsers already affected by the sw-dashboard.js
    // root-scope contention: it used to register without a scope option,
    // defaulting to scope '/', where it could replace /sw.js and (via
    // skipWaiting) steal page control / fire phantom update prompts. The push
    // worker now lives at the dedicated scope '/sw-dashboard-scope/' (see
    // components/dashboard/push-subscribe-button.tsx), so any leftover
    // ROOT-scoped sw-dashboard.js registration must be unregistered before
    // /sw.js (re)registers. Narrow-scoped registrations are left alone.
    // Runs for everyone (dev and production).
    let rootScopeCleanup: Promise<unknown> = Promise.resolve();
    if ('serviceWorker' in navigator) {
      rootScopeCleanup = navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          const rootScope = `${window.location.origin}/`;
          return Promise.all(
            regs.map((r) => {
              const scriptURL =
                r.active?.scriptURL ??
                r.waiting?.scriptURL ??
                r.installing?.scriptURL ??
                '';
              if (
                scriptURL.endsWith('/sw-dashboard.js') &&
                r.scope === rootScope
              ) {
                return r.unregister().catch(() => {});
              }
              return Promise.resolve();
            })
          );
        })
        .catch(() => {});
    }

    // Service worker setup - skip in development (Serwist only generates sw.js in production)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      // Check if SW is already registered to prevent multiple registrations.
      // Chained AFTER the root-scope cleanup so a leftover root-scoped
      // sw-dashboard.js registration is neither mistaken for /sw.js nor
      // blocking its (re)registration.
      rootScopeCleanup.then(() => navigator.serviceWorker.getRegistration()).then(existingRegistration => {
        if (existingRegistration) {
          return existingRegistration;
        }

        // Register service worker WITHOUT cache busting to prevent refresh loops
        return navigator.serviceWorker
          .register('/sw.js', { scope: '/' });
      }).then((registration) => {
        if (!registration) return;

        // Check for waiting service worker
        if (registration.waiting) {
          setUpdateAvailable(true);
        }

        // Listen for new service worker installations
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      }).catch((error) => {
      });

      initialClaimPending = !navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleSWUpdate
      );
    }

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else {
        mediaQuery.removeListener(handleDisplayModeChange);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleSWUpdate
        );
      }
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;


      if (outcome === 'accepted') {
        setCanInstall(false);
      }

      setDeferredPrompt(null);
    } catch (error) {
    }
  };

  const updateApp = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        // Arm the shared ONE-SHOT reload BEFORE sending skip waiting — the
        // old inline listener here stacked a fresh anonymous listener on
        // every call and never removed it.
        armReloadOnControllerChange();
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        // Another tab already activated the new SW — a plain (still
        // user-initiated) reload picks it up.
        window.location.reload();
      }
    } catch (error) {
      window.location.reload();
    }
  };

  const checkForUpdates = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    } catch (error) {
    }
  };

  const value: PWAContextType = {
    isInstalled,
    canInstall,
    updateAvailable,
    isOnline,
    isHydrated,
    installApp,
    updateApp,
    checkForUpdates
  };

  return (
    <PWAContext.Provider value={value}>
      {children}
      <UpdatePrompt />
    </PWAContext.Provider>
  );
}
