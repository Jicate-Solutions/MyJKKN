'use client';

/**
 * Communication Section Layout
 * Sub-nav for /learners-council/communication/*
 *
 * Client Component — see structure/layout.tsx for rationale.
 */

import { SectionSubNav, type SectionTab } from '../_components/section-subnav';
import { Megaphone, BarChart3, MessagesSquare, MessageCircle, Send, ShieldCheck } from 'lucide-react';

const communicationTabs: SectionTab[] = [
  { href: '/learners-council/communication', icon: Megaphone, label: 'Announcements', exact: true },
  { href: '/learners-council/communication/polls', icon: BarChart3, label: 'Polls' },
  { href: '/learners-council/communication/forums', icon: MessagesSquare, label: 'Forums' },
  { href: '/learners-council/communication/chat', icon: MessageCircle, label: 'Chat' },
  // Both broadcast screens are listed for everyone, the same way OD Approvals
  // is. The approvals page decides access itself and says so out loud when it
  // refuses — a hidden tab would leave somebody with no way to find out who
  // the approver is.
  { href: '/learners-council/communication/broadcasts', icon: Send, label: 'My Broadcasts', exact: true },
  { href: '/learners-council/communication/broadcasts/approvals', icon: ShieldCheck, label: 'Broadcast Approvals' },
];

export default function CommunicationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionSubNav tabs={communicationTabs} />
      {children}
    </div>
  );
}
