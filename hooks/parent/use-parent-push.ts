'use client';

/**
 * Parent Portal — Web Push subscription (client).
 *
 * Reuses the app-wide service worker (serwist /sw.js, already registered) and
 * subscribes with the public VAPID key, then registers the subscription with
 * /api/parent/devices. No changes to the shared SW — only the /parent flow.
 */
import { useCallback, useEffect, useState } from 'react';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function useParentPush() {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID;

  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reflect current subscription state on mount.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, [supported]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID as string),
        }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch('/api/parent/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) return false;
      setEnabled(true);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const disable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      // Server rows are pruned automatically on the next failed send (404/410).
      setEnabled(false);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, enabled, loading, enable, disable };
}
