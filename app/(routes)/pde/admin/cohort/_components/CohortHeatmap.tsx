'use client';

// =====================================================================
// CohortHeatmap — institution × category weighted-score heatmap.
// =====================================================================
// Renders one row per institution (or one aggregated row when the scope
// policy = aggregated_only), seven cells per row (one per PDE category).
// Each cell colors by tier of avg weighted score and exposes
// submitted/validated/scored counts via a native title tooltip.
//
// Per-college compliance target indicators surface below the table:
// for each college slug present in the policy map, we mark whether the
// targeted categories are above the 70% scored threshold.
// =====================================================================

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, BarChart3, Info } from 'lucide-react';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type CohortHeatmapData,
  type PDECategoryKey,
  type CohortRow,
} from '@/lib/services/pde-cohort-types';
import type { PerCollegeComplianceTargets } from '@/lib/services/pde-policy-reader-types';

interface CohortHeatmapProps {
  data: CohortHeatmapData;
  complianceTargets: PerCollegeComplianceTargets;
}

// ---------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------

interface TierStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
}

function tierFor(score: number | null): TierStyle {
  if (score === null) {
    return {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      border: 'border-border',
      label: 'No data',
    };
  }
  if (score < 50) {
    return {
      bg: 'bg-red-50 dark:bg-red-950/30',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200 dark:border-red-900',
      label: 'Below 50',
    };
  }
  if (score < 70) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      text: 'text-yellow-800 dark:text-yellow-200',
      border: 'border-yellow-200 dark:border-yellow-900',
      label: '50–70',
    };
  }
  if (score < 90) {
    return {
      bg: 'bg-green-50 dark:bg-green-950/30',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-200 dark:border-green-900',
      label: '70–90',
    };
  }
  return {
    bg: 'bg-emerald-100 dark:bg-emerald-900/50',
    text: 'text-emerald-900 dark:text-emerald-100',
    border: 'border-emerald-400 dark:border-emerald-700',
    label: '90+',
  };
}

// ---------------------------------------------------------------------
// Map institution name → college slug used by the per-college policy.
// Heuristic: substring search on the institution name. Robust enough
// for the 8 colleges defined in the seed policy; falls back to 'default'.
// ---------------------------------------------------------------------

const COLLEGE_SLUG_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  { slug: 'medical', keywords: ['medical', 'medicine'] },
  { slug: 'pharmacy', keywords: ['pharmacy', 'pharm'] },
  { slug: 'nursing', keywords: ['nursing', 'nurse'] },
  { slug: 'dental', keywords: ['dental', 'dentistry'] },
  { slug: 'engineering', keywords: ['engineering', 'technology', 'polytechnic'] },
  { slug: 'education', keywords: ['education', 'teacher'] },
  { slug: 'arts_science', keywords: ['arts', 'science', 'commerce'] },
];

function resolveCollegeSlug(name: string): string {
  const lower = name.toLowerCase();
  for (const { slug, keywords } of COLLEGE_SLUG_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return slug;
  }
  return 'default';
}

// ---------------------------------------------------------------------
// Per-college compliance evaluator
// ---------------------------------------------------------------------

interface ComplianceLine {
  institution_id: string;
  institution_name: string;
  college_slug: string;
  target_categories: string[];
  met_categories: PDECategoryKey[];
  unmet_categories: PDECategoryKey[];
  overall_met: boolean;
}

function evaluateCompliance(
  cohorts: CohortRow[],
  targets: PerCollegeComplianceTargets
): ComplianceLine[] {
  return cohorts.map((cohort) => {
    const slug = resolveCollegeSlug(cohort.institution_name);
    const targetCats = targets[slug] ?? targets.default ?? [];
    const met: PDECategoryKey[] = [];
    const unmet: PDECategoryKey[] = [];

    for (const cat of targetCats) {
      const key = cat as PDECategoryKey;
      if (!PDE_CATEGORY_KEYS.includes(key)) continue;
      const agg = cohort.by_category[key];
      // "Above 70% scored": at least one demonstration scored AND avg weighted
      // score >= 70 for that category.
      const scoredEnough = agg.scored > 0 && (agg.avg_weighted_score ?? 0) >= 70;
      if (scoredEnough) met.push(key);
      else unmet.push(key);
    }

    return {
      institution_id: cohort.institution_id,
      institution_name: cohort.institution_name,
      college_slug: slug,
      target_categories: targetCats,
      met_categories: met,
      unmet_categories: unmet,
      overall_met: targetCats.length > 0 && unmet.length === 0,
    };
  });
}

// ---------------------------------------------------------------------
// Cell with tooltip
// ---------------------------------------------------------------------

