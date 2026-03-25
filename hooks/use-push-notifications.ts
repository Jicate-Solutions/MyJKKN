'use client';

import { createContext, useContext } from 'react';

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  isLoading: boolean;
  error: string | null;
}

export interface PushNotificationContextValue extends PushNotificationState {
  requestPermission: () => Promise<boolean>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

const defaultValue: PushNotificationContextValue = {
  isSupported: false,
  isSubscribed: false,
  permission: 'default',
  subscription: null,
  isLoading: true,
  error: null,
  requestPermission: async () => false,
  subscribe: async () => false,
  unsubscribe: async () => false
};

export const PushNotificationsContext =
  createContext<PushNotificationContextValue>(defaultValue);

/**
 * Hook to access push notification state and actions.
 * Must be used within PushNotificationProvider.
 * All consumers share the same state — when one subscribes, all see isSubscribed: true.
 */
export function usePushNotifications(): PushNotificationContextValue {
  return useContext(PushNotificationsContext);
}

// Helper function to convert VAPID key
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
