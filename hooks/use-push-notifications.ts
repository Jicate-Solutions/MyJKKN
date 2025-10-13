'use client';

import { useState, useEffect, useCallback } from 'react';

interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: 'default',
    subscription: null,
    isLoading: false,
    error: null
  });

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = () => {
      const isSupported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      setState((prev) => ({
        ...prev,
        isSupported,
        permission: isSupported ? Notification.permission : 'denied'
      }));
    };

    checkSupport();
  }, []);

  // Register service worker and check subscription status
  useEffect(() => {
    if (!state.isSupported) return;

    const registerServiceWorkerAndCheckSubscription = async () => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        // Check if service worker is available
        if (!('serviceWorker' in navigator)) {
          throw new Error('Service Worker not supported');
        }

        // Wait a bit to ensure the page is fully loaded
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Register service worker with better error handling
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none'
        });

       

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Check existing subscription
        const subscription = await registration.pushManager.getSubscription();

        setState((prev) => ({
          ...prev,
          isSubscribed: !!subscription,
          subscription,
          isLoading: false,
          error: null
        }));
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: `Failed to register service worker: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        }));
      }
    };

    registerServiceWorkerAndCheckSubscription();
  }, [state.isSupported]);

  // Request notification permission
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
      console.error('Error requesting notification permission:', error);
      setState((prev) => ({ ...prev, error: 'Failed to request permission' }));
      return false;
    }
  }, [state.isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((prev) => ({
        ...prev,
        error: 'Push notifications not supported'
      }));
      return false;
    }

    if (state.permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return false;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const registration = await navigator.serviceWorker.ready;

      // Convert VAPID key from environment or use a default
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        throw new Error('VAPID public key not found');
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey
        ) as BufferSource
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subscription })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        subscription,
        isLoading: false,
        error: null
      }));

      return true;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe'
      }));
      return false;
    }
  }, [state.isSupported, state.permission, requestPermission]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.subscription) return true;

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // Unsubscribe from browser
      await state.subscription.unsubscribe();

      // Remove subscription from server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
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
      console.error('Error unsubscribing from push notifications:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to unsubscribe'
      }));
      return false;
    }
  }, [state.subscription]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
