'use client';

// =====================================================================
// PeerRelativeCard — learner's PDE scores per category vs cohort avg.
// =====================================================================
// One card per PDE category. For each category we show:
//   - The learner's own score (best demonstration), if any
//   - The cohort average for the same category
//   - The learner's percentile within the cohort
//   - A horizontal bar comparing own vs cohort avg
//
// Display visibility honors `pde.visibility.individual_metric_display`:
//   - show_numeric_score=false  → hide own_score / cohort_avg numbers
//   - show_percentile=false     → hide percentile chip
//   - show_audit_trail=false    → hide the "total demonstrations" footnote
//
// Empty-state friendly: when the learner has no demonstrations yet, we
// surface a single explainer card pointing them at the submission flow.
// =====================================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Sparkles, Target, AlertCircle, Info, PlusCircle } from 'lucide-react';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type LearnerPeerData,
  type PDECategoryKey,
  type LearnerCategorySummary,
} from '@/lib/services/pde-cohort-types';

interface PeerRelativeCardProps {
  data: LearnerPeerData;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function tierForScore(score: number | null): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  if (score === null) {
    return {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      border: 'border-border',
      label: 'No score yet',
    };
  }
  if (score < 50) {
    return {
      bg: 'bg-red-100 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200 dark:border-red-900',
      label: 'Below benchmark',
    };
  }
  if (score < 70) {
    return {
      bg: 'bg-yellow-100 dark:bg-yellow-950/40',
      text: 'text-yellow-800 dark:text-yellow-200',
      border: 'border-yellow-200 dark:border-yellow-900',
      label: 'Approaching benchmark',
    };
  }
  if (score < 90) {
    return {
      bg: 'bg-green-100 dark:bg-green-950/40',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-200 dark:border-green-900',
      label: 'Meets benchmark',
    };
  }
  return {
    bg: 'bg-emerald-100 dark:bg-emerald-900/50',
    text: 'text-emerald-900 dark:text-emerald-100',
    border: 'border-emerald-400 dark:border-emerald-700',
    label: 'Exceeds benchmark',
  };
}

function percentileBadge(p: number | null): {
  label: string;
  className: string;
  icon: typeof TrendingUp;
} {
  if (p === null) {
    return {
      label: '—',
      className: 'bg-muted text-muted-foreground',
      icon: Info,
    };
  }
  if (p >= 90) {
    return {
      label: `Top ${100 - p}%`,
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      icon: Sparkles,
    };
  }
  if (p >= 70) {
    return {
      label: `${p}th percentile`,
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      icon: TrendingUp,
    };
  }
  if (p >= 40) {
    return {
      label: `${p}th percentile`,
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      icon: Target,
    };
  }
  return {
    label: `${p}th percentile`,
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    icon: AlertCircle,
  };
}

// ---------------------------------------------------------------------
// Per-category row
// ---------------------------------------------------------------------

function CategoryRow({
  category,
  summary,
  showNumericScore,
  showPercentile,
  showAuditTrail,
}: {
  category: PDECategoryKey;
  summary: LearnerCategorySummary;
  showNumericScore: boolean;
  showPercentile: boolean;
  showAuditTrail: boolean;
}) {
  const tier = tierForScore(summary.own_score);
  const pBadge = percentileBadge(summary.percentile);
  const PBIcon = pBadge.icon;
  const own = summary.own_score ?? 0;
  const avg = summary.cohort_avg ?? 0;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${tier.border} ${tier.bg}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`text-base font-semibold ${tier.text}`}>
            {PDE_CATEGORY_LABELS[category]}
          </h3>
          <p className={`text-xs ${tier.text} opacity-80`}>{tier.label}</p>
        </div>
        {showPercentile && summary.percentile !== null && (
          <Badge className={`${pBadge.className} text-xs`}>
            <PBIcon className="mr-1 h-3 w-3" />
            {pBadge.label}
          </Badge>
        )}
      </div>

      {/* Bar comparison */}
      {showNumericScore && (summary.own_score !== null || summary.cohort_avg !== null) ? (
        <div className="space-y-2">
          {/* Own */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">Your best</span>
              <span className="tabular-nums">
                {summary.own_score !== null ? `${summary.own_score}` : '—'}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-current opacity-70"
                style={{ width: `${Math.min(100, Math.max(0, own))}%` }}
              />
            </div>
          </div>
          {/* Cohort avg */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs opacity-80">
              <span>Cohort average</span>
              <span className="tabular-nums">
                {summary.cohort_avg !== null ? `${summary.cohort_avg}` : '—'}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/40"
                style={{ width: `${Math.min(100, Math.max(0, avg))}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className={`text-xs ${tier.text} opacity-70`}>
          {summary.own_score === null
            ? 'No scored demonstration in this category yet.'
            : 'Detailed metrics hidden by institution policy.'}
        </p>
      )}

      {/* Audit trail footnote */}
      {showAuditTrail && summary.total_demonstrations > 0 && (
        <p className={`mt-3 text-[11px] ${tier.text} opacity-70`}>
          You have submitted {summary.total_demonstrations} demonstration
          {summary.total_demonstrations === 1 ? '' : 's'} in this category.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------

export function PeerRelativeCard({ data }: PeerRelativeCardProps) {
  const { by_category, display } = data;

  const hasAnyData = useMemo(
    () =>
      PDE_CATEGORY_KEYS.some((k) => {
        const c = by_category[k];
        return c.own_score !== null || c.total_demonstrations > 0;
      }),
    [by_category]
  );

  const policyBadges = useMemo(() => {
    const items: string[] = [];
    if (!display.show_numeric_score) items.push('numeric scores hidden');
    if (!display.show_percentile) items.push('percentile hidden');
    if (!display.show_audit_trail) items.push('audit trail hidden');
    return items;
  }, [display]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                My PDE — vs Cohort
              </CardTitle>
              <CardDescription>
                Your strongest demonstration in each of the seven PDE durable-
                value categories, compared with the average for learners in
                your institution.
              </CardDescription>
            </div>
            {policyBadges.length > 0 && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Policy: {policyBadges.join(', ')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!hasAnyData ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Info className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium">No demonstrations yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Submit your first PDE demonstration to see how you compare with
                peers across the seven durable-value categories. Your scores
                appear here once faculty validate your evidence.
              </p>
              <Link href="/pde/learn/demonstrations/new" className="mt-3 inline-block">
                <Button className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Start your first demonstration
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PDE_CATEGORY_KEYS.map((key) => (
                <CategoryRow
                  key={key}
                  category={key}
                  summary={by_category[key]}
                  showNumericScore={display.show_numeric_score}
                  showPercentile={display.show_percentile}
                  showAuditTrail={display.show_audit_trail}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
