'use client';

/**
 * Selection Section Layout
 * Sub-nav for /learners-council/selection/*
 *
 * Client Component — see structure/layout.tsx for rationale.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import { Vote, UserPlus, Users, MessageSquare } from 'lucide-react';

const selectionTabs: SectionTab[] = [
  { href: '/learners-council/selection', icon: Vote, label: 'Overview', exact: true },
  { href: '/learners-council/selection/nominations', icon: UserPlus, label: 'Nominations' },
  { href: '/learners-council/selection/interviews', icon: MessageSquare, label: 'Interviews' },
  { href: '/learners-council/selection/elections', icon: Users, label: 'Elections' },
];

export default function SelectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={selectionTabs} />
      {children}
    </div>
  );
}
