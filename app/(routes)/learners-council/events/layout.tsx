'use client';

/**
 * Events Section Layout
 * Sub-nav for /learners-council/events/*
 *
 * Client Component — see structure/layout.tsx for rationale.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import { CalendarCheck, CalendarDays, FileText } from 'lucide-react';

const eventsTabs: SectionTab[] = [
  { href: '/learners-council/events', icon: CalendarCheck, label: 'All Events', exact: true },
  { href: '/learners-council/events/calendar', icon: CalendarDays, label: 'Calendar' },
  { href: '/learners-council/events/proposals', icon: FileText, label: 'Proposals' },
];

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={eventsTabs} />
      {children}
    </div>
  );
}
