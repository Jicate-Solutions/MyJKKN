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
    requestPermission,
    error
  } = usePushNotifications();

  useEffect(() => {
    // Auto-request permission and subscribe if supported and not already done
    const initializePushNotifications = async () => {
      if (!isSupported) return;

      // If permission is default, show a toast to ask user
      if (permission === 'default') {
        toast('Enable Notifications', {
          
        });
      }
      // If permission is granted but not subscribed, auto-subscribe
      else if (permission === 'granted' && !isSubscribed) {
        try {
          await subscribe();
        } catch (error) {
          console.error(
            'Failed to auto-subscribe to push notifications:',
            error
          );
        }
      }
    };

    // Delay initialization to avoid showing toast immediately on page load
    const timer = setTimeout(initializePushNotifications, 3000);

    return () => clearTimeout(timer);
  }, [isSupported, permission, isSubscribed, requestPermission, subscribe]);

  // Log push notification errors silently - don't show disruptive toasts
  // Push notifications are a non-critical background feature
  useEffect(() => {
    if (error) {
      console.warn('[notifications] Push notification setup failed:', error);
    }
  }, [error]);

  return <>{children}</>;
}
