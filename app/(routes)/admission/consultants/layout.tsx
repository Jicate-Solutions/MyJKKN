'use client';

import {
  UserCog,
  UserPlus,
  Banknote,
  Share2,
  Gift,
  LineChart,
  Unlink,
  UserX,
  Upload,
  ClipboardCheck,
  IndianRupee,
  ListChecks,
  Wallet,
  Scale,
} from 'lucide-react';
import { SectionSubNav, type SectionTab } from '@/components/navigation/section-subnav';

// The desktop sidebar (lib/sidebarMenuLink.ts) lists thirteen consultant pages;
// this bar listed six. The seven it omitted are the entire payout half of the
// module — including Rates & Generate, the ONLY screen that can set a referral
// rate, without which no commission can be computed at all. They were reachable
// only by typing the URL, so on mobile (where this bar replaces the sidebar) that
// work was effectively invisible. Labels below are the sidebar's own, so the two
// navigations name the same page the same way.
//
// Each tab still gates itself: SectionSubNav resolves href -> MENU_PERMISSIONS and
// hides any tab the viewer lacks permission for, so widening the bar does not widen
// access. All seven routes are already mapped there.
const consultantTabs: SectionTab[] = [
  { href: '/admission/consultants', icon: UserCog, label: 'All Consultants', exact: true },
  { href: '/admission/consultants/new', icon: UserPlus, label: 'Add Consultant' },
  { href: '/admission/consultants/referrals', icon: Share2, label: 'Referrals' },
  { href: '/admission/consultants/unlinked-referrals', icon: Unlink, label: 'Unlinked Referrals' },
  // Added 2026-09-12 alongside the sidebar entry. On mobile this bar REPLACES the
  // sidebar, so a page listed only there is unreachable on a phone — the exact
  // failure this bar's header records for the seven pages it once omitted.
  { href: '/admission/consultants/attribution-orphans', icon: UserX, label: 'Attribution Orphans' },
  { href: '/admission/consultants/import', icon: Upload, label: 'Import Referrals' },
  { href: '/admission/consultants/review-worklist', icon: ClipboardCheck, label: 'Review Worklist' },
  { href: '/admission/consultants/referral-rates', icon: IndianRupee, label: 'Rates & Generate' },
  { href: '/admission/consultants/commissions', icon: Banknote, label: 'Commissions' },
  { href: '/admission/consultants/payout-readiness', icon: ListChecks, label: 'Payout Readiness' },
  { href: '/admission/consultants/payouts', icon: Wallet, label: 'Payouts' },
  { href: '/admission/consultants/reconciliation', icon: Scale, label: 'Reconciliation' },
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
