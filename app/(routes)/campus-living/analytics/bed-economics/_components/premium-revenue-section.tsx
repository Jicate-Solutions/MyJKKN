'use client';

import { useMemo, useState } from 'react';
import { Crown, IndianRupee, Snowflake, TrendingUp, Info } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBedEconPremiumPotential } from '@/hooks/campus-living/use-bed-economics';
import { formatRupees, formatInt } from './format';

/**
 * Premium Revenue section (Director request 2026-06-08): "sell each premium bed
 * for maximum revenue." Leads with the ₹-gap — money left on the table — split
 * boys vs girls.
 *
 * Reads REAL levers from production via fn_bed_econ_premium_potential:
 *   - inventory by gender × tier (hostel_categories.type × category)
 *   - tier uplift % (hostel_tier_policy: Premium +25%, Premium Plus +50%)
 *   - AC surcharge (policy hostel.room.ac_default_cost_per_ton_inr × tonnage)
 *   - active occupancy (check_out_date IS NULL)
 * The ONLY caller-supplied input is the assumed base bed rate — the single
 * number not yet set in hostel_fees. Everything else is real config.
 *
 * Pattern source: headline-cards.tsx (cards + format helpers), cost-return-
 * section.tsx (per-block gated cards). Super-admin gating handled by the hook.
 */

type Props = {
  hostelYearId: string;
  institutionId: string | null;
};

const DEFAULT_BASE = 60000;

export function PremiumRevenueSection({ hostelYearId, institutionId }: Props) {
  const [baseInput, setBaseInput] = useState<string>(String(DEFAULT_BASE));
  const baseRate = useMemo(() => {
    const n = Number(baseInput.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [baseInput]);

  const { data, isLoading, error } = useBedEconPremiumPotential(
    hostelYearId,
    institutionId ?? undefined,
    baseRate,
  );

  const rows = data ?? [];

  // Split by gender; premium-tier rows (uplift > 0) are the monetisation focus.
  const byGender = useMemo(() => {
    const g: Record<string, typeof rows> = { boys: [], girls: [] };
    for (const r of rows) {
      (g[r.gender] ??= []).push(r);
    }
    return g;
  }, [rows]);

  const totals = useMemo(() => {
    const premiumRows = rows.filter((r) => r.uplift_pct > 0);
    const sum = (arr: typeof rows, f: (r: (typeof rows)[number]) => number) =>
      arr.reduce((s, r) => s + Number(f(r) || 0), 0);
    return {
      gap: sum(rows, (r) => r.gap),
      premiumBeds: sum(premiumRows, (r) => r.beds),
      premiumEmpty: sum(premiumRows, (r) => r.empty_beds),
      acPotential: sum(rows, (r) => r.ac_potential),
      upliftPotential: sum(rows, (r) => r.uplift_potential),
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" />
          Premium Revenue — sell every premium bed for maximum yield
        </CardTitle>
        <CardDescription>
          What each premium bed could earn at full monetisation — base rate ×
          tier uplift + AC + add-ons — vs what&rsquo;s billed today. Tier uplift,
          AC cost and inventory are real production config; the base bed rate is
          your assumption until rates are entered in Fee Config.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Base-rate input — the single missing lever */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="base-rate" className="text-xs">
              Assumed base bed rate (₹/year)
            </Label>
            <div className="relative">
              <IndianRupee className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="base-rate"
                inputMode="numeric"
                value={baseInput}
                onChange={(e) => setBaseInput(e.target.value)}
                className="w-40 pl-7"
              />
            </div>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Premium = +25%, Premium Plus = +50% on this base (live tier policy).
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load premium revenue model: {(error as Error).message}
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
            No premium inventory found for this scope.
          </div>
        ) : (
          <>
            {/* Headline: the ₹-gap (upsell opportunity) */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <HeadStat
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                label="Annual revenue on the table"
                value={formatRupees(totals.gap)}
                sub={`at ₹${formatInt(baseRate)} base — potential minus what's billed today`}
                emphasis
              />
              <HeadStat
                icon={<Crown className="h-4 w-4 text-amber-500" />}
                label="Premium beds to sell"
                value={`${formatInt(totals.premiumBeds)}`}
                sub={`${formatInt(totals.premiumEmpty)} currently empty`}
              />
              <HeadStat
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                label="Tier-uplift upside"
                value={formatRupees(totals.upliftPotential)}
                sub="+25% / +50% over base on premium tiers"
              />
              <HeadStat
                icon={<Snowflake className="h-4 w-4 text-sky-500" />}
                label="AC surcharge potential"
                value={formatRupees(totals.acPotential)}
                sub="₹77,000/ton × configured AC rooms"
              />
            </div>

            {/* Boys vs Girls, separately */}
            <div className="grid gap-4 lg:grid-cols-2">
              {(['boys', 'girls'] as const).map((gender) => (
                <GenderColumn key={gender} gender={gender} rows={byGender[gender] ?? []} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HeadStat({
  icon,
  label,
  value,
  sub,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasis ? 'border-emerald-200 bg-emerald-50/60' : 'bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${emphasis ? 'text-emerald-700' : ''}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</div>
    </div>
  );
}

function GenderColumn({
  gender,
  rows,
}: {
  gender: 'boys' | 'girls';
  rows: {
    tier: string;
    beds: number;
    empty_beds: number;
    uplift_pct: number;
    ac_rooms: number;
    total_potential: number;
    gap: number;
  }[];
}) {
  const label = gender === 'boys' ? 'Boys' : 'Girls';
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold capitalize">
        {label} hostels
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">No inventory.</div>
        ) : (
          rows.map((r) => (
            <div key={r.tier} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{r.tier}</span>
                  {r.uplift_pct > 0 && (
                    <Badge variant="secondary" className="text-[10px] text-amber-700">
                      +{Number(r.uplift_pct)}%
                    </Badge>
                  )}
                  {r.ac_rooms > 0 && (
                    <Badge variant="secondary" className="text-[10px] text-sky-700">
                      {r.ac_rooms} AC
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatInt(r.beds)} beds · {formatInt(r.empty_beds)} empty
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">
                  {formatRupees(r.total_potential)}
                </div>
                <div className="text-[11px] text-emerald-600 tabular-nums">
                  +{formatRupees(r.gap)} upside
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
