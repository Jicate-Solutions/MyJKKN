'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      );
    };

    if (checkInstalled()) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Don't show immediately - wait for user to interact with the site
      setTimeout(() => {
        if (typeof window !== 'undefined' && !sessionStorage.getItem('installPromptDismissed')) {
          setShowPrompt(true);
        }
      }, 30000); // Show after 30 seconds
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('installPromptDismissed');
      }
    };

    const handleVisibilityChange = () => {
      // If user returns to tab and it's now standalone, they installed it
      if (!document.hidden && checkInstalled() && !isInstalled) {
        handleAppInstalled();
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setShowPrompt(false);
        // The appinstalled event will handle the rest
      }

      setDeferredPrompt(null);
    } catch (error) {
      // Handle installation error silently
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for this session
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('installPromptDismissed', 'true');
    }
  };

  const handleLater = () => {
    setShowPrompt(false);
    // Show again after 24 hours
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    if (typeof window !== 'undefined') {
      localStorage.setItem('installPromptDismissedUntil', tomorrow.toISOString());
    }
  };

  // Don't show if:
  // - Already installed
  // - No deferred prompt available
  // - User dismissed it
  // - Not showing
  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  // Check if user dismissed until later (client-side only)
  if (typeof window !== 'undefined') {
    const dismissedUntil = localStorage.getItem('installPromptDismissedUntil');
    if (dismissedUntil && new Date() < new Date(dismissedUntil)) {
      return null;
    }
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
              <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <CardTitle className="text-sm text-blue-900 dark:text-blue-100">
              Install MyJKKN
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 dark:text-blue-300"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-3 text-xs text-blue-700 dark:text-blue-200">
          Install MyJKKN app for faster access, offline functionality, and native app experience.
        </CardDescription>
        <div className="flex gap-2">
          <Button
            onClick={handleInstall}
            size="sm"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="mr-2 h-3 w-3" />
            Install
          </Button>
          <Button
            onClick={handleLater}
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300"
          >
            Later
          </Button>
        </div>
        <div className="mt-2 text-xs text-blue-600 dark:text-blue-300">
          • Works offline
          • Faster loading
          • Native app feel
        </div>
      </CardContent>
    </Card>
  );
}