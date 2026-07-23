'use client';

// =====================================================================
// ComplianceMatrix — 8-college × 7-category compliance matrix.
// =====================================================================
// Rows: 8 college slugs (medical, pharmacy, nursing, dental,
//   engineering, education, arts_science, default).
// Columns: 7 PDE category keys.
//
// Cell semantics:
//   - Target categories (per pde.rollout.per_college_compliance_targets)
//     are framed with a colored "target" border.
//   - Cell color = pass_rate tier (red <50, yellow 50-70, green 70-90,
//     dark-green 90+, grey when scored = 0).
//   - Native title tooltip exposes submitted / validated / scored /
//     passed counts.
//
// Top of page:
//   - Overall institutional compliance % (mean across the 8 colleges).
//   - Total demonstrations + scored counts.
//   - Per-college compliance bars (compliance_percent each).
//
// Empty state: when total_demonstrations = 0, the matrix still renders
// (all-grey cells) and a banner explains that all targets are pending.
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
import { Progress } from '@/components/ui/progress';
import { ShieldCheck, Info, CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type PDECategoryKey,
} from '@/lib/services/pde-cohort-types';
import {
  type PerCollegeComplianceData,
  type CollegeComplianceRow,
  type CategoryComplianceBucket,
} from '@/lib/services/pde-compliance-service';

interface ComplianceMatrixProps {
  data: PerCollegeComplianceData;
}

// ---------------------------------------------------------------------
// Color tiers — match the cohort heatmap palette so the two pages
// read as one coherent story.
// ---------------------------------------------------------------------

interface TierStyle {
  bg: string;
  text: string;
  border: string;
  label: string;
}

function passRateTier(passRate: number, scored: number): TierStyle {
  if (scored === 0) {
    return {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      border: 'border-border',
      label: 'No data',
    };
  }
  const pct = passRate * 100;
  if (pct < 50) {
    return {
      bg: 'bg-red-50 dark:bg-red-950/30',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200 dark:border-red-900',
      label: 'Below 50%',
    };
  }
  if (pct < 70) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      text: 'text-yellow-800 dark:text-yellow-200',
      border: 'border-yellow-200 dark:border-yellow-900',
      label: '50–70%',
    };
  }
  if (pct < 90) {
    return {
      bg: 'bg-green-50 dark:bg-green-950/30',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-200 dark:border-green-900',
      label: '70–90%',
    };
  }
  return {
    bg: 'bg-emerald-100 dark:bg-emerald-900/50',
    text: 'text-emerald-900 dark:text-emerald-100',
    border: 'border-emerald-400 dark:border-emerald-700',
    label: '90%+',
  };
}

function complianceBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-green-500';
  if (pct >= 50) return 'bg-yellow-500';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-muted-foreground/40';
}

// ---------------------------------------------------------------------
// Cell — single category in a college row.
// ---------------------------------------------------------------------

