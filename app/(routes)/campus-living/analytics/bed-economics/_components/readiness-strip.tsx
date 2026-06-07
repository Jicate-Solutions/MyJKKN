'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  ListChecks,
  CalendarClock,
  Camera,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useBedEconReadiness } from '@/hooks/campus-living/use-bed-economics';
import { formatDate, formatInt, formatPct } from './format';

/**
 * Revenue-Readiness strip (R1-R4, spec §5-A + §8 item 2).
 *
 * The dashboard launches into a near-empty 2026-27 year (spec §2): rates may
 * not be configured, no hostel bills generated, allocations just ramping. This
 * strip is the day-1 headline — amber action cards with one-click links to the
 * page where each gap is fixed. When every check passes it auto-collapses to a
 * thin green line so a healthy year reads as "all clear" rather than noise.
 */

type Props = {
  hostelYearId: string | undefined;
};

export function ReadinessStrip({ hostelYearId }: Props) {
  const { data, isLoading, error } = useBedEconReadiness(hostelYearId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load readiness checklist</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  // R1 — rates configured for the year (any kind).
  const r1Pass = data.rates_configured.any;
  // R2 — at least one hostel-source bill generated.
  const r2Pass = data.hostel_bills_count > 0;
  // R3 — allocation ramp is informational; it "passes" once any bed is allocated.
  const r3Pass = data.active_allocations > 0;
  // R4 — snapshot collection has started.
  const r4Pass = data.snapshot_recording_since !== null;

  const checks: ReadinessCheck[] = [
    {
      id: 'R1',
      pass: r1Pass,
      icon: IndianRupee,
      label: 'Rates configured',
      passText: `Rates set — room ${data.rates_configured.room}, mess ${data.rates_configured.mess}, package ${data.rates_configured.package}.`,
      gapText: `No hostel/mess rates for this year. Every metric below stays empty until rates exist.`,
      action: { label: 'Configure fee rates', href: '/campus-living/settings/fee-config' },
    },
    {
      id: 'R2',
      pass: r2Pass,
      icon: ListChecks,
      label: 'Bills generated',
      passText: `${formatInt(data.hostel_bills_count)} hostel bill(s) generated.`,
      gapText: `0 hostel bills generated. Billed / collected revenue stays ₹0 until you run generation.`,
      action: { label: 'Generate bills', href: '/campus-living/residents?tab=generate' },
    },
    {
      id: 'R3',
      pass: r3Pass,
      icon: CalendarClock,
      label: 'Allocation ramp',
      passText: `${formatInt(data.active_allocations)} of ${formatInt(data.sellable_beds)} beds allocated (${formatPct(data.allocation_ramp_pct)}).`,
      gapText: `${formatInt(data.active_allocations)} of ${formatInt(data.sellable_beds)} beds allocated — the hostel year began June 1, ramp is starting.`,
      // Informational only — link to residents to allocate.
      action: { label: 'Allocate residents', href: '/campus-living/residents' },
      informational: true,
    },
    {
      id: 'R4',
      pass: r4Pass,
      icon: Camera,
      label: 'Trend recording',
      passText: `Occupancy trend recording since ${formatDate(data.snapshot_recording_since)}.`,
      gapText: `Trend not yet recording — the daily snapshot cron has not run. The trend chart fills in from its first run.`,
      informational: true,
    },
  ];

  // "All clear" = every check (incl. the two informational ones) passes, so the
  // strip can collapse to a single green line.
  const allClear = checks.every((c) => c.pass);

  // Auto-collapsed green line when everything passes.
  if (allClear && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-left transition hover:bg-green-100"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Revenue-ready — rates set, bills generated, allocations ramping, trend recording.
        </span>
        <ChevronDown className="h-4 w-4 text-green-700" />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Revenue readiness</h2>
          <p className="text-xs text-muted-foreground">
            Until rates are entered and bills are generated, every allocated bed is unbilled revenue.
          </p>
        </div>
        {allClear && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Collapse <ChevronUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {checks.map((c) => (
          <ReadinessCard key={c.id} check={c} />
        ))}
      </div>
    </div>
  );
}

type ReadinessCheck = {
  id: string;
  pass: boolean;
  icon: typeof IndianRupee;
  label: string;
  passText: string;
  gapText: string;
  action?: { label: string; href: string };
  informational?: boolean;
};

function ReadinessCard({ check }: { check: ReadinessCheck }) {
  const Icon = check.icon;
  const tone = check.pass
    ? 'border-green-200 bg-green-50'
    : check.informational
      ? 'border-blue-200 bg-blue-50'
      : 'border-amber-200 bg-amber-50';
  const iconTone = check.pass
    ? 'text-green-600'
    : check.informational
      ? 'text-blue-600'
      : 'text-amber-600';

  return (
    <Card className={`border ${tone}`}>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconTone}`} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {check.label}
            </span>
          </div>
          {check.pass ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : check.informational ? null : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
        </div>
        <p className="text-sm leading-snug text-foreground">
          {check.pass ? check.passText : check.gapText}
        </p>
        {!check.pass && check.action && (
          <Link
            href={check.action.href}
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {check.action.label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
