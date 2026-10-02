'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import type { SignOutNotice } from '@/lib/auth/sign-out-notices';

/**
 * "An admin signed you out of all devices on <date>." — shown once after the
 * next sign-in (Director ruling 2026-10-02). Asks `endpoint` for an unseen
 * notice, shows it, and marks it seen straight away so it never shows twice.
 * Renders nothing when there is no notice (and on any fetch failure).
 *
 *   staff / learners → /api/auth/sign-out-notice   (main app layout)
 *   parents          → /api/parent/sign-out-notice (parent app shell)
 */
export function SignOutNoticeBanner({ endpoint }: { endpoint: string }) {
  const [notice, setNotice] = useState<SignOutNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as { notice?: SignOutNotice | null };
        const found = json.notice;
        if (!found || cancelled) return;
        setNotice(found);
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: found.id }),
        }).catch(() => undefined);
      } catch {
        // A notice is a courtesy: never break the page over it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (!notice) return null;

  return (
    <div
      role='status'
      className='w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-8 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
    >
      <div className='flex min-w-0 items-center gap-3'>
        <Info className='h-4 w-4 shrink-0' aria-hidden />
        <p className='min-w-0 flex-1'>{notice.message}</p>
        <button
          type='button'
          aria-label='Close'
          onClick={() => setNotice(null)}
          className='grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/60'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
}
