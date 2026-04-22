'use client';

import {
  UserCog,
  UserPlus,
  Banknote,
  Share2,
  Gift,
  LineChart,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const consultantTabs: SectionTab[] = [
  { href: '/admission/consultants', icon: UserCog, label: 'All Consultants', exact: true },
  { href: '/admission/consultants/new', icon: UserPlus, label: 'Add Consultant' },
  { href: '/admission/consultants/commissions', icon: Banknote, label: 'Commissions' },
  { href: '/admission/consultants/referrals', icon: Share2, label: 'Referrals' },
  { href: '/admission/consultants/rewards', icon: Gift, label: 'Rewards' },
  { href: '/admission/consultants/analytics', icon: LineChart, label: 'Analytics' },
];

export default function ConsultantsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={consultantTabs} />
      {children}
    </>
  );
}
