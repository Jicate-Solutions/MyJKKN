'use client';

/**
 * YUVA Section Layout
 * Sub-nav for /learners-council/yuva/*
 *
 * Client Component — lucide-react icons are function references and cannot
 * be serialized across the Server→Client boundary into SectionSubNav
 * (which is itself 'use client'). See structure/layout.tsx for the same
 * pattern; children pages remain Server Components via the {children}
 * prop passthrough.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import { Building2, Users } from 'lucide-react';

const yuvaTabs: SectionTab[] = [
  { href: '/learners-council/yuva', icon: Building2, label: 'Chapters', exact: true },
  { href: '/learners-council/yuva/members', icon: Users, label: 'Members' },
];

export default function YUVALayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={yuvaTabs} />
      {children}
    </div>
  );
}
