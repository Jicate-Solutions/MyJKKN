'use client';

/**
 * Dashboard v2 — Morning Brief dismissible wrapper (client)
 *
 * Hides the brief after dismiss for the rest of the day (localStorage key per date).
 * Reappears automatically next calendar day.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.7
 */

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'myjkkn-dashboard-morning-brief-dismissed-';

export function MorningBriefDismissible({
  dateKey,
  children
}: {
  dateKey: string;
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null); // null = checking

  useEffect(() => {
    try {
      const key = `${STORAGE_PREFIX}${dateKey}`;
      setDismissed(window.localStorage.getItem(key) === '1');
    } catch {
      setDismissed(false);
    }
  }, [dateKey]);

  const handleDismiss = () => {
    try {
      const key = `${STORAGE_PREFIX}${dateKey}`;
      window.localStorage.setItem(key, '1');
    } catch {
      /* ignore storage errors */
    }
    setDismissed(true);
  };

  // Hydration guard: render nothing until we've checked localStorage (avoids flash)
  if (dismissed === null) return null;
  if (dismissed) return null;

  return (
    <div className='relative'>
      {children}
      <button
        type='button'
        onClick={handleDismiss}
        className='absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-white/60 dark:hover:bg-neutral-800/80 transition-colors'
        aria-label='Dismiss morning brief'
      >
        ✕
      </button>
    </div>
  );
}
