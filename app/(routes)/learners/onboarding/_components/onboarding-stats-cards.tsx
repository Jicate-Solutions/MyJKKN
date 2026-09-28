/**
 * Top-of-page KPI cards for the Learner Onboarding page.
 *
 * Server component — fetches stats inline. Two rows:
 *   1. Status pipeline — Account → Reserved → Admitted, each with its count,
 *      share of the cohort, what it is waiting on, and how many profiles in it
 *      are still incomplete; a proportional bar sits under the three.
 *   2. Work queues — Critical, Ready to Activate, Awaiting Payment (the tabs).
 * Every number comes from getOnboardingStats, which derives them from the same
 * columns the tabs use, so cards and tabs cannot disagree.
 */

import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowRight, UserCheck, Users, Wallet } from 'lucide-react';
import type { OnboardingStatus } from '@/types/learner-onboarding';
import { getOnboardingStats } from '../_data/get-onboarding-stats';

interface OnboardingStatsCardsProps {
  filters: {
    lifecycle_status?: OnboardingStatus;
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
    semester_id?: string;
    section_id?: string;
    academic_year_id?: string;
  };
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export async function OnboardingStatsCards({ filters }: OnboardingStatsCardsProps) {
  const stats = await getOnboardingStats(filters);
  const total = stats.account_total + stats.reserved_total + stats.admitted_total;

  const stages = [
    {
      key: 'account',
      label: 'Account',
      value: stats.account_total,
      incomplete: stats.account_incomplete,
      waiting: 'Application / University fee pending',
      dot: 'bg-violet-500',
      bar: 'bg-violet-500',
      accent: 'text-violet-700 dark:text-violet-300'
    },
    {
      key: 'reserved',
      label: 'Reserved',
      value: stats.reserved_total,
      incomplete: stats.reserved_incomplete,
      waiting: 'Tuition threshold pending',
      dot: 'bg-sky-500',
      bar: 'bg-sky-500',
      accent: 'text-sky-700 dark:text-sky-300'
    },
    {
      key: 'admitted',
      label: 'Admitted',
      value: stats.admitted_total,
      incomplete: stats.admitted_incomplete,
      waiting: 'Complete profile, then activate',
      dot: 'bg-emerald-500',
      bar: 'bg-emerald-500',
      accent: 'text-emerald-700 dark:text-emerald-300'
    }
  ];

  const queues = [
    {
      key: 'critical',
      label: 'Critical',
      value: stats.total_incomplete,
      sub: 'Missing profile fields',
      foot: `${stats.completion_rate}% of profiles complete`,
      icon: AlertCircle,
      accent: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-950/50'
    },
    {
      key: 'ready_to_activate',
      label: 'Ready to Activate',
      value: stats.ready_to_activate,
      sub: 'Admitted with all 4 fields',
      foot: 'Activate now to create their login',
      icon: UserCheck,
      accent: 'text-green-700 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-950/50'
    },
    {
      key: 'awaiting_payment',
      label: 'Awaiting Payment',
      value: stats.awaiting_payment,
      sub: `${stats.account_total} Account · ${stats.reserved_total} Reserved`,
      foot: 'Blocked on fees',
      icon: Wallet,
      accent: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-100 dark:bg-sky-950/50'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Row 1 — status pipeline */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex items-center gap-3 lg:w-48 lg:shrink-0 lg:border-r lg:pr-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  All Learners
                </p>
                <p className="text-3xl font-bold leading-none">{total.toLocaleString()}</p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              {stages.map((s, i) => (
                <div key={s.key} className="relative rounded-lg border bg-muted/20 p-3">
                  {i < stages.length - 1 && (
                    <ArrowRight
                      className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground sm:block"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    <p className="text-sm font-medium">{s.label}</p>
                    <span className="ml-auto text-xs text-muted-foreground">{pct(s.value, total)}%</span>
                  </div>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${s.accent}`}>
                    {s.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.waiting}</p>
                  <p className="mt-1 text-xs">
                    {s.incomplete > 0 ? (
                      <span className="text-red-600 dark:text-red-400">
                        {s.incomplete} profile{s.incomplete === 1 ? '' : 's'} incomplete
                      </span>
                    ) : (
                      <span className="text-green-700 dark:text-green-400">All profiles complete</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Proportional bar */}
          {total > 0 && (
            <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {stages.map((s) =>
                s.value > 0 ? (
                  <div key={s.key} className={s.bar} style={{ width: `${(s.value / total) * 100}%` }} />
                ) : null
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 2 — work queues (match the tabs) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {queues.map((q) => {
          const Icon = q.icon;
          return (
            <Card key={q.key}>
              <CardContent className="flex items-start gap-3 p-4 sm:p-5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${q.iconBg}`}>
                  <Icon className={`h-5 w-5 ${q.accent}`} aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{q.label}</p>
                  <p className={`text-2xl font-bold leading-none tabular-nums ${q.accent}`}>
                    {q.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{q.sub}</p>
                  <p className="text-xs text-muted-foreground/80">{q.foot}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder so the Suspense boundary doesn't shift layout.
 */
export function OnboardingStatsCardsSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="bg-muted/30">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-7 w-14 animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted-foreground/20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="p-4 sm:p-5">
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-7 w-16 animate-pulse rounded bg-muted-foreground/20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