function MatrixCell({
  category,
  bucket,
  isTarget,
}: {
  category: PDECategoryKey;
  bucket: CategoryComplianceBucket;
  isTarget: boolean;
}) {
  const tier = passRateTier(bucket.pass_rate, bucket.scored);
  const passRatePct = Math.round(bucket.pass_rate * 100);
  const tooltip =
    `${PDE_CATEGORY_LABELS[category]}\n` +
    (isTarget ? '★ Target category for this college\n' : '') +
    `Submitted: ${bucket.submitted}\n` +
    `Validated: ${bucket.validated}\n` +
    `Scored: ${bucket.scored}\n` +
    `Passed: ${bucket.passed}\n` +
    `Pass rate: ${bucket.scored > 0 ? `${passRatePct}%` : '—'}`;

  // Target wrapper ring — uses ring instead of border so it stacks cleanly
  // with the tier border below.
  const targetRing = isTarget
    ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-blue-400'
    : '';

  return (
    <td className="p-1">
      <div
        title={tooltip}
        className={`relative flex h-16 min-w-[78px] flex-col items-center justify-center rounded-md border ${tier.bg} ${tier.border} ${targetRing}`}
      >
        {isTarget && (
          <Target className="absolute right-1 top-1 h-3 w-3 text-blue-500 dark:text-blue-400" />
        )}
        <div className={`text-base font-semibold tabular-nums ${tier.text}`}>
          {bucket.scored > 0 ? `${passRatePct}%` : '—'}
        </div>
        <div className={`text-[10px] uppercase tracking-wide ${tier.text}`}>
          {bucket.passed}/{bucket.scored}
        </div>
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------
// Per-college compliance bar row.
// ---------------------------------------------------------------------

function CollegeBar({ row }: { row: CollegeComplianceRow }) {
  const barColor = complianceBarColor(row.compliance_percent);
  const onTrack = row.target_count > 0 && row.on_track_count === row.target_count;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          {onTrack ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          )}
          <span className="font-medium">{row.college_label}</span>
          {row.target_count === 0 && (
            <Badge variant="outline" className="text-[10px]">
              no targets configured
            </Badge>
          )}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {row.on_track_count}/{row.target_count} targets on track ·{' '}
          <span className="font-semibold text-foreground">
            {row.compliance_percent}%
          </span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, row.compliance_percent))}%` }}
        />
      </div>
      {row.institution_names.length > 0 && (
        <div className="truncate text-[10px] text-muted-foreground">
          {row.institution_names.join(' · ')}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------

export function ComplianceMatrix({ data }: ComplianceMatrixProps) {
  const { colleges, institutional_compliance_percent, total_demonstrations, total_scored, timeframe } = data;
  const [hideUntargeted, setHideUntargeted] = useState(false);

  const visibleColleges = useMemo(() => {
    if (!hideUntargeted) return colleges;
    return colleges.filter((c) => c.target_count > 0);
  }, [colleges, hideUntargeted]);

  const totalsTargets = useMemo(
    () => colleges.reduce((s, c) => s + c.target_count, 0),
    [colleges]
  );
  const totalsOnTrack = useMemo(
    () => colleges.reduce((s, c) => s + c.on_track_count, 0),
    [colleges]
  );

  const fromDate = new Date(timeframe.from).toLocaleDateString();
  const toDate = new Date(timeframe.to).toLocaleDateString();

  const isEmpty = total_demonstrations === 0;

  return (
    <div className="space-y-6">
      {/* Header / overall compliance card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-500" />
                Per-College Compliance
              </CardTitle>
              <CardDescription>
                Demonstration pass rates against the categories each college
                targets. Window: {fromDate} → {toDate}.
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0">
              Policy: pde.rollout.per_college_compliance_targets
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">
              Institutional: {institutional_compliance_percent}%
            </Badge>
            <Badge variant="secondary">
              {totalsOnTrack}/{totalsTargets} targets on track
            </Badge>
            <Badge variant="secondary">{total_demonstrations} demonstrations</Badge>
            <Badge variant="secondary">{total_scored} scored</Badge>
            <button
              type="button"
              onClick={() => setHideUntargeted((v) => !v)}
              className="ml-auto rounded border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {hideUntargeted
                ? 'Show colleges with no targets'
                : 'Hide colleges with no targets'}
            </button>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Overall institutional compliance</span>
              <span className="text-xs text-muted-foreground">
                Mean across {colleges.length} college groups
              </span>
            </div>
            <Progress value={institutional_compliance_percent} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Empty state banner — keep the matrix visible underneath. */}
      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Info className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">No demonstrations submitted yet</p>
            <p className="max-w-xl text-xs text-muted-foreground">
              All compliance targets are pending. Once learners submit
              demonstrations via Tier 1.2 and faculty validate &amp; score them
              via Tier 1.1, the matrix below will fill in with pass rates per
              college × category.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Per-college bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance by college</CardTitle>
          <CardDescription>
            Each bar = the share of that college&apos;s target categories that
            currently exceed a 70% pass rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visibleColleges.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No colleges to display with the current filter.
            </p>
          ) : (
            visibleColleges.map((row) => <CollegeBar key={row.college} row={row} />)
          )}
        </CardContent>
      </Card>

      {/* The matrix itself */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">College × Category matrix</CardTitle>
          <CardDescription>
            Pass rate per category. Cells with a <Target className="inline h-3 w-3 text-blue-500" />{' '}
            badge are the targeted categories for that college.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-border p-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    College
                  </th>
                  <th className="border-b border-border p-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Targets
                  </th>
                  {PDE_CATEGORY_KEYS.map((key) => (
                    <th
                      key={key}
                      className="border-b border-border p-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {PDE_CATEGORY_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleColleges.map((row) => {
                  const targetSet = new Set(row.target_categories);
                  return (
                    <tr key={row.college} className="border-b border-border/40 last:border-b-0">
                      <td className="p-2 align-middle">
                        <div className="text-sm font-medium">{row.college_label}</div>
                        {row.institution_names.length > 0 && (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {row.institution_names.slice(0, 2).join(', ')}
                            {row.institution_names.length > 2 &&
                              ` +${row.institution_names.length - 2}`}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center align-middle">
                        <div className="text-sm font-semibold tabular-nums">
                          {row.on_track_count}/{row.target_count}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {row.compliance_percent}%
                        </div>
                      </td>
                      {PDE_CATEGORY_KEYS.map((key) => (
                        <MatrixCell
                          key={key}
                          category={key}
                          bucket={row.actual[key]}
                          isTarget={targetSet.has(key)}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">Legend:</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border bg-muted" /> No data
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-red-200 bg-red-50" /> &lt;50% pass
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-yellow-200 bg-yellow-50" /> 50–70%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-green-200 bg-green-50" /> 70–90%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-100" /> 90%+
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3 text-blue-500" /> Targeted category (blue ring)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
