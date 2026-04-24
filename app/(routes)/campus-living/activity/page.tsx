'use client';

import { Activity } from 'lucide-react';
import { CampusLivingComingSoon } from '../_components/coming-soon';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

export default function CampusLivingActivityPage() {
  return (
    <CampusLivingComingSoon
      title="Activity Feed"
      description="Real-time stream of attendance, leave, gate-pass, maintenance, and incident events across all hostels."
      feature="campus_living.activity"
      icon={Activity}
      bullets={[
        'Filter activity by block, event type, or time range',
        'See who marked attendance, approved leaves, and closed tickets',
        'Drill into each event to view before/after state',
        'Subscribe to activity digests by email or in-app',
      ]}
    />
  );
}
