'use client';

/**
 * Parent Portal — Web Push subscription (client).
 *
 * Subscribes against the DEDICATED parent service worker (/parent-sw.js at scope
 * "/parent", registered by <ParentSWRegister/>), NOT the faculty /sw.js at scope
 * "/". Each registration owns its own push subscription, so the faculty push
 * provider can no longer clobber the parent endpoint. The subscription is then
 * registered with /api/parent/devices.
 */
import { useCallback, useEffect, useState } from 'react';
import { PARENT_SW_SCOPE, PARENT_SW_URL } from '@/components/parent/parent-sw-register';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Resolve the parent-scoped registration, registering /parent-sw.js if it isn't
 * up yet, and wait for it to be active before any pushManager call.
 */
async function getParentRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(PARENT_SW_SCOPE);
  const reg =
    existing && existing.scope.endsWith(PARENT_SW_SCOPE)
      ? existing
      : await navigator.serviceWorker.register(PARENT_SW_URL, {
          scope: PARENT_SW_SCOPE,
          updateViaCache: 'none',
        });

  if (reg.active) return reg;
  await new Promise<void>((resolve) => {
    const sw = reg.installing || reg.waiting;
    if (!sw) return resolve();
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') resolve();
    });
  });
  return reg;
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
    getParentRegistration()
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

      const reg = await getParentRegistration();
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
      const reg = await getParentRegistration();
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
