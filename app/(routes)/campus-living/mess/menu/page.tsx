'use client';

// Weekly Mess Menu — VIEWER (tier × gender, 2026-06-11 v2).
// The mess menu is ONE shared set for all JKKN colleges, varying only by
// TIER (classic/premium — the mess_categories names) and GENDER (boys/girls). It is NOT
// per-institution — so this page has no institution chooser. Gender lives on
// the caterer (mess_caterers.gender_served); the read goes through the
// SECURITY DEFINER fn_mess_menu_week so every college sees the same menu
// regardless of the institution-scoped RLS on mess_menus.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, ChefHat, CalendarRange } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { MealType, TierKey } from '@/types/campus-living';
import { useMessPlanOptions } from '@/lib/services/campus-living/mess-plan-options';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ROWS = ['breakfast', 'lunch', 'tea', 'dinner'] as const satisfies readonly MealType[];
const MEAL_LABELS: Record<(typeof MEAL_ROWS)[number], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / Snacks',
  dinner: 'Dinner',
};

// Plan options come LIVE from mess_categories (auto-follow, 2026-06-12) —
// see useMessPlanOptions; the hook falls back to Classic/Premium.
type Gender = 'boys' | 'girls';
const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: 'boys', label: 'Boys' },
  { key: 'girls', label: 'Girls' },
];

interface MenuCell {
  day_of_week: number;
  meal_type: MealType;
  items: string[];
  items_tamil: string[];
  items_english: string[];
  status: string;
  is_special_day: boolean;
  special_day_name: string | null;
}
interface MenuWeekResult {
  week_start: string;
  tier_key: string;
  gender: string;
  cells: MenuCell[];
}

/** Monday (ISO date) of the week containing today, shifted by `weekOffset`.
 *  Formats the LOCAL date — toISOString() would shift IST midnight to the
 *  previous UTC day and mis-key the week (the original "not reflecting" bug). */
function mondayOf(base: Date, weekOffset: number): string {
  const d = new Date(base);
  const dow = d.getDay();
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
 * Which (tiers, genders) actually have menu cells authored — powers the
 * data-aware default below. fn_mess_menu_facets shipped with #1339 for the
 * viewer's selectors but was never consumed; today all menus are girls',
 * so a hardcoded 'boys' default opened the page on an empty dataset
 * (Director screenshot, 2026-06-12).
 */
function useMenuFacets() {
  return useQuery({
    queryKey: ['mess-menu-facets'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ tiers: string[]; genders: string[] }> => {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_menu_facets');
      if (error) throw error;
      const d = (data ?? {}) as { tiers?: unknown; genders?: unknown };
      return {
        tiers: Array.isArray(d.tiers) ? (d.tiers as string[]) : [],
        genders: Array.isArray(d.genders) ? (d.genders as string[]) : [],
      };
    },
  });
}

function useMenuWeek(weekStart: string, tier: TierKey, gender: Gender) {
  return useQuery({
    queryKey: ['mess-menu-week', weekStart, tier, gender],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MenuWeekResult> => {
      const supabase = createClientSupabaseClient();
      // fn_mess_menu_week isn't in generated types — untyped-client cast
      // (same idiom as use-choose-your-menu's useMyMenuWeek).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_mess_menu_week', {
        p_week_start: weekStart,
        p_tier_key: tier,
        p_gender: gender,
      });
      if (error) throw error;
      return (data ?? { week_start: weekStart, tier_key: tier, gender, cells: [] }) as MenuWeekResult;
    },
  });
}

