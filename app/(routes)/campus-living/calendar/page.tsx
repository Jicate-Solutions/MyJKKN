'use client';

import { CalendarDays } from 'lucide-react';
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

export default function CampusLivingCalendarPage() {
  return (
    <CampusLivingComingSoon
      title="Campus Living Calendar"
      description="Unified calendar view of leaves, gate passes, maintenance windows, mess menu cycles, and community events."
      feature="campus_living.calendar"
      icon={CalendarDays}
      bullets={[
        'Month / week / day views powered by react-big-calendar',
        'Colour-coded event categories (leave, gate pass, maintenance, event)',
        'Drag-to-reschedule maintenance windows and community events',
        'Export to iCal for wardens and block coordinators',
      ]}
    />
  );
}
