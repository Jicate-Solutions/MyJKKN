/**
 * Structure Section Layout
 * Renders a sub-nav tab bar above all /learners-council/structure/* pages.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import {
  Network,
  Users,
  Briefcase,
  Layers,
  Calendar,
  Building2,
  Grid3x3
} from 'lucide-react';

const structureTabs: SectionTab[] = [
  { href: '/learners-council/structure', icon: Network, label: 'Overview', exact: true },
  { href: '/learners-council/structure/members', icon: Users, label: 'Members' },
  { href: '/learners-council/structure/positions', icon: Briefcase, label: 'Positions' },
  { href: '/learners-council/structure/committees', icon: Layers, label: 'Portfolio Committees' },
  { href: '/learners-council/structure/terms', icon: Calendar, label: 'Terms' },
  { href: '/learners-council/structure/yuva', icon: Building2, label: 'YUVA Chapters' },
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
