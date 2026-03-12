'use client';

import { useEffect } from 'react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import toast from 'react-hot-toast';

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

export function PushNotificationProvider({
  children
}: PushNotificationProviderProps) {
  const {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    isLoading,
    error
  } = usePushNotifications();

  useEffect(() => {
    if (!isSupported || isLoading) return;

    // If permission is already granted but not subscribed, auto-subscribe silently
    // (The persistent banner handles the case where permission is 'default')
    if (permission === 'granted' && !isSubscribed) {
      const autoSubscribe = async () => {
        try {
          await subscribe();
        } catch (err) {
          console.error('Failed to auto-subscribe to push notifications:', err);
        }
      };

      const timer = setTimeout(autoSubscribe, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, permission, isSubscribed, isLoading, subscribe]);

  // Show error toast if there's an error
  useEffect(() => {
    if (error) {
      toast.error(`Notification Error: ${error}`, {
        duration: 5000
      });
    }
  }, [error]);

  return <>{children}</>;
}
