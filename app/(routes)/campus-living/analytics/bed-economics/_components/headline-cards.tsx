'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BedDouble,
  IndianRupee,
  Percent,
  TrendingDown,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { bedEconomicsKeys, useBedEconSummary } from '@/hooks/campus-living/use-bed-economics';
import { BED_ECON_POLICY_KEYS } from './policy-keys';
import { formatDecimal, formatInt, formatPct, formatRupees } from './format';

/**
 * Headline metric cards (spec §5-B/C + §8 item 3):
 *   Bed Occupancy % · RevPAB · Realization % · Collection % · Vacancy Loss ₹
 * plus a "Projected (not yet billed)" card while bills = 0 but allocations > 0.
 *
 * Each card carries a muted one-line English consequence (exact copy from
 * spec §5). Stoplight tone on occupancy + collection reads the
 * bed_econ.occupancy_target_pct / collection_target_pct policy rows directly
 * (zero-deploy tunables, §7.1).
 */

type Props = {
  hostelYearId: string | undefined;
  institutionId: string | undefined;
};

export function HeadlineCards({ hostelYearId, institutionId }: Props) {
  const { data, isLoading, error } = useBedEconSummary(hostelYearId, institutionId);

  // Stoplight target policies as a React Query entry under the bed-economics
  // key prefix — the settings panel's invalidateQueries(bedEconomicsKeys.all)
  // refetches these live, so threshold colours never lag a saved policy edit
  // (review finding m1, 2026-06-07).
  const { data: targets = { occupancy: 85, collection: 90 } } = useQuery({
    queryKey: [...bedEconomicsKeys.all, 'stoplight-targets'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data: rows } = await supabase
        .from('platform_policies')
        .select('policy_key, value')
        .in('policy_key', [
          BED_ECON_POLICY_KEYS.OCCUPANCY_TARGET_PCT,
          BED_ECON_POLICY_KEYS.COLLECTION_TARGET_PCT,
        ])
        .eq('scope_type', 'global')
        .is('scope_id', null);
      const occ = rows?.find((r) => r.policy_key === BED_ECON_POLICY_KEYS.OCCUPANCY_TARGET_PCT);
      const col = rows?.find((r) => r.policy_key === BED_ECON_POLICY_KEYS.COLLECTION_TARGET_PCT);
      return {
        occupancy: typeof occ?.value === 'number' ? occ.value : 85,
        collection: typeof col?.value === 'number' ? col.value : 90,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load headline metrics</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const occTone = stoplight(data.bed_occupancy_pct, targets.occupancy);
  const colTone = stoplight(data.collection_pct, targets.collection);

  // Projected card shows only while bills = 0 but allocations exist — it bridges
  // the 0-bills launch window (spec §5 V9).
  const showProjected = data.billed === 0 && data.occupied_beds > 0;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      <MetricCard
        icon={BedDouble}
        label="Bed Occupancy"
        value={formatPct(data.bed_occupancy_pct)}
        sub={`${formatInt(data.occupied_beds)} of ${formatInt(data.sellable_beds)} beds (${data.denominator})`}
        extraLines={[
          `Room occupancy: ${formatPct(data.room_occupancy_pct)}`,
          `Density: ${formatDecimal(data.density_beds_per_occupied_room)} beds/occupied room`,
        ]}
        consequence="Every empty bed is a flat fee unbilled this year."
        tone={occTone}
      />
      <MetricCard
        icon={IndianRupee}
        label="RevPAB"
        value={formatRupees(data.rev_pab)}
        sub="Billed revenue per available bed"
        extraLines={[
          `RevPOB: ${formatRupees(data.rev_pob)} (per occupied bed)`,
          ...(data.premium_addon_billed > 0
            ? [`Incl. premium add-on: ${formatRupees(data.premium_addon_billed)}`]
            : []),
        ]}
        consequence="What each sellable bed earns on average — vacant beds drag it down."
        tone="neutral"
      />
      <MetricCard
        icon={Percent}
        label="Realization"
        value={formatPct(data.realization_pct)}
        sub={`${formatRupees(data.billed)} of ${formatRupees(data.potential)} potential`}
        consequence="Share of full-occupancy potential actually billed."
        tone="neutral"
      />
      <MetricCard
        icon={Wallet}
        label="Collection"
        value={formatPct(data.collection_pct)}
        sub={`${formatRupees(data.collected)} collected`}
        extraLines={
          data.refunds > 0
            ? [`Gross ${formatRupees(data.collected_gross)} − refunds ${formatRupees(data.refunds)}`]
            : undefined
        }
        consequence="Of what's billed, how much has come in (net of refunds)."
        tone={colTone}
      />
      <MetricCard
        icon={TrendingDown}
        label="Vacancy Loss"
        value={formatRupees(data.vacancy_loss)}
        sub="Annualised, at current rates"
        consequence="₹ walking past the door at current rates."
        tone={data.vacancy_loss > 0 ? 'amber' : 'neutral'}
      />

      {showProjected && (
        <MetricCard
          icon={Sparkles}
          label="Projected (not yet billed)"
          value={formatRupees(data.projected)}
          sub={`${formatInt(data.occupied_beds)} active allocations`}
          consequence="Committed by allocations but not yet billed — generate bills to convert."
          tone="blue"
          wide
        />
      )}
    </div>
  );
}

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

function stoplight(value: number | null, target: number): Tone {
  if (value === null) return 'neutral';
  if (value >= target) return 'green';
  if (value >= target * 0.8) return 'amber';
  return 'red';
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  extraLines,
  consequence,
  tone,
  wide,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  sub: string;
  extraLines?: string[];
  consequence: string;
  tone: Tone;
  wide?: boolean;
}) {
  const valueTone =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-700'
          : tone === 'blue'
            ? 'text-blue-700'
            : 'text-foreground';
  const accent =
    tone === 'green'
      ? 'border-l-green-400'
      : tone === 'amber'
        ? 'border-l-amber-400'
        : tone === 'red'
          ? 'border-l-red-400'
          : tone === 'blue'
            ? 'border-l-blue-400'
            : 'border-l-muted';

  return (
    <Card className={`overflow-hidden border-l-4 ${accent} ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      <CardContent className="flex h-full min-h-[128px] flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <p className={`text-2xl font-bold leading-tight ${valueTone}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
        {extraLines?.map((line) => (
          <p key={line} className="text-[11px] text-muted-foreground">
            {line}
          </p>
        ))}
        <p className="mt-auto text-[11px] leading-snug text-muted-foreground/80">{consequence}</p>
      </CardContent>
    </Card>
  );
}
