'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session (client-side only)
    if (typeof window !== 'undefined') {
      const dismissed = sessionStorage.getItem('updatePromptDismissed');
      if (dismissed) {
        setIsDismissed(true);
        return;
      }
    }
  }, []);

  useEffect(() => {
    let registration: ServiceWorkerRegistration | null = null;

    const checkForUpdates = async () => {
      if ('serviceWorker' in navigator) {
        try {
          registration = await navigator.serviceWorker.ready;

          // Check if there's a waiting service worker
          if (registration.waiting) {
            setShowPrompt(true);
          }

          // Listen for new service worker installations
          registration.addEventListener('updatefound', () => {
            const newWorker = registration!.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  setShowPrompt(true);
                }
              });
            }
          });

          // Listen for controller changes (new SW activated)
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        } catch (error) {
          // Handle update check error silently
        }
      }
    };

    checkForUpdates();

    // Check for updates periodically (every 30 minutes)
    const interval = setInterval(() => {
      if (registration) {
        registration.update();
      }
    }, 30 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      setIsUpdating(true);

      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        // Tell the waiting service worker to skip waiting and become active
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // The controllerchange event will trigger a page reload
    } catch (error) {
      setIsUpdating(false);
      // Fallback: force reload
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsDismissed(true);
    // Don't show again for this session
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('updatePromptDismissed', 'true');
    }
  };

  // Don't show if dismissed in this session
  if (isDismissed) {
    return null;
  }

  if (!showPrompt) {
    return null;
  }

  return (
    <Card className='fixed bottom-4 left-4 z-50 w-80 shadow-lg border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800'>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-800'>
              <RefreshCw className='h-4 w-4 text-green-600 dark:text-green-300' />
            </div>
            <CardTitle className='text-sm text-green-900 dark:text-green-100'>
              Update Available
            </CardTitle>
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleDismiss}
            className='h-6 w-6 p-0 text-green-600 hover:text-green-700 dark:text-green-300'
            disabled={isUpdating}
          >
            <X className='h-3 w-3' />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className='mb-3 text-xs text-green-700 dark:text-green-200'>
          A new version of MyJKKN is available with bug fixes and improvements.
        </CardDescription>
        <div className='flex gap-2'>
          <Button
            onClick={handleUpdate}
            size='sm'
            className='flex-1 bg-green-600 hover:bg-green-700 text-white'
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <RefreshCw className='mr-2 h-3 w-3 animate-spin' />
                Updating...
              </>
            ) : (
              <>
                <RefreshCw className='mr-2 h-3 w-3' />
                Update Now
              </>
            )}
          </Button>
          <Button
            onClick={handleDismiss}
            variant='outline'
            size='sm'
            className='border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300'
            disabled={isUpdating}
          >
            Later
          </Button>
        </div>
        <div className='mt-2 text-xs text-green-600 dark:text-green-300'>
          • Latest features • Bug fixes • Performance improvements
        </div>
      </CardContent>
    </Card>
  );
}
