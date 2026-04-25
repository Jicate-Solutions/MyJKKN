'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PushNotificationsContext,
  PushNotificationState,
  urlBase64ToUint8Array
} from '@/hooks/use-push-notifications';
import toast from 'react-hot-toast';

interface PushNotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Wait for a service worker registration to reach the "activated" state.
 * Returns the active ServiceWorker once ready, or throws after timeout.
 */
async function waitForActivation(
  registration: ServiceWorkerRegistration,
  timeoutMs = 10000
): Promise<ServiceWorker> {
  // Already activated
  if (registration.active) return registration.active;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Service worker activation timed out'));
    }, timeoutMs);

    const sw = registration.installing || registration.waiting;
    if (!sw) {
      clearTimeout(timeout);
      reject(new Error('No service worker found to wait for'));
      return;
    }

    const onStateChange = () => {
      if (sw.state === 'activated') {
        clearTimeout(timeout);
        sw.removeEventListener('statechange', onStateChange);
        resolve(sw);
      } else if (sw.state === 'redundant') {
        clearTimeout(timeout);
        sw.removeEventListener('statechange', onStateChange);
        reject(new Error('Service worker became redundant'));
      }
    };

    sw.addEventListener('statechange', onStateChange);
  });
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

  // Track whether the current error came from an auto-resubscribe attempt
  // so we can suppress the toast for transient failures
  const isAutoResubscribeRef = useRef(false);
  // Track whether we've already done a mobile force-resubscribe this session
  // to prevent the init→auto-resubscribe→init infinite loop
  const hasForceResubscribedRef = useRef(false);

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

    // Serwist only generates a valid /sw.js in production builds. In dev
    // the file is either missing or a stale artifact from a past prod build
    // whose precache manifest 404s against the current dev bundle
    // (bad-precaching-response). Skip registration entirely in dev — push
    // testing happens in prod/preview deployments.
    if (process.env.NODE_ENV !== 'production') {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const init = async () => {
      try {
        // Get or register service worker
        let registration: ServiceWorkerRegistration;
        const existingReg = await navigator.serviceWorker.getRegistration('/');
        if (existingReg) {
          registration = existingReg;
          // Force check for updated sw.js — critical for mobile PWA where
          // the cached service worker may lack push event handlers
          registration.update().catch(() => {});
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

        // Wait for SW to be fully activated before checking push state
        await navigator.serviceWorker.ready;
        if (!registration.active) {
          await waitForActivation(registration);
        }

        // Check for existing browser-side subscription
        const subscription =
          await registration.pushManager.getSubscription();

        if (subscription) {
          // Verify subscription is saved server-side
          verifyServerSubscription(subscription);
        }

        // On mobile, browser subscriptions go stale frequently (app killed,
        // deep sleep, FCM token rotation). Force a one-time resubscribe per
        // session to refresh the endpoint — but only once to avoid loops.
        const isMobileOrPWA =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          window.matchMedia('(display-mode: standalone)').matches;

        const shouldForceResubscribe =
          isMobileOrPWA &&
          Notification.permission === 'granted' &&
          !!subscription &&
          !hasForceResubscribedRef.current;

        if (shouldForceResubscribe) {
          hasForceResubscribedRef.current = true;
        }

        setState((prev) => ({
          ...prev,
          isSubscribed: shouldForceResubscribe ? false : !!subscription,
          subscription: shouldForceResubscribe ? null : subscription,
          isLoading: false,
          permission: Notification.permission,
          error: null
        }));
      } catch (error) {
        console.error('Push notification init failed:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null // Don't show error toast for init failures
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

    // Match the init effect above: push testing only happens in prod/preview.
    // In dev there is no registered SW for /sw.js, so subscribe() would loop
    // forever with AbortError / storage-error spam whenever a user previously
    // granted notification permission in a prod build.
    if (process.env.NODE_ENV !== 'production') return;

    // Permission granted but no active subscription → re-subscribe silently
    if (state.permission === 'granted' && !state.isSubscribed) {
      const timer = setTimeout(async () => {
        try {
          isAutoResubscribeRef.current = true;
          const success = await doSubscribe();
          if (success) {
            // Mark as force-resubscribed so init won't reset isSubscribed again
            hasForceResubscribedRef.current = true;
          }
        } catch (err) {
          console.warn('Auto-resubscribe failed (will retry next load):', err);
        } finally {
          isAutoResubscribeRef.current = false;
        }
      }, 1000); // SW is already activated by init, short delay is sufficient
      return () => clearTimeout(timer);
    }
  }, [state.isSupported, state.isLoading, state.permission, state.isSubscribed]);

  // ─── 4. Show error toast (only for user-initiated actions) ───
  useEffect(() => {
    if (state.error && !isAutoResubscribeRef.current) {
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

      // Wait for service worker to be fully ready and activated
      const registration = await navigator.serviceWorker.ready;

      // Ensure SW is in activated state before subscribing to push
      if (!registration.active) {
        await waitForActivation(registration);
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error('VAPID public key not found');

      // Unsubscribe any existing stale subscription first to avoid conflicts
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        try {
          await existingSub.unsubscribe();
        } catch {
          // Ignore — stale sub cleanup is best-effort
        }
      }

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
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to subscribe';

      // For auto-resubscribe, suppress error state to avoid toast spam
      if (isAutoResubscribeRef.current) {
        console.warn('Auto-resubscribe failed silently:', errorMessage);
        setState((prev) => ({
          ...prev,
          isLoading: false
          // Don't set error — suppresses toast
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage
        }));
      }
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
