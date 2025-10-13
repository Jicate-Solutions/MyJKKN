'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { InstallPrompt } from './install-prompt';
import { UpdatePrompt } from './update-prompt';

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

    // Handle service worker updates
    const handleSWUpdate = () => {
      // Don't set update available on auth pages to prevent refresh loops
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/')) {
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

    // Service worker setup
    if ('serviceWorker' in navigator) {
      // Check if SW is already registered to prevent multiple registrations
      navigator.serviceWorker.getRegistration().then(existingRegistration => {
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
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Wait for controllerchange event instead of forcing reload
      }
    } catch (error) {
      // Don't force reload, just ignore the error
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
      <InstallPrompt />
      <UpdatePrompt />
    </PWAContext.Provider>
  );
}
