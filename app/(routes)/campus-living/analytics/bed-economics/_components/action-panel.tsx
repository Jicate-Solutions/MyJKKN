'use client';

import { useMemo } from 'react';
import { AlertTriangle, BedDouble, Boxes, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useBedEconVacancyDetail,
  useBedEconConsolidation,
} from '@/hooks/campus-living/use-bed-economics';
import { formatInt, formatPct, formatRupees } from './format';

/**
 * Action panel (spec §8 item 5): three operational levers —
 *   1. Stale / costly vacancies (ranked by annualised loss)
 *   2. Consolidation cost-savings (C6) — explicit "does not change billed revenue"
 *   3. Premium conversion candidates (rooms carrying an open premium discount)
 */

type Props = {
  hostelYearId: string | undefined;
  institutionId: string | undefined;
};

export function ActionPanel({ hostelYearId, institutionId }: Props) {
  const vacancy = useBedEconVacancyDetail(hostelYearId, institutionId);
  const consolidation = useBedEconConsolidation(hostelYearId, institutionId);

  // Top vacant rooms by annualised loss (the "money walking past the door" list).
  const { topVacancies, totalVacancies } = useMemo(() => {
    const list = [...(vacancy.data ?? [])].filter((r) => r.vacant_beds > 0);
    list.sort((a, b) => b.vacancy_loss - a.vacancy_loss);
    return { topVacancies: list.slice(0, 8), totalVacancies: list.length };
  }, [vacancy.data]);

  // Premium conversion candidates: rooms with an open premium discount.
  const premiumCandidates = useMemo(
    () => (vacancy.data ?? []).filter((r) => r.premium_discount_pct !== null),
    [vacancy.data],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* 1. Stale / costly vacancies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BedDouble className="h-4 w-4 text-amber-600" />
            Costly vacancies
          </CardTitle>
          <CardDescription>
            Vacant beds ranked by annualised loss
            {totalVacancies > topVacancies.length
              ? ` (showing top ${topVacancies.length} of ${totalVacancies}).`
              : '.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vacancy.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : vacancy.error ? (
            <SectionError error={vacancy.error as Error} />
          ) : topVacancies.length === 0 ? (
            <EmptyNote text="No vacant sellable beds — full occupancy or no inventory yet." />
          ) : (
            <ul className="space-y-2">
              {topVacancies.map((r) => (
                <li
                  key={r.room_id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.block_name} · Room {r.room_number}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatInt(r.vacant_beds)} of {formatInt(r.capacity_beds)} beds vacant
                      {r.category_name ? ` · ${r.category_name}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-amber-700">
                    {formatRupees(r.vacancy_loss)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 2. Consolidation cost-savings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-blue-600" />
            Consolidation savings
          </CardTitle>
          <CardDescription>Cost saved by packing partially-filled rooms.</CardDescription>
        </CardHeader>
        <CardContent>
          {consolidation.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : consolidation.error ? (
            <SectionError error={consolidation.error as Error} />
          ) : !consolidation.data || consolidation.data.rooms_freed_by_packing === 0 ? (
            <EmptyNote text="No consolidation opportunity — rooms are not partially filled, or no occupancy yet." />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="Rooms freed" value={formatInt(consolidation.data.rooms_freed_by_packing)} />
                <Stat label="Partial rooms" value={formatInt(consolidation.data.partially_occupied_rooms)} />
                <Stat label="AC saved/yr" value={formatRupees(consolidation.data.ac_annual_savings)} />
                <Stat label="Housekeeping/yr" value={formatRupees(consolidation.data.housekeeping_annual_savings)} />
              </div>
              <div className="rounded-md bg-blue-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Total annual cost savings</p>
                <p className="text-lg font-bold text-blue-700">
                  {formatRupees(consolidation.data.total_annual_cost_savings)}
                </p>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                This is a cost lever only — under flat per-learner billing,
                consolidation <strong>does not change billed revenue</strong>.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Premium conversion candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-purple-600" />
            Premium candidates
          </CardTitle>
          <CardDescription>Rooms with an open premium discount.</CardDescription>
        </CardHeader>
        <CardContent>
          {vacancy.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : vacancy.error ? (
            <SectionError error={vacancy.error as Error} />
          ) : premiumCandidates.length === 0 ? (
            <EmptyNote text="No open premium-vacancy discounts right now." />
          ) : (
            <ul className="space-y-2">
              {premiumCandidates.slice(0, 8).map((r) => (
                <li
                  key={r.room_id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.block_name} · Room {r.room_number}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.category_name ?? 'Premium'}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs text-purple-700">
                    {formatPct(r.premium_discount_pct)} off
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 px-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function SectionError({ error }: { error: Error }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-xs">{error.message}</AlertDescription>
    </Alert>
  );
}
