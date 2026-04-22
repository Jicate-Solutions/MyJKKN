import {
  BarChart3,
  TrendingUp,
  Target,
  MessageSquare,
  Bot,
  Users,
  RotateCcw,
  Repeat,
  Mic,
  Radio,
  Database,
  Newspaper,
  CalendarClock,
  ClipboardList,
  LineChart,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const marketingTabs: SectionTab[] = [
  {
    href: '/admission/marketing/campaigns/monitoring',
    icon: BarChart3,
    label: 'Campaign Monitor',
  },
  {
    href: '/admission/marketing/campaigns/roi',
    icon: TrendingUp,
    label: 'Campaign ROI',
  },
  {
    href: '/admission/marketing/campaigns/segments',
    icon: Target,
    label: 'Segments',
  },
  { href: '/admission/marketing/chat', icon: MessageSquare, label: 'WhatsApp Chat' },
  { href: '/admission/marketing/chatbot', icon: Bot, label: 'Chatbot' },
  {
    href: '/admission/marketing/parent-communication',
    icon: Users,
    label: 'Parent Communication',
  },
  { href: '/admission/marketing/re-engagement', icon: RotateCcw, label: 'Re-engagement' },
  { href: '/admission/marketing/remarketing', icon: Repeat, label: 'Remarketing' },
  { href: '/admission/marketing/voice-agents', icon: Mic, label: 'Voice Agents' },
  {
    href: '/admission/marketing/voice-broadcast',
    icon: Radio,
    label: 'Voice Broadcast',
  },
  { href: '/admission/marketing/database', icon: Database, label: 'Database' },
  { href: '/admission/marketing/publishers', icon: Newspaper, label: 'Publishers' },
  {
    href: '/admission/marketing/expos',
    icon: CalendarClock,
    label: 'Expos',
    exact: true,
  },
  {
    href: '/admission/marketing/expos/masters',
    icon: ClipboardList,
    label: 'Expo Masters',
  },
  {
    href: '/admission/marketing/expos/analytics',
    icon: LineChart,
    label: 'Expo Analytics',
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={marketingTabs} />
      {children}
    </>
  );
}
