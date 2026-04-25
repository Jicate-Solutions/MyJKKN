'use client';

/**
 * Dashboard v2 — Push Subscribe Button
 *
 * Client component. Handles:
 *   1. Service worker registration (/sw-dashboard.js)
 *   2. Notification permission prompt
 *   3. Push subscription (VAPID-based)
 *   4. POST to /api/dashboard/push-subscribe to persist
 *
 * States:
 *   - unsupported → browser doesn't support Push API (hidden)
 *   - denied     → user rejected permission (guidance to re-enable)
 *   - idle       → default CTA (Enable alerts)
 *   - subscribed → opt-out CTA
 *   - working    → in-flight
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.4
 */

import { useCallback, useEffect, useState } from 'react';

type PushState = 'checking' | 'unsupported' | 'denied' | 'idle' | 'subscribed' | 'working';

// Convert VAPID public key from base64url to Uint8Array (required by pushManager.subscribe)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushSubscribeButton({
  vapidPublicKey
}: {
  vapidPublicKey?: string;
}) {
  const [state, setState] = useState<PushState>('checking');

  // Bootstrap: register service worker and detect current state
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState('unsupported');
      return;
    }

    (async () => {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration('/sw-dashboard.js')) ??
          (await navigator.serviceWorker.register('/sw-dashboard.js'));
        // Best-effort update check. If the registration was invalidated by
        // another tab or a hot reload between register() and update(), the
        // browser throws "Not found" — that's transient, not fatal. Push
        // subscription state is still readable from `reg` below.
        try {
          await reg.update();
        } catch {
          // ignore — registration is still usable
        }

        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }

        const existing = await reg.pushManager.getSubscription();
        setState(existing ? 'subscribed' : 'idle');
      } catch (err) {
        console.error('[push] bootstrap error', err);
        setState('unsupported');
      }
    })();
  }, []);

  const handleEnable = useCallback(async () => {
    if (!vapidPublicKey) {
      console.warn('[push] VAPID public key not configured');
      alert('Push alerts require VAPID keys to be configured. Contact your admin.');
      return;
    }
    setState('working');
    try {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setState('denied');
          return;
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      const res = await fetch('/api/dashboard/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'subscribe_failed');

      setState('subscribed');
    } catch (err) {
      console.error('[push] enable error', err);
      setState('idle');
      alert(
        err instanceof Error
          ? `Could not enable push: ${err.message}`
          : 'Could not enable push alerts.'
      );
    }
  }, [vapidPublicKey]);

  const handleDisable = useCallback(async () => {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState('idle');
        return;
      }

      await fetch('/api/dashboard/push-subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });

      await sub.unsubscribe();
      setState('idle');
    } catch (err) {
      console.error('[push] disable error', err);
      setState('subscribed');
    }
  }, []);

  if (state === 'checking' || state === 'unsupported') return null;

  if (state === 'denied') {
    return (
      <div className='inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800'>
        <span>🔕</span>
        <span>
          Push alerts blocked in browser settings.{' '}
          <a
            href='https://support.google.com/chrome/answer/3220216'
            target='_blank'
            rel='noreferrer'
            className='underline'
          >
            Re-enable
          </a>
        </span>
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <button
        type='button'
        onClick={handleDisable}
        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors'
        aria-label='Disable push alerts'
      >
        <span>🔔</span>
        <span>Push alerts on · click to disable</span>
      </button>
    );
  }

  return (
    <button
      type='button'
      onClick={handleEnable}
      disabled={state === 'working'}
      className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50'
    >
      <span>🔔</span>
      <span>
        {state === 'working' ? 'Enabling…' : 'Enable push alerts'}
      </span>
    </button>
  );
}
