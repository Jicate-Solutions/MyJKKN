'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import toast from 'react-hot-toast';

const SNOOZE_KEY = 'push-notification-banner-snoozed-until';
const SNOOZE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const SHOW_DELAY_MS = 2000; // Wait before showing to avoid flicker during auto-resubscribe

export function PushNotificationBanner() {
  const {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    isLoading
  } = usePushNotifications();

  const [snoozed, setSnoozed] = useState(true); // Start hidden to avoid flash
  const [showReady, setShowReady] = useState(false); // Delay showing to avoid flicker
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Check snooze state on mount
  useEffect(() => {
    const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) {
      setSnoozed(true);
    } else {
      localStorage.removeItem(SNOOZE_KEY);
      setSnoozed(false);
    }
  }, []);

  // Debounce banner visibility to prevent flicker during auto-resubscribe.
  // Only show after the state has been stable (not subscribed) for SHOW_DELAY_MS.
  const shouldShow = isSupported && !isSubscribed && !isLoading && !snoozed;

  useEffect(() => {
    if (shouldShow) {
      showTimerRef.current = setTimeout(() => setShowReady(true), SHOW_DELAY_MS);
    } else {
      clearTimeout(showTimerRef.current);
      setShowReady(false);
    }
    return () => clearTimeout(showTimerRef.current);
  }, [shouldShow]);

  if (!showReady) {
    return null;
  }

  // If permission is denied, show a different message
  const isDenied = permission === 'denied';

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      toast.success('Push notifications enabled!');
    }
  };

  const handleSnooze = () => {
    const snoozedUntil = Date.now() + SNOOZE_DURATION_MS;
    localStorage.setItem(SNOOZE_KEY, String(snoozedUntil));
    setSnoozed(true);
  };

  return (
    <div className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm z-50">
      <div className="flex items-center gap-3 min-w-0 ml-4">
        <Bell className="h-4 w-4 flex-shrink-0 animate-[ring_1s_ease-in-out_infinite]" />
        <p className="text-sm font-medium truncate">
          {isDenied
            ? 'Push notifications are blocked. Please enable them in your browser settings (click the lock icon in the address bar).'
            : 'Enable push notifications to receive important updates, alerts, and announcements instantly.'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {!isDenied && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleEnable}
            disabled={isLoading}
            className="h-7 text-xs font-semibold bg-white text-green-700 hover:bg-green-50"
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Enable Now
          </Button>
        )}
        <button
          onClick={handleSnooze}
          className="text-white/80 hover:text-white p-1 rounded-sm hover:bg-white/10 transition-colors"
          aria-label="Dismiss for now"
          title="Remind me later (4 hours)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