export default function WeeklyMessMenuPage() {
  const { isSuperAdmin } = usePermissions();
  const { options: planOptions } = useMessPlanOptions();
  const [weekOffset, setWeekOffset] = useState(0);
  const [tier, setTier] = useState<TierKey>('classic');
  const [gender, setGender] = useState<Gender>('boys');

  // Data-aware initial selection: once facets load, snap any selection with
  // ZERO authored menus anywhere onto one that has data (e.g. all menus are
  // girls' today → land on Girls, not an empty Boys page). Runs once; the
  // user's own taps afterwards always win.
  const { data: facets } = useMenuFacets();
  const snappedToData = useRef(false);
  useEffect(() => {
    if (snappedToData.current || !facets) return;
    snappedToData.current = true;
    if (facets.genders.length > 0 && !facets.genders.includes(gender)) {
      setGender(facets.genders[0] as Gender);
    }
    if (facets.tiers.length > 0 && !facets.tiers.includes(tier)) {
      setTier(facets.tiers[0]);
    }
  }, [facets, gender, tier]);

  const weekStart = useMemo(() => mondayOf(new Date(), weekOffset), [weekOffset]);
  const { data, isLoading } = useMenuWeek(weekStart, tier, gender);

  const cells = data?.cells ?? [];
  const lookup = useMemo(() => {
    const m = new Map<string, MenuCell>();
    for (const c of cells) m.set(`${c.day_of_week}-${c.meal_type}`, c);
    return m;
  }, [cells]);

  const hasAnyItems = cells.some(
    (c) => (c.items_tamil?.length ?? 0) > 0 || (c.items_english?.length ?? 0) > 0 || (c.items?.length ?? 0) > 0,
  );
  const weekStatus: 'confirmed' | 'planned' | 'none' = !cells.length
    ? 'none'
    : cells.some((c) => c.status === 'confirmed' || c.status === 'served')
      ? 'confirmed'
      : 'planned';

  return (
    <ContentLayout title="Menu">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ChefHat className="h-6 w-6 text-primary" />
              Weekly Mess Menu
            </h1>
            <p className="text-muted-foreground">
              The same menu across all colleges — by tier and by hostel (boys / girls).
            </p>
          </div>
          {isSuperAdmin && (
            <Button asChild variant="outline">
              <Link href={`/campus-living/mess/menu-editor/${tier}`}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Open Menu Editor
              </Link>
            </Button>
          )}
        </div>

        {/* Context bar: week nav · gender toggle · tier toggle (NO institution) */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 text-center sm:min-w-[230px] sm:flex-none">
                <p className="font-semibold">{weekRangeLabel(weekStart)}</p>
                <p className="text-xs text-muted-foreground">
                  {weekOffset === 0 ? 'Current week' : `Week of ${weekStart}`}
                </p>
              </div>
              <Button variant="outline" size="sm" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
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
              {/* Gender toggle — segmented buttons */}
              <div className="inline-flex rounded-md border border-border p-0.5">
                {GENDER_OPTIONS.map((g) => (
                  <Button
                    key={g.key}
                    size="sm"
                    variant={gender === g.key ? 'default' : 'ghost'}
                    onClick={() => setGender(g.key)}
                  >
                    {g.label}
                  </Button>
                ))}
              </div>
              {/* Tier toggle — segmented buttons */}
              <div className="inline-flex rounded-md border border-border p-0.5">
                {planOptions.map((t) => (
                  <Button
                    key={t.key}
                    size="sm"
                    variant={tier === t.key ? 'default' : 'ghost'}
                    onClick={() => setTier(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grid / states */}
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !hasAnyItems ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <ChefHat className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No menu published for this week yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {weekStatus === 'planned'
                  ? 'A draft plan exists for this week but its meals are still empty.'
                  : 'No weekly plan exists for this tier and hostel yet.'}{' '}
                {isSuperAdmin ? 'Fill and publish it from the Menu Editor.' : 'Please check back later.'}
              </p>
              {isSuperAdmin && (
                <Button asChild size="sm" className="mt-2">
                  <Link href={`/campus-living/mess/menu-editor/${tier}`}>Open Menu Editor</Link>
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
                        const legacy = (cell?.items ?? []).filter(Boolean);
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
