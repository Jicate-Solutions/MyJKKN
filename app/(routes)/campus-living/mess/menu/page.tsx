'use client';

// Weekly Mess Menu — VIEWER (live-wired 2026-06-11).
// Replaces the hardcoded February mockup that shipped with the original
// scaffold: every cell, the week label and the "Published" badge were
// string literals, so real menus (mess_menus, written by the Menu Editor
// at /campus-living/mess/menu-editor/[tier]) never reflected here.
// This page reads the SAME mechanism the editor writes:
//   useMessMenuWeek(institutionId, weekStartDate, tierKey) → mess_menus.
// Cells render items_tamil (primary) + items_english, matching menu-grid.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChefHat, CalendarRange } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useMessMenuWeek, useActiveMessTiers } from '@/hooks/campus-living/use-mess-menu-week';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { MessMenu, MealType, TierKey } from '@/types/campus-living';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// The editor's grid uses these 4 slots ('tea' is the snacks slot in
// mess_menus rows; the MealType union also carries a legacy 'snacks').
const MEAL_ROWS = ['breakfast', 'lunch', 'tea', 'dinner'] as const satisfies readonly MealType[];
const MEAL_LABELS: Record<(typeof MEAL_ROWS)[number], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / Snacks',
  dinner: 'Dinner',
};

/**
 * Monday (ISO date) of the week containing today, shifted by `weekOffset`
 * weeks. Formats the LOCAL date — `toISOString()` converts to UTC and shifts
 * IST midnight back to the previous day (Monday → Sunday), which is exactly
 * the week-keying drift that made menus unfindable.
 */
