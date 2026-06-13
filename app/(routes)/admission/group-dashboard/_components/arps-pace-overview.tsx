'use client';

/**
 * ARPS Phase 1 — Admission Revenue Pace System UI
 *
 * Director-locked 2026-06-07 in 6-section strategy interview. Phase 1 ships
 * with:
 *   - Alert ribbon (top): open lags + data-missing flags
 *   - 8 family cards: per-institution fill % vs expected pace
 *   - Day-of-cycle indicator
 *
 * The Tier 1-4 escalation ladder is shown in a guidance panel for any
 * alerting family — but the system does NOT auto-act. Director clicks into
 * the alert and decides.
 *
 * Phase 2 (next): substrate tables (operating_cost, revenue_target,
 * action_log) + auto-detect lever pulls + 4-role views.
 */

import { AlertTriangle, AlertCircle, CheckCircle2, MinusCircle, Database, TrendingUp, TrendingDown, Equal, Info, Settings, ListTodo } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useArpsPaceStatus, type ArpsAlertSeverity, type ArpsPaceRow } from '@/hooks/admission/use-arps-pace-status';

function severityToVisual(severity: ArpsAlertSeverity) {
  switch (severity) {
    case 'EARLY-LAG':
    case 'MID-LAG':
    case 'LATE-LAG':
      return {
        icon: AlertTriangle,
        ringClass: 'ring-2 ring-red-300',
        bgClass: 'bg-red-50',
        textClass: 'text-red-700',
        label: severity.replace('-', ' '),
      };
    case 'DATA-MISSING':
      return {
        icon: Database,
        ringClass: 'ring-2 ring-amber-300',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        label: 'Sanctioned data missing',
      };
    default:
      return null;
  }
}

function gapDirection(gap: number | null) {
  if (gap === null || gap === undefined) return null;
  if (gap > 1) return { icon: TrendingUp, color: 'text-emerald-700', label: 'AHEAD' };
  if (gap < -1) return { icon: TrendingDown, color: 'text-red-700', label: 'BEHIND' };
  return { icon: Equal, color: 'text-stone-700', label: 'ON PACE' };
}

