'use client';

import { Wallet, TrendingUp } from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

const paymentsTabs: SectionTab[] = [
  {
    href: '/solutions/payments',
    icon: Wallet,
    label: 'Payments',
  },
  {
    href: '/solutions/earnings',
    icon: TrendingUp,
    label: 'Earnings',
  },
];

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionSubNav tabs={paymentsTabs} />
      {children}
    </>
  );
}
