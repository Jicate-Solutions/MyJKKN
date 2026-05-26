'use client';

// ============================================================================
// /admin/mess/menu/[tier] — Weekly menu editor for a single tier.
// ============================================================================
// URL: /admin/mess/menu/standard or /admin/mess/menu/premium
// (uses tier_key values from the hostel_tier_policy ladder per Director D2
// lock 2026-05-25)
//
// Layout:
//   • Header: tier name + week selector (current + next 4 weeks)
//   • Tier toggle (link to the other tier)
//   • MenuGrid (7×4)
//
// 2-hour mid-week edit cutoff is enforced in MessMenuService.upsertMenuCell.
// ============================================================================

import { useMemo, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChefHat, CalendarRange } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useMessCaterers } from '@/hooks/campus-living/use-mess-caterers';
import type { TierKey } from '@/types/campus-living';

import { MenuGrid } from '../_components/menu-grid';

export const navMeta = { label: 'Mess Menu Editor', icon: 'CalendarRange' } as const;

const VALID_TIERS: TierKey[] = ['standard', 'premium', 'premium_plus'];

const TIER_LABELS: Record<TierKey, string> = {
  standard: 'CLASSIC (standard)',
  premium: 'PREMIUM (premium)',
  premium_plus: 'PREMIUM++ (premium_plus)',
};

/** Build a list of 5 Mondays starting from this IST week. */
function computeWeekOptions(): { value: string; label: string }[] {
  // Today in IST. (User's local clock may differ; we read from a UTC Date
  // and offset for IST display.)
  const now = new Date();
  // Find current week's Monday in local time, then format ISO date.
  const dow = now.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + offsetToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  return Array.from({ length: 5 }).map((_, i) => {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() + i * 7);
    const iso = d.toISOString().split('T')[0]!;
    const label = i === 0 ? `Current week (${iso})` : `Week of ${iso}`;
    return { value: iso, label };
  });
}

export default function MessMenuEditorPage() {
  const params = useParams<{ tier: string }>();
  const tierParam = params?.tier as string | undefined;

  if (!tierParam || !VALID_TIERS.includes(tierParam as TierKey)) {
    notFound();
  }
  const tierKey = tierParam as TierKey;

  const { profile } = useAuth();
  const institutionId = (profile?.institution_id as string | undefined) ?? undefined;

  const weekOptions = useMemo(() => computeWeekOptions(), []);
  const [weekStartDate, setWeekStartDate] = useState<string>(weekOptions[0]!.value);

  // Caterer dispatch — for the grid we pick any active caterer for the
  // institution. (The chairperson's "gender-shared menu" architecture means
  // the menu cell is tier-scoped; the caterer is selected at display time
  // for the resident based on gender — see useMessCatererForGender.)
  const { data: caterersResult, isLoading: caterersLoading } = useMessCaterers(institutionId);
  const catererId = caterersResult?.data?.[0]?.id;

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Mess Menu — {TIER_LABELS[tierKey]}
              </h1>
              <p className="text-sm text-muted-foreground">
                7 days × 4 meal slots. Tamil items are source-of-truth; English is optional.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={weekStartDate} onValueChange={setWeekStartDate}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Pick week" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Tier toggle */}
        <nav aria-label="Tier picker" className="mb-4 flex flex-wrap gap-2">
          {VALID_TIERS.map((t) => (
            <Link key={t} href={`/admin/mess/menu/${t}`}>
              <Badge
                variant={t === tierKey ? 'default' : 'outline'}
                className="cursor-pointer text-sm px-3 py-1"
              >
                {TIER_LABELS[t]}
              </Badge>
            </Link>
          ))}
        </nav>

        {/* Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ChefHat className="h-4 w-4" /> Week of {weekStartDate}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!institutionId ? (
              <p className="text-sm text-muted-foreground">
                No institution context loaded — sign in with an institution-scoped account.
              </p>
            ) : caterersLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !catererId ? (
              <p className="text-sm text-muted-foreground">
                No active caterer for this institution. Add one via the{' '}
                <Link href="/admin/mess/caterers" className="underline">
                  Caterers
                </Link>{' '}
                page first.
              </p>
            ) : (
              <MenuGrid
                institutionId={institutionId}
                catererId={catererId}
                weekStartDate={weekStartDate}
                tierKey={tierKey}
              />
            )}
          </CardContent>
        </Card>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
