'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/admission/marketing',
} as const;

export default function CampaignsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admission/marketing/campaigns/monitoring');
  }, [router]);

  return null;
}
