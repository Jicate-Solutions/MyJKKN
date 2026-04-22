'use client';

/**
 * Structure Section Layout
 * Renders a sub-nav tab bar above all /learners-council/structure/* pages.
 *
 * NOTE: This layout is a Client Component because it passes lucide-react
 * icon components (function references) through the tabs array into
 * SectionSubNav. Next.js 15 cannot serialize function props across the
 * Server→Client boundary. Marking the layout "use client" keeps children
 * (pages) as Server Components — they render fine as children props.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import {
  Network,
  Users,
  Briefcase,
  Layers,
  Calendar,
  Grid3x3
} from 'lucide-react';

// NOTE: YUVA Chapters intentionally moved to top-level LC nav.
// YUVA operates independently from the Learners Council — the only link is
// the one-way progression path (previous-year Yuva Chairs are eligible for LC
// promotion). YUVA is NOT a sub-section of LC Structure.
const structureTabs: SectionTab[] = [
  { href: '/learners-council/structure', icon: Network, label: 'Overview', exact: true },
  { href: '/learners-council/structure/members', icon: Users, label: 'Members' },
  { href: '/learners-council/structure/positions', icon: Briefcase, label: 'Positions' },
  { href: '/learners-council/structure/committees', icon: Layers, label: 'Portfolio Committees' },
  { href: '/learners-council/structure/terms', icon: Calendar, label: 'Terms' },
  { href: '/learners-council/structure/verticals', icon: Grid3x3, label: 'Verticals' },
];

export default function StructureLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={structureTabs} />
      {children}
    </div>
  );
}