function HeatmapCell({
  category,
  agg,
}: {
  category: PDECategoryKey;
  agg: CohortRow['by_category'][PDECategoryKey];
}) {
  const tier = tierFor(agg.avg_weighted_score);
  const tooltip = `${PDE_CATEGORY_LABELS[category]}\n` +
    `Submitted: ${agg.submitted}\n` +
    `Validated: ${agg.validated}\n` +
    `Scored: ${agg.scored}\n` +
    `Passed: ${agg.passed}\n` +
    `Avg score: ${agg.avg_weighted_score ?? '—'}`;
  return (
    <td className="p-1">
      <div
        title={tooltip}
        className={`relative flex h-14 min-w-[68px] flex-col items-center justify-center rounded-md border ${tier.bg} ${tier.border}`}
      >
        <div className={`text-base font-semibold tabular-nums ${tier.text}`}>
          {agg.avg_weighted_score !== null ? agg.avg_weighted_score : '—'}
        </div>
        <div className={`text-[10px] uppercase tracking-wide ${tier.text}`}>
          {agg.scored}/{agg.submitted}
        </div>
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------

export function CohortHeatmap({ data, complianceTargets }: CohortHeatmapProps) {
  const { cohorts, timeframe, scope } = data;
  const [hideEmpty, setHideEmpty] = useState(false);

  const visibleCohorts = useMemo(() => {
    if (!hideEmpty) return cohorts;
    return cohorts.filter((c) => c.cohort_size > 0);
  }, [cohorts, hideEmpty]);

  const compliance = useMemo(() => evaluateCompliance(cohorts, complianceTargets), [
    cohorts,
    complianceTargets,
  ]);

  const totalDemonstrations = useMemo(
    () =>
      cohorts.reduce((sum, c) => {
        return (
          sum +
          PDE_CATEGORY_KEYS.reduce((s2, k) => s2 + c.by_category[k].submitted, 0)
        );
      }, 0),
    [cohorts]
  );

  const totalScored = useMemo(
    () =>
      cohorts.reduce((sum, c) => {
        return (
          sum + PDE_CATEGORY_KEYS.reduce((s2, k) => s2 + c.by_category[k].scored, 0)
        );
      }, 0),
    [cohorts]
  );

  const fromDate = new Date(timeframe.from).toLocaleDateString();
  const toDate = new Date(timeframe.to).toLocaleDateString();

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Cohort Heatmap
              </CardTitle>
              <CardDescription>
                Average weighted demonstration scores by institution × category.{' '}
                Window: {fromDate} → {toDate}.
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 capitalize">
              Scope: {scope.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary line */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">{cohorts.length} cohorts</Badge>
            <Badge variant="secondary">{totalDemonstrations} demonstrations</Badge>
            <Badge variant="secondary">{totalScored} scored</Badge>
            <button
              type="button"
              onClick={() => setHideEmpty((v) => !v)}
              className="ml-auto rounded border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {hideEmpty ? 'Show empty cohorts' : 'Hide empty cohorts'}
            </button>
          </div>

          {/* Empty state */}
          {visibleCohorts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Info className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium">No demonstrations yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Once learners submit PDE demonstrations via Tier 1.2 and faculty
                validate them via Tier 1.1, scored entries will appear here as
                a colored heatmap.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-border p-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Institution
                    </th>
                    <th className="border-b border-border p-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cohort
                    </th>
                    {PDE_CATEGORY_KEYS.map((key) => (
                      <th
                        key={key}
                        className="border-b border-border p-2 text-center text-[11px] font-medium text-muted-foreground"
                      >
                        {PDE_CATEGORY_LABELS[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleCohorts.map((cohort) => (
                    <tr key={cohort.institution_id} className="hover:bg-muted/30">
                      <td className="border-b border-border p-2 text-sm font-medium">
                        {cohort.institution_name}
                      </td>
                      <td className="border-b border-border p-2 text-center text-sm tabular-nums">
                        {cohort.cohort_size}
                      </td>
                      {PDE_CATEGORY_KEYS.map((key) => (
                        <HeatmapCell
                          key={key}
                          category={key}
                          agg={cohort.by_category[key]}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>Cell legend (avg weighted score):</span>
            {[null, 30, 60, 80, 95].map((s, i) => {
              const tier = tierFor(s);
              return (
                <span key={i} className="flex items-center gap-1">
                  <span className={`inline-block h-3 w-4 rounded border ${tier.bg} ${tier.border}`} />
                  {tier.label}
                </span>
              );
            })}
            <span className="ml-2">Bottom number = scored / submitted.</span>
          </div>
        </CardContent>
      </Card>

      {/* Per-college compliance card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Per-College Compliance Targets
          </CardTitle>
          <CardDescription>
            Each institution&apos;s target categories from{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              pde.rollout.per_college_compliance_targets
            </code>
            . A category is &ldquo;met&rdquo; when avg weighted score ≥ 70 with
            at least one scored demonstration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {compliance.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No cohorts to evaluate yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {compliance.map((line) => (
                <li
                  key={line.institution_id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{line.institution_name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {line.college_slug.replace('_', ' ')}
                    </Badge>
                    {line.target_categories.length === 0 ? (
                      <Badge variant="secondary">No targets defined</Badge>
                    ) : line.overall_met ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        All targets met
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        {line.met_categories.length}/{line.target_categories.length} met
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {line.target_categories.map((cat) => {
                      const key = cat as PDECategoryKey;
                      const isMet = line.met_categories.includes(key);
                      const label = PDE_CATEGORY_LABELS[key] ?? cat;
                      return (
                        <span
                          key={cat}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                            isMet
                              ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isMet ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
