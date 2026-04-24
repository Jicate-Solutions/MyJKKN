'use client';

import { HeartPulse } from 'lucide-react';
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

export default function CampusLivingWellnessPage() {
  return (
    <CampusLivingComingSoon
      title="Student Wellness"
      description="Pulse surveys, anonymous feedback collection, and critical-flag escalation so wardens can act before issues grow."
      feature="campus_living.wellness"
      icon={HeartPulse}
      bullets={[
        'Weekly pulse surveys (mood, sleep, food, homesickness) with configurable cadence',
        'Anonymous feedback channel routed to the right warden or mentor',
        'Automated critical-flag escalation (e.g. self-harm keywords, burnout signals)',
        'Counsellor dashboard with trend charts, at-risk lists, and intervention logs',
        'Per-block wellness scorecards to track mess, hygiene, and safety satisfaction',
      ]}
    />
  );
}
