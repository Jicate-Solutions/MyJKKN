'use client';

/**
 * Marketing Section Layout (3-tier pattern)
 *
 * Tier 3 — 5 logical group tabs (Campaigns, Messaging, Voice, Media, Expos)
 * Tier 4 — nested SectionSubNav rendered only when a group is active, showing
 *          that group's sibling pages. URLs are UNCHANGED; the active group
 *          is computed from pathname membership in each group's `groupPaths`.
 *
 * Client Component because it uses usePathname() to pick the active group
 * AND because lucide-react icon refs are passed through tabs — see LC's
 * structure/layout.tsx for the same SSR→client serialization note.
 */

import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  TrendingUp,
  Target,
  MessageSquare,
  Bot,
  Users,
  RotateCcw,
  Repeat,
  MessageCircle,
  Mic,
  Radio,
  Database,
  Newspaper,
  CalendarClock,
  ClipboardList,
  LineChart,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

interface MarketingGroup {
  href: string;
  label: string;
  icon: LucideIcon;
  groupPaths: string[];
  subTabs: SectionTab[];
}

const groups: MarketingGroup[] = [
  {
    href: '/admission/marketing/campaigns/monitoring',
    label: 'Campaigns',
    icon: BarChart3,
    groupPaths: ['/admission/marketing/campaigns'],
    subTabs: [
      { href: '/admission/marketing/campaigns/monitoring', icon: BarChart3, label: 'Monitor' },
      { href: '/admission/marketing/campaigns/roi', icon: TrendingUp, label: 'ROI' },
      { href: '/admission/marketing/campaigns/segments', icon: Target, label: 'Segments' },
    ],
  },
  {
    href: '/admission/marketing/chat',
    label: 'Messaging',
    icon: MessageSquare,
    groupPaths: [
      '/admission/marketing/chat',
      '/admission/marketing/chatbot',
      '/admission/marketing/parent-communication',
      '/admission/marketing/re-engagement',
      '/admission/marketing/remarketing',
      '/admission/marketing/whatsapp-broadcast',
    ],
    subTabs: [
      { href: '/admission/marketing/chat', icon: MessageSquare, label: 'Chat' },
      { href: '/admission/marketing/chatbot', icon: Bot, label: 'Chatbot' },
      { href: '/admission/marketing/parent-communication', icon: Users, label: 'Parent' },
      { href: '/admission/marketing/re-engagement', icon: RotateCcw, label: 'Re-engagement' },
      { href: '/admission/marketing/remarketing', icon: Repeat, label: 'Remarketing' },
      { href: '/admission/marketing/whatsapp-broadcast', icon: MessageCircle, label: 'WhatsApp' },
    ],
  },
  {
    href: '/admission/marketing/voice-agents',
    label: 'Voice',
    icon: Mic,
    groupPaths: ['/admission/marketing/voice-agents', '/admission/marketing/voice-broadcast'],
    subTabs: [
      { href: '/admission/marketing/voice-agents', icon: Mic, label: 'Agents' },
      { href: '/admission/marketing/voice-broadcast', icon: Radio, label: 'Broadcast' },
    ],
  },
  {
    href: '/admission/marketing/database',
    label: 'Media',
    icon: Database,
    groupPaths: ['/admission/marketing/database', '/admission/marketing/publishers'],
    subTabs: [
      { href: '/admission/marketing/database', icon: Database, label: 'Database' },
      { href: '/admission/marketing/publishers', icon: Newspaper, label: 'Publishers' },
    ],
  },
  {
    href: '/admission/marketing/expos',
    label: 'Expos',
    icon: CalendarClock,
    groupPaths: ['/admission/marketing/expos'],
    subTabs: [
      { href: '/admission/marketing/expos', icon: CalendarClock, label: 'All Expos', exact: true },
      { href: '/admission/marketing/expos/masters', icon: ClipboardList, label: 'Masters' },
      { href: '/admission/marketing/expos/analytics', icon: LineChart, label: 'Analytics' },
    ],
  },
];

function isPathInGroup(pathname: string, groupPaths: string[]): boolean {
  return groupPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const groupTabs: SectionTab[] = groups.map((g) => ({
    href: g.href,
    icon: g.icon,
    label: g.label,
    matchPaths: g.groupPaths,
  }));

  const activeGroup = groups.find((g) => isPathInGroup(pathname, g.groupPaths));

  return (
    <>
      <SectionSubNav tabs={groupTabs} />
      {activeGroup && <SectionSubNav tabs={activeGroup.subTabs} />}
      {children}
    </>
  );
}
