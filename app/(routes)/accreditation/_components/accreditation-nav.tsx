'use client';

/**
 * Accreditation Module Navigation (Compliance Unification Program)
 *
 * Top-level tab bar rendered by accreditation/layout.tsx on every
 * Accreditation page. Mirrors the Learners Council / Campus Living /
 * Admission CRM pattern:
 *   Tier 1 (this file): Accreditation module tabs — Hub + Coverage + 10 bodies
 *   Tier 2: SectionSubNav per body (e.g. /accreditation/naac shows peer
 *           tabs: IQAC Committees, DCF/AQAR Export, Survey Consent, 8.4 Export)
 *
 * URLs are kept UNCHANGED — all PR-A1..PR-A15 Unification Program routes
 * continue to resolve exactly as before. Only the sidebar collapsed from
 * 12 entries to 1; navigation now lives in-page.
 *
 * All 10 bodies are peer entities (NAAC, NIRF, NBA, QS, DCI, PCI, INC,
 * NCTE, AICTE, UGC) — no grouping, flex-wrap across viewport width.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Briefcase,
  Globe,
  Stethoscope,
  ClipboardPlus,
  HeartPulse,
  GraduationCap,
  Rocket,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccreditationTab {
  href: string;
  icon: typeof Award;
  label: string;
  /** Active only on exact pathname match (used for Hub root) */
  exact?: boolean;
}

const tabs: AccreditationTab[] = [
  { href: '/accreditation', icon: Award, label: 'Hub', exact: true },
  { href: '/accreditation/coverage', icon: BarChart3, label: 'Coverage' },
  { href: '/accreditation/naac', icon: ShieldCheck, label: 'NAAC' },
  { href: '/accreditation/nirf', icon: TrendingUp, label: 'NIRF' },
  { href: '/accreditation/nba', icon: Briefcase, label: 'NBA' },
  { href: '/accreditation/qs', icon: Globe, label: 'QS' },
  { href: '/accreditation/dci', icon: Stethoscope, label: 'DCI' },
  { href: '/accreditation/pci', icon: ClipboardPlus, label: 'PCI' },
  { href: '/accreditation/inc', icon: HeartPulse, label: 'INC' },
  { href: '/accreditation/ncte', icon: GraduationCap, label: 'NCTE' },
  { href: '/accreditation/aicte', icon: Rocket, label: 'AICTE' },
  { href: '/accreditation/ugc', icon: Scale, label: 'UGC' },
];

export function AccreditationNav() {
  const pathname = usePathname();

  const isActive = (tab: AccreditationTab) => {
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(tab.href + '/');
  };

  return (
    <div className='flex flex-wrap gap-1 p-1 rounded-lg bg-muted max-w-full'>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
              active
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className='h-4 w-4' />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