function mondayOf(base: Date, weekOffset: number): string {
  const d = new Date(base);
  const dow = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function weekRangeLabel(mondayIso: string): string {
  const start = new Date(`${mondayIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Institution options for super admins. Per
 * feedback_user_institution_access_hook_unreliable_for_pickers: query the
 * institutions table directly (the access hook returns mixed entities and
 * may omit institutions for super admins).
 */
function useInstitutionOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['mess-menu-viewer', 'institutions'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .like('name', 'JKKN%')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

export default function WeeklyMessMenuPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const profileInstitutionId = (profile?.institution_id as string | undefined) ?? undefined;

  const [weekOffset, setWeekOffset] = useState(0);
  const [tierKey, setTierKey] = useState<TierKey>('standard');
  const [pickedInstitutionId, setPickedInstitutionId] = useState<string | undefined>(undefined);

  const { data: institutions } = useInstitutionOptions(isSuperAdmin);
  const institutionId =
    pickedInstitutionId ?? profileInstitutionId ?? (isSuperAdmin ? institutions?.[0]?.id : undefined);

  const weekStartDate = useMemo(() => mondayOf(new Date(), weekOffset), [weekOffset]);

  const { data: tiers } = useActiveMessTiers(institutionId);
  const tierOptions: TierKey[] =
    tiers && tiers.length > 0 ? (tiers as TierKey[]) : (['standard', 'premium'] as TierKey[]);

  const { data: cells, isLoading } = useMessMenuWeek(institutionId, weekStartDate, tierKey);

  const lookup = useMemo(() => {
    const m = new Map<string, MessMenu>();
    for (const row of cells ?? []) m.set(`${row.day_of_week}-${row.meal_type}`, row);
    return m;
  }, [cells]);

  const hasAnyItems = (cells ?? []).some(
    (c) =>
      (c.items_tamil?.length ?? 0) > 0 ||
      (c.items_english?.length ?? 0) > 0 ||
      ((c.items as string[] | null)?.length ?? 0) > 0,
  );
  // Real MenuStatus lifecycle: planned → confirmed → served (no 'published';
  // the old mockup's "Published" badge was fictional vocabulary).
  const weekStatus: 'confirmed' | 'planned' | 'none' = !cells?.length
    ? 'none'
    : cells.some((c) => c.status === 'confirmed' || c.status === 'served')
      ? 'confirmed'
      : 'planned';

  return (
    <ContentLayout title="Menu">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ChefHat className="h-6 w-6 text-primary" />
              Weekly Mess Menu
            </h1>
            <p className="text-muted-foreground">
              What the kitchen serves this week, by tier. Menus are managed in the Menu Editor.
            </p>
          </div>
          {isSuperAdmin && (
            <Button asChild variant="outline">
              <Link href={`/campus-living/mess/menu-editor/${tierKey}`}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Open Menu Editor
              </Link>
            </Button>
          )}
        </div>

        {/* Context bar: week nav · tier toggle · institution (super admin) */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous week"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[230px] text-center">
                <p className="font-semibold">{weekRangeLabel(weekStartDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {weekOffset === 0 ? 'Current week' : `Week of ${weekStartDate}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next week"
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                  Today
                </Button>
              )}
              {weekStatus === 'confirmed' && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Confirmed</Badge>
              )}
              {weekStatus === 'planned' && <Badge variant="secondary">Draft — planned</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Tier toggle — segmented buttons (not tabs) */}
              <div className="inline-flex rounded-md border border-border p-0.5">
                {tierOptions.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={tierKey === t ? 'default' : 'ghost'}
                    className="capitalize"
                    onClick={() => setTierKey(t)}
                  >
                    {t.replace('_', ' ')}
                  </Button>
                ))}
              </div>

              {isSuperAdmin && (institutions?.length ?? 0) > 0 && (
                <Select value={institutionId ?? ''} onValueChange={(v) => setPickedInstitutionId(v)}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions!.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Grid / states */}
        {!institutionId ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No institution context loaded — sign in with an institution-scoped account.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !hasAnyItems ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <ChefHat className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No menu published for this week yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {weekStatus === 'planned'
                  ? 'A draft plan exists for this week but its meals are still empty.'
                  : 'No weekly plan exists for this week.'}{' '}
                {isSuperAdmin ? 'Fill and publish it from the Menu Editor.' : 'Please check back later.'}
              </p>
              {isSuperAdmin && (
                <Button asChild size="sm" className="mt-2">
                  <Link href={`/campus-living/mess/menu-editor/${tierKey}`}>Open Menu Editor</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted/30 p-2 text-left">Meal</th>
                    {DAY_LABELS.map((d) => (
                      <th key={d} className="border border-border bg-muted/30 p-2 text-left">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MEAL_ROWS.map((meal) => (
                    <tr key={meal}>
                      <th
                        scope="row"
                        className="border border-border bg-muted/20 p-2 text-left align-top font-medium"
                      >
                        {MEAL_LABELS[meal]}
                      </th>
                      {DAY_LABELS.map((_, i) => {
                        const cell = lookup.get(`${i + 1}-${meal}`) ?? null;
                        const tamil = cell?.items_tamil ?? [];
                        const english = cell?.items_english ?? [];
                        const legacy = ((cell?.items as string[] | null) ?? []).filter(Boolean);
                        const empty = tamil.length === 0 && english.length === 0 && legacy.length === 0;
                        return (
                          <td key={i} className="h-24 min-w-[130px] border border-border p-2 align-top">
                            {empty ? (
                              <p className="text-xs italic text-muted-foreground">—</p>
                            ) : (
                              <div className="space-y-0.5">
                                {tamil.map((it, idx) => (
                                  <p key={`t-${idx}`} className="text-sm leading-snug">
                                    {it}
                                  </p>
                                ))}
                                {english.map((it, idx) => (
                                  <p key={`e-${idx}`} className="text-xs leading-snug text-muted-foreground">
                                    {it}
                                  </p>
                                ))}
                                {tamil.length === 0 &&
                                  english.length === 0 &&
                                  legacy.map((it, idx) => (
                                    <p key={`l-${idx}`} className="text-sm leading-snug">
                                      {it}
                                    </p>
                                  ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
