'use client';

/**
 * OD Section Layout
 * Sub-nav for /learners-council/od/*
 *
 * Client Component — see structure/layout.tsx for rationale.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import { ClipboardSignature, CheckSquare, Workflow } from 'lucide-react';

const odTabs: SectionTab[] = [
  { href: '/learners-council/od', icon: ClipboardSignature, label: 'My Requests', exact: true },
  { href: '/learners-council/od/approvals', icon: CheckSquare, label: 'Approvals' },
  { href: '/learners-council/od/chains', icon: Workflow, label: 'Approval Chains' },
];

export default function ODLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={odTabs} />
      {children}
    </div>
  );
}
