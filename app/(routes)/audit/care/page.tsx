// app/(routes)/audit/care/page.tsx
// CARE hub — the CARE list lives on the audit dashboard (spec §5), so the
// bare /audit/care URL redirects there (hub pattern: app/(routes)/audit/page.tsx).

import { redirect } from 'next/navigation';

/**
 * navMeta — reached by trimming a /audit/care/[cycleId] URL; canonical entry
 * is the dashboard CARE section. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/audit/dashboard',
} as const;

export default function CareIndexPage() {
  redirect('/audit/dashboard');
}
