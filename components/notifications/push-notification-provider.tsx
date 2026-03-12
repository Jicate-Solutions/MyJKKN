'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PushNotificationsContext,
  PushNotificationState,
  urlBase64ToUint8Array
} from '@/hooks/use-push-notifications';
import toast from 'react-hot-toast';

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

export function PushNotificationProvider({
  children
}: PushNotificationProviderProps) {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: 'default',
    subscription: null,
    isLoading: true,
    error: null
  });

  // ─── 1. Check browser support ────────────────────────────────
  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setState((prev) => ({
      ...prev,
      isSupported,
      permission: isSupported ? Notification.permission : 'denied'
    }));
  }, []);

  // ─── 2. Register SW and check existing subscription ──────────
  useEffect(() => {
    if (!state.isSupported) return;

    const init = async () => {
      try {
        // Get or register service worker
        let registration: ServiceWorkerRegistration;
        const existingReg = await navigator.serviceWorker.getRegistration('/');
        if (existingReg) {
          registration = existingReg;
        } else {
          try {
            registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/',
              updateViaCache: 'none'
            });
          } catch {
            // sw.js not available (e.g. fresh dev build) — silently bail
            setState((prev) => ({ ...prev, isLoading: false }));
            return;
          }
        }

        await navigator.serviceWorker.ready;

        // Check for existing browser-side subscription
        const subscription =
          await registration.pushManager.getSubscription();

        if (subscription) {
          // Subscription exists in browser — verify it's saved server-side too
          // (handles case where browser has subscription but DB doesn't)
          verifyServerSubscription(subscription);
        }

        setState((prev) => ({
          ...prev,
          isSubscribed: !!subscription,
          subscription,
          isLoading: false,
          error: null
        }));
      } catch (error) {
        console.error('Push notification init failed:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Init failed: ${error instanceof Error ? error.message : 'Unknown'}`
        }));
      }
    };

    init();
  }, [state.isSupported]);

  // ─── 3. Auto-subscribe when permission is already granted ────
  //     This handles mobile re-opens where the subscription expired
  //     but the user previously granted permission.
  useEffect(() => {
    if (!state.isSupported || state.isLoading) return;

    // Permission granted but no active subscription → re-subscribe silently
    if (state.permission === 'granted' && !state.isSubscribed) {
      const timer = setTimeout(async () => {
        try {
          await doSubscribe();
        } catch (err) {
          console.error('Auto-resubscribe failed:', err);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.isSupported, state.isLoading, state.permission, state.isSubscribed]);

  // ─── 4. Show error toast ─────────────────────────────────────
  useEffect(() => {
    if (state.error) {
      toast.error(`Notification Error: ${state.error}`, { duration: 5000 });
    }
  }, [state.error]);

  // ─── Verify subscription exists server-side ──────────────────
  const verifyServerSubscription = async (subscription: PushSubscription) => {
    try {
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription })
      });
      // 200 = already exists or newly saved — either way, we're good
      if (!response.ok) {
        console.warn('Failed to verify server subscription:', response.status);
      }
    } catch {
      // Non-critical — don't block the UI
    }
  };

  // ─── Request permission ──────────────────────────────────────
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((prev) => ({
        ...prev,
        error: 'Push notifications not supported'
      }));
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting permission:', error);
      setState((prev) => ({ ...prev, error: 'Failed to request permission' }));
      return false;
    }
  }, [state.isSupported]);

  // ─── Core subscribe logic (shared by auto-subscribe & manual) ─
  const doSubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    // Ensure permission
    let currentPermission = state.permission;
    if (currentPermission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return false;
      currentPermission = 'granted';
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const registration = await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error('VAPID public key not found');

      // Create new push subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey
        ) as BufferSource
      });

      // Save to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription to server');
      }

      // Update shared state — all consumers (banner, settings, etc.) see this
      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        subscription,
        isLoading: false,
        error: null
      }));

      return true;
    } catch (error) {
      console.error('Subscribe error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe'
      }));
      return false;
    }
  }, [state.isSupported, state.permission, requestPermission]);

  // ─── Unsubscribe ─────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.subscription) return true;

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      await state.subscription.unsubscribe();

      // Remove from server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: state.subscription.endpoint })
      });

      if (!response.ok) {
        console.warn('Failed to remove subscription from server');
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        subscription: null,
        isLoading: false,
        error: null
      }));

      return true;
    } catch (error) {
      console.error('Unsubscribe error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to unsubscribe'
      }));
      return false;
    }
  }, [state.subscription]);

  return (
    <PushNotificationsContext.Provider
      value={{
        ...state,
        requestPermission,
        subscribe: doSubscribe,
        unsubscribe
      }}
    >
      {children}
    </PushNotificationsContext.Provider>
  );
}
