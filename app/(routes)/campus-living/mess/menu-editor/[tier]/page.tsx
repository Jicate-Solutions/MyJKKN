'use client';

// ============================================================================
// /campus-living/mess/menu-editor/[tier] — Weekly menu editor for a single tier (relocated from /admin/mess 2026-06-01).
// ============================================================================
// URL: /campus-living/mess/menu-editor/classic or /campus-living/mess/menu-editor/premium
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
import { ChefHat, CalendarRange, Copy, Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useMessCaterers } from '@/hooks/campus-living/use-mess-caterers';
import { useCopyMessMenuWeek } from '@/hooks/campus-living/use-mess-menu-week';
import type { GenderServed, TierKey } from '@/types/campus-living';

import { MenuGrid } from '../_components/menu-grid';
import { useMessPlanOptions, planLabel } from '@/lib/services/campus-living/mess-plan-options';

export const navMeta = { label: 'Mess Menu Editor', icon: 'CalendarRange' } as const;

// Plan tiers come LIVE from mess_categories (auto-follow, 2026-06-12):
// adding a category on the categories page adds an editor tier with no code
// change. useMessPlanOptions falls back to Classic/Premium on load/failure.

// Gender = the caterer's `gender_served`. The menu is a tier × gender matrix.
type EditorGender = Extract<GenderServed, 'boys' | 'girls'>;
const GENDER_OPTIONS: { value: EditorGender; label: string }[] = [
  { value: 'girls', label: 'Girls' },
  { value: 'boys', label: 'Boys' },
];

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
    // Format the LOCAL date — toISOString() converts to UTC, shifting IST
    // midnight to the previous day (Monday-keyed weeks became Sunday-keyed,
    // so editor-written rows and Monday-keyed readers could never match).
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const label = i === 0 ? `Current week (${iso})` : `Week of ${iso}`;
    return { value: iso, label };
  });
}

export default function MessMenuEditorPage() {
  const params = useParams<{ tier: string }>();
  const tierParam = params?.tier as string | undefined;
  const { options: planOptions, isFetched: plansFetched } = useMessPlanOptions();

  // Validate the URL tier against the LIVE plan list — but only once the
  // live list has resolved, so a just-added category isn't 404'd by the
  // fallback pair.
  if (!tierParam || (plansFetched && !planOptions.some((o) => o.key === tierParam))) {
    notFound();
  }
  const tierKey = tierParam as TierKey;

  const { profile } = useAuth();
  const profileInstitutionId = (profile?.institution_id as string | undefined) ?? undefined;

  const weekOptions = useMemo(() => computeWeekOptions(), []);
  const [weekStartDate, setWeekStartDate] = useState<string>(weekOptions[0]!.value);

  // Boys/Girls selector — the menu is a tier × gender matrix, where gender is
  // the caterer's `gender_served`. Default to Girls (most-recently populated).
  const [gender, setGender] = useState<EditorGender>('girls');

  // useMessCaterers returns ALL caterers for super-admins (the hook internally
  // passes `undefined` institution to getCaterers when isSuperAdmin), and the
  // institution-scoped set otherwise. From that list we pick the caterer that
  // serves the selected gender (falling back to a 'both'-gender caterer).
  const { data: caterersResult, isLoading: caterersLoading } = useMessCaterers(profileInstitutionId);
  const caterers = caterersResult?.data ?? [];
  const genderCaterer =
    caterers.find((c) => c.gender_served === gender) ??
    caterers.find((c) => c.gender_served === 'both');
  const catererId = genderCaterer?.id;
  // Super-admins have a null profile.institution_id, so derive institution from
  // the resolved caterer; institution-scoped users fall back to their own.
  const institutionId = genderCaterer?.institution_id ?? profileInstitutionId;

  // "Copy last week → this week" — seeds the selected week from the most recent
  // prior week so publishing is 2 clicks, not 28 cell edits.
  const copyWeek = useCopyMessMenuWeek();
  const canCopy = !!institutionId && !!catererId && !copyWeek.isPending;

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
                Mess Menu — {planLabel(planOptions, tierKey).toUpperCase()}
              </h1>
              <p className="text-sm text-muted-foreground">
                7 days × 4 meal slots. Tamil items are source-of-truth; English is optional.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Boys/Girls segmented toggle (plain buttons — Radix Tabs flake under
                synthetic clicks; useState setters are reliable). */}
            <div
              className="inline-flex rounded-md border border-border p-0.5"
              role="group"
              aria-label="Hostel gender"
            >
              {GENDER_OPTIONS.map((g) => (
                <Button
                  key={g.value}
                  size="sm"
                  variant={gender === g.value ? 'default' : 'ghost'}
                  className="h-8 px-3"
                  aria-pressed={gender === g.value}
                  onClick={() => setGender(g.value)}
                >
                  {g.label}
                </Button>
              ))}
            </div>

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

            {/* Copy last week → the selected week — the friction-killer that
                keeps weekly publishing (and the Choose Your Menu rating
                baseline) alive. Copies as 'planned' for review, idempotent. */}
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!canCopy}
              title="Fill this week from the most recent prior week's menu, then edit the changes"
              onClick={() => {
                if (!institutionId || !catererId) return;
                copyWeek.mutate({ institutionId, catererId, tierKey, targetWeekStart: weekStartDate });
              }}
            >
              {copyWeek.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              Copy last week
            </Button>
          </div>
        </header>

        {/* Tier toggle */}
        <nav aria-label="Tier picker" className="mb-4 flex flex-wrap gap-2">
          {planOptions.map((t) => (
            <Link key={t.key} href={`/campus-living/mess/menu-editor/${t.key}`}>
              <Badge
                variant={t.key === tierKey ? 'default' : 'outline'}
                className="cursor-pointer text-sm px-3 py-1"
              >
                {t.label.toUpperCase()}
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
            {caterersLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !catererId ? (
              <p className="text-sm text-muted-foreground">
                No {gender} hostel caterer configured — add one in the{' '}
                <Link href="/campus-living/mess/caterer-management" className="underline">
                  Caterers
                </Link>{' '}
                page first.
              </p>
            ) : !institutionId ? (
              <p className="text-sm text-muted-foreground">
                No institution context loaded — the selected caterer has no institution.
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
