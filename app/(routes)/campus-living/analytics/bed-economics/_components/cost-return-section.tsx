'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useBedEconCostGrid } from '@/hooks/campus-living/use-bed-economics';
import type { BedEconCostRow } from '@/types/bed-economics';
import { formatInt, formatPct, formatRupees } from './format';

/**
 * Cost & Return section (spec §8 item 7, C1-C5). Per-block cards, fully
 * data-gated: a block with no opex entries shows "No cost data — enter costs"
 * linking to settings/block-economics rather than a misleading zero.
 *
 * Cost-allocation trap fix (spec §5-D): contribution margin (direct costs only)
 * is shown SEPARATELY from fully-loaded GOPPAB, with the warning copy so a block
 * is never judged "unprofitable" on allocated overheads alone.
 */

type Props = {
  hostelYearId: string | undefined;
  institutionId: string | undefined;
};

const BLOCK_ECONOMICS_HREF = '/campus-living/settings/block-economics';

export function CostReturnSection({ hostelYearId, institutionId }: Props) {
  const { data, isLoading, error } = useBedEconCostGrid(hostelYearId, institutionId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost & return per bed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load cost & return</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost & return per bed</CardTitle>
        <CardDescription>
          Direct opex, contribution margin, and ROI per block. Cards stay gated
          until cost data is entered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-900">
            Contribution margin counts <strong>direct costs only</strong>. Don&apos;t
            judge a block &quot;unprofitable&quot; on allocated overheads alone — fully-loaded
            GOPPAB is shown separately and only once costs are entered.
          </AlertDescription>
        </Alert>

        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
            No blocks found for this scope.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <CostCard key={r.block_id} row={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostCard({ row }: { row: BedEconCostRow }) {
  // No opex at all — the whole card is gated behind a "enter costs" CTA.
  if (!row.has_opex) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex h-full min-h-[176px] flex-col gap-2 p-4">
          <p className="text-sm font-semibold">{row.block_name}</p>
          <p className="text-xs text-muted-foreground">
            {formatInt(row.sellable_beds)} beds · {formatRupees(row.billed)} billed
          </p>
          <div className="mt-auto rounded-md bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">
              No cost data for {row.block_name}
            </p>
            <Link
              href={BLOCK_ECONOMICS_HREF}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Enter costs
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex h-full min-h-[176px] flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{row.block_name}</p>
          <p className="text-xs text-muted-foreground">
            {formatInt(row.sellable_beds)} beds · {formatRupees(row.billed)} billed · {formatRupees(row.opex_total)} opex
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <CostStat
            label="Contribution / bed"
            value={formatRupees(row.contribution_margin_per_bed)}
            hint="Direct costs only"
          />
          <CostStat label="GOPPAB" value={formatRupees(row.goppab)} hint="Fully loaded" />
        </div>

        {/* ROI + payback gated additionally on capex. */}
        {row.has_capex ? (
          <div className="grid grid-cols-2 gap-2">
            <CostStat label="ROI / bed" value={formatPct(row.roi_per_bed)} />
            <CostStat
              label="Payback"
              value={row.payback_years === null ? '—' : `${row.payback_years.toFixed(1)} yr`}
            />
          </div>
        ) : (
          <div className="mt-auto rounded-md bg-muted/40 px-3 py-2 text-center">
            <Link
              href={BLOCK_ECONOMICS_HREF}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Add capex for ROI &amp; payback
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {hint && <p className="text-[9px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
