'use client';

import {
  Settings,
  Workflow,
  SlidersHorizontal,
  Users2,
  Radio,
  Armchair,
  FileText,
  MessageCircle,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const settingsTabs: SectionTab[] = [
  { href: '/admission/settings', icon: Settings, label: 'General', exact: true },
  { href: '/admission/settings/workflows', icon: Workflow, label: 'Workflows' },
  {
    href: '/admission/settings/workflow-config',
    icon: SlidersHorizontal,
    label: 'Workflow Config',
  },
  {
    href: '/admission/settings/assignment-rules',
    icon: Users2,
    label: 'Assignment Rules',
  },
  { href: '/admission/settings/sources', icon: Radio, label: 'Lead Sources' },
  { href: '/admission/settings/seat-config', icon: Armchair, label: 'Seat Config' },
  { href: '/admission/settings/templates', icon: FileText, label: 'Templates' },
  {
    href: '/admission/settings/whatsapp-numbers',
    icon: MessageCircle,
    label: 'WhatsApp Numbers',
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={settingsTabs} />
      {children}
    </>
  );
}
