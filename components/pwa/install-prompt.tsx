'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed-until';
const INSTALL_COMPLETED_KEY = 'pwa-install-completed';
const SHOWN_THIS_SESSION_KEY = 'pwa-install-shown';
const DISMISS_DURATION_DAYS = 7;
const AUTO_CLOSE_MS = 5000; // Auto-close after 5 seconds

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    const installCompleted =
      localStorage.getItem(INSTALL_COMPLETED_KEY) === 'true';

    const dismissedUntil = localStorage.getItem(INSTALL_DISMISSED_KEY);
    const isDismissed =
      dismissedUntil && new Date() < new Date(dismissedUntil);

    const shownThisSession =
      sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === 'true';

    if (isStandalone || installCompleted) {
      setIsInstalled(true);
      return;
    }

    setIsInstalled(false);

    if ('getInstalledRelatedApps' in navigator) {
      (navigator as any)
        .getInstalledRelatedApps()
        .then((apps: any[]) => {
          if (apps.length > 0) {
            setIsInstalled(true);
            localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
          }
        })
        .catch(() => {});
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      if (!isDismissed && !shownThisSession) {
        setTimeout(() => {
          setShowPrompt(true);
          sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, 'true');
        }, 10000);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
      localStorage.removeItem(INSTALL_DISMISSED_KEY);
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

  // Auto-close after 5 seconds
  useEffect(() => {
    if (!showPrompt) return;

    const timer = setTimeout(() => {
      setShowPrompt(false);
    }, AUTO_CLOSE_MS);

    return () => clearTimeout(timer);
  }, [showPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setShowPrompt(false);
        localStorage.setItem(INSTALL_COMPLETED_KEY, 'true');
      }
      setDeferredPrompt(null);
    } catch {
      // Handle silently
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + DISMISS_DURATION_DAYS);
    localStorage.setItem(INSTALL_DISMISSED_KEY, dismissUntil.toISOString());
  };

  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-4 py-3 w-72 sm:w-80">
        {/* App icon */}
        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-green-600 flex items-center justify-center">
          <Download className="h-5 w-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Install MyJKKN
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Faster &bull; Offline &bull; Native feel
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            onClick={handleInstall}
            size="sm"
            className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-2.5"
          >
            Install
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Dismiss"
            title="Remind me in 7 days"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Auto-close progress bar */}
      <div className="mt-1 mx-2 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-600 rounded-full"
          style={{
            animation: `shrink ${AUTO_CLOSE_MS}ms linear forwards`
          }}
        />
      </div>
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