function FamilyCard({ row }: { row: ArpsPaceRow }) {
  const visual = severityToVisual(row.alert_severity);
  const direction = gapDirection(row.gap_pp);
  const DirectionIcon = direction?.icon ?? MinusCircle;

  // The display name shortens institution names by dropping "JKKN College of"
  // for visual density.
  const shortName = row.institution_name
    .replace(/^JKKN College of /, '')
    .replace(/^JKKN /, '');

  return (
    <Card className={`relative overflow-hidden ${visual?.ringClass ?? ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{shortName}</CardTitle>
          {visual && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${visual.bgClass} ${visual.textClass}`}>
              <visual.icon className="h-3 w-3" />
              {visual.label}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {row.total_sanctioned === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">
              Sanctioned intake is not recorded for this institution&apos;s programs.
            </p>
            <p className="text-xs text-stone-500">
              {row.admitted_so_far} admits captured in 2026 ·
              {' '}{row.hp_2024_admitted} in 2024 ·
              {' '}{row.hp_2025_admitted} in 2025
            </p>
            <p className="text-xs italic text-amber-700">
              Populate sanctioned intake on programs to enable pace tracking.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-3xl text-stone-900">
                {row.actual_fill_pct?.toFixed(1)}%
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${direction?.color}`}>
                <DirectionIcon className="h-3 w-3" />
                {direction?.label}
              </span>
            </div>
            <div className="text-xs text-stone-600">
              {row.admitted_so_far} of {row.total_sanctioned} seats filled
            </div>
            <div className="border-t border-stone-200 pt-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Expected at Day {row.current_day_n}</span>
                <span className="font-medium text-stone-700">
                  {row.expected_fill_pct?.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Gap from pace</span>
                <span className={`font-medium ${direction?.color}`}>
                  {row.gap_pp !== null && row.gap_pp > 0 ? '+' : ''}{row.gap_pp?.toFixed(1)}pp
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRibbon({ rows }: { rows: ArpsPaceRow[] }) {
  const lagAlerts = rows.filter((r) =>
    r.alert_severity && r.alert_severity !== 'DATA-MISSING'
  );
  const dataMissing = rows.filter((r) => r.alert_severity === 'DATA-MISSING');

  if (lagAlerts.length === 0 && dataMissing.length === 0) {
    return (
      <Alert className="border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <AlertTitle className="text-emerald-900">No pace alerts</AlertTitle>
        <AlertDescription className="text-emerald-800">
          All 8 institutions are on or ahead of pace at Day {rows[0]?.current_day_n ?? 0} of the 2026-27 cycle.
          Group fill rate: {(
            (rows.reduce((s, r) => s + r.admitted_so_far, 0) /
              Math.max(1, rows.reduce((s, r) => s + r.total_sanctioned, 0))) * 100
          ).toFixed(1)}%
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {lagAlerts.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertTitle className="text-red-900">
            {lagAlerts.length} institution{lagAlerts.length === 1 ? '' : 's'} behind pace
          </AlertTitle>
          <AlertDescription className="space-y-1 text-red-800">
            {lagAlerts.map((r) => (
              <div key={r.institution_id} className="text-sm">
                <span className="font-medium">{r.institution_name.replace(/^JKKN /, '')}</span>
                {' '}— {r.alert_severity?.replace('-', ' ')} at Day {r.current_day_n}, gap {r.gap_pp?.toFixed(1)}pp behind expected.
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {dataMissing.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <Database className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900">
            {dataMissing.length} institution{dataMissing.length === 1 ? '' : 's'} missing sanctioned data
          </AlertTitle>
          <AlertDescription className="space-y-1 text-amber-800">
            {dataMissing.map((r) => (
              <div key={r.institution_id} className="text-sm">
                <span className="font-medium">{r.institution_name.replace(/^JKKN /, '')}</span>
                {' '}— programs.sanctioned_intake is 0 for all programs. Populate to enable pace tracking.
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function EscalationLadder() {
  return (
    <Card className="border-stone-200 bg-stone-50/50">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Escalation ladder — Director-locked 2026-06-07</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-xs text-stone-600 mb-3">
          When a family flashes an alert, the suggested order to consider levers (cheapest + safest first).
          Phase 1 ships alert-only — no auto-recommend. You click in, you decide.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border border-emerald-200 bg-white p-3">
            <div className="text-xs font-semibold text-emerald-700">TIER 1 — first try</div>
            <div className="mt-1 text-sm font-medium">Outreach intensity</div>
            <div className="mt-1 text-xs text-stone-600">Counselor reallocation + worked-lead push. Labor only, no cash, no pattern risk.</div>
          </div>
          <div className="rounded-md border border-blue-200 bg-white p-3">
            <div className="text-xs font-semibold text-blue-700">TIER 2 — if T1 ceiling hit</div>
            <div className="mt-1 text-sm font-medium">Incentive structures</div>
            <div className="mt-1 text-xs text-stone-600">Alumni / parent / sibling referral rewards. Pay-on-result. Off-system, low pattern risk.</div>
          </div>
          <div className="rounded-md border border-violet-200 bg-white p-3">
            <div className="text-xs font-semibold text-violet-700">TIER 3 — if pipeline thin</div>
            <div className="mt-1 text-sm font-medium">Paid acquisition</div>
            <div className="mt-1 text-xs text-stone-600">Ads + WhatsApp burst + consultant lead-buy. Variable cost. 10-14 day delay.</div>
          </div>
          <div className="rounded-md border border-red-200 bg-white p-3">
            <div className="text-xs font-semibold text-red-700">TIER 4 — last resort</div>
            <div className="mt-1 text-sm font-medium">Price-side</div>
            <div className="mt-1 text-xs text-stone-600">Scholarship / fee / waiver. <span className="font-semibold">Negotiated only, NOT published.</span> High pattern risk — train applicants if predictable.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaceOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    </div>
  );
}

export function ArpsPaceOverview() {
  const { data: rows, isLoading, error } = useArpsPaceStatus();

  if (isLoading) return <PaceOverviewSkeleton />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load pace status</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No data</AlertTitle>
        <AlertDescription>No institutions returned by the pace RPC.</AlertDescription>
      </Alert>
    );
  }

  const currentDay = rows[0]?.current_day_n ?? 0;
  const totalSanctioned = rows.reduce((s, r) => s + r.total_sanctioned, 0);
  const totalAdmitted = rows.reduce((s, r) => s + r.admitted_so_far, 0);
  const groupFill = totalSanctioned > 0 ? (totalAdmitted / totalSanctioned) * 100 : 0;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* Header strip */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">Day of cycle</div>
            <div className="font-serif text-3xl text-stone-900">Day {currentDay}</div>
            <div className="mt-1 text-xs text-stone-600">
              of the 2026-27 admission cycle (Apr 1 onward)
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-stone-500">Group fill rate</div>
            <div className="font-serif text-3xl text-stone-900">{groupFill.toFixed(1)}%</div>
            <div className="mt-1 text-xs text-stone-600">
              {totalAdmitted} of {totalSanctioned} sanctioned seats
              <Tooltip>
                <TooltipTrigger className="ml-1 inline-flex">
                  <Info className="h-3 w-3 text-stone-400" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Sanctioned excludes Arts & Sci (Aided) and Education — their
                  programs have sanctioned_intake = 0 in the database. Populate
                  to include them.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Phase 2 navigation row (Director-locked 2026-06-07) */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href="/admission/group-dashboard/setup">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Cycle Setup
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admission/group-dashboard/actions">
              <ListTodo className="h-3.5 w-3.5 mr-1.5" />
              Action Log
            </Link>
          </Button>
          <span className="text-xs text-stone-500 ml-2">
            Set targets &amp; costs, capture lever pulls — see the methodology footnote below for v1 scope.
          </span>
        </div>

        {/* Alert ribbon */}
        <AlertRibbon rows={rows} />

        {/* Family cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((r) => <FamilyCard key={r.institution_id} row={r} />)}
        </div>

        {/* Escalation ladder reference */}
        <EscalationLadder />

        {/* Methodology footnote */}
        <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
          <strong className="text-stone-700">How pace is computed (v1):</strong> Expected fill % at Day N = average of (cumulative admits by Day N in 2024) and (cumulative admits by Day N in 2025), divided by current sanctioned intake. Alerts fire when actual is &gt;= 10pp behind expected (Days 1-60), 15pp (61-120), or 20pp (121-180). Phase 2 will add a per-year sanctioned denominator + action log + revenue projection.
        </div>
      </div>
    </TooltipProvider>
  );
}
