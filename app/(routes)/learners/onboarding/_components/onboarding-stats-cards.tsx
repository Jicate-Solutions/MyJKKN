/**
 * Top-of-page KPI cards for the Learner Onboarding page.
 *
 * Server component — fetches stats inline. Renders 4 cards that summarise the
 * incomplete-profile workload by severity tier so admins can triage at a
 * glance. Mirrors the visual pattern at
 * app/(routes)/learners/analytics/_components/profile-completion-tab.tsx.
 */

import { Card, CardContent } from '@/components/ui/card';
import {
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  Sparkles,
  UserCheck,
  Wallet
} from 'lucide-react';
import { getOnboardingStats } from '../_data/get-onboarding-stats';

interface OnboardingStatsCardsProps {
  filters: {
    lifecycle_status?: 'reserved' | 'admitted';
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
    semester_id?: string;
    section_id?: string;
    academic_year_id?: string;
  };
}

export async function OnboardingStatsCards({ filters }: OnboardingStatsCardsProps) {
  const stats = await getOnboardingStats(filters);

  const cards = [
    {
      key: 'total',
      label: 'Total Incomplete',
      value: stats.total_incomplete,
      sub: `${stats.completion_rate}% of all learners complete`,
      icon: ClipboardList,
      accent: 'text-foreground',
      bg: 'bg-muted/40',
      border: 'border-border'
    },
    {
      key: 'critical',
      label: 'Critical',
      value: stats.critical,
      sub: '0 or 1 of 4 fields filled',
      icon: AlertCircle,
      accent: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/20',
      border: 'border-red-200 dark:border-red-900/40'
    },
    {
      key: 'needs_work',
      label: 'Needs Work',
      value: stats.needs_work,
      sub: '2 of 4 fields filled',
      icon: AlertTriangle,
      accent: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      border: 'border-amber-200 dark:border-amber-900/40'
    },
    {
      key: 'almost',
      label: 'Almost Complete',
      value: stats.almost,
      sub: '3 of 4 fields filled',
      icon: Sparkles,
      accent: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      border: 'border-emerald-200 dark:border-emerald-900/40'
    },
    {
      key: 'ready_to_activate',
      label: 'Ready to Activate',
      value: stats.ready_to_activate,
      sub: 'Admitted, all 4 filled — activate now',
      icon: UserCheck,
      accent: 'text-green-700 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/20',
      border: 'border-green-200 dark:border-green-900/40'
    },
    {
      key: 'awaiting_payment',
      label: 'Awaiting Payment',
      value: stats.awaiting_payment,
      sub: 'Reserved, all 4 filled — fees pending',
      icon: Wallet,
      accent: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/20',
      border: 'border-sky-200 dark:border-sky-900/40'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.key} className={`${card.bg} ${card.border}`}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className={`text-3xl font-bold leading-none ${card.accent}`}>
                    {card.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{card.sub}</p>
                </div>
                <Icon className={`h-5 w-5 ${card.accent}`} aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Skeleton placeholder so the Suspense boundary doesn't shift layout.
 */
export function OnboardingStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="bg-muted/30">
          <CardContent className="p-4 sm:p-5">
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-8 w-16 animate-pulse rounded bg-muted-foreground/20" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
