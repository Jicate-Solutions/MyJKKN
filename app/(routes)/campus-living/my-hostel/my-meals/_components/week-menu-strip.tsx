'use client';

// ============================================================================
// My Meals — week menu strip (P0c)
// ----------------------------------------------------------------------------
// The Clarity surface: "what I get this week" for the resident's own
// tier × gender, no pickers. Day selection via segmented buttons (NOT Radix
// Tabs — CFT click-flake class), defaulting to today. Data comes from
// fn_mess_menu_week, which has the default-week fallback server-side, so a
// week with no explicit menu still renders the standing menu.
// ============================================================================

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CalendarRange, ChefHat, Sparkles, Star } from 'lucide-react';
import { useMessPlanOptions, planLabel } from '@/lib/services/campus-living/mess-plan-options';
import type { MenuWeekResult } from '@/hooks/campus-living/use-choose-your-menu';
import { RateMealDialog } from '@/app/(routes)/campus-living/mess/menu/_components/rate-meal-dialog';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ROWS = ['breakfast', 'lunch', 'tea', 'dinner'] as const;
const MEAL_LABELS: Record<(typeof MEAL_ROWS)[number], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / Snacks',
  dinner: 'Dinner',
};

/** ISO day-of-week for today: Mon=1 … Sun=7 (matches menu cell keying). */
function todayIsoDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

// Plan label resolves from the LIVE categories page (auto-follow).

export function WeekMenuStrip({
  menu,
  isLoading,
  tierKey,
  canChoose = false,
  chosenByMeal = {},
  onChoose,
  profileId = null,
}: {
  menu: MenuWeekResult | undefined;
  isLoading: boolean;
  tierKey: string;
  /** Mode A gate, computed by the page (master ON + plan enabled). */
  canChoose?: boolean;
  /** `${day}-${meal}` → picked dish, for the "Your pick" badge. */
  chosenByMeal?: Record<string, string>;
  onChoose?: (dayOfWeek: number, mealType: string, mealLabel: string) => void;
  /**
   * profiles.id (== auth.uid()) — enables the per-cell RateMealDialog. The
   * dialog only renders when the cell carries its mess_menus row identity
   * (fn_mess_menu_week extension, 2026-07-26 migration) AND useCanRate allows
   * (active allocation / mess plan, rating window still open).
   */
  profileId?: string | null;
}) {
  const [selectedDay, setSelectedDay] = useState(todayIsoDow());
  const { options: planOptions } = useMessPlanOptions();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const cells = menu?.cells ?? [];
  const dayCells = cells.filter((c) => c.day_of_week === selectedDay);
  const cellFor = (meal: string) => dayCells.find((c) => c.meal_type === meal);
  const today = todayIsoDow();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ChefHat className="h-4 w-4 text-primary" />
          This week&apos;s menu
        </CardTitle>
        <CardDescription className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="h-3.5 w-3.5" />
          Week of {menu?.week_start ?? '—'}
          <Badge variant="outline">{planLabel(planOptions, tierKey)}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Day selector — segmented buttons, today highlighted */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DAY_LABELS.map((label, i) => {
            const dow = i + 1;
            const isSelected = selectedDay === dow;
            const isToday = today === dow;
            return (
              <button
                key={dow}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedDay(dow)}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {label}
                {isToday && (
                  <span className={cn('ml-1 text-[10px]', isSelected ? 'opacity-90' : 'text-primary')}>
                    • today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {cells.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No menu published for your hostel yet — check back soon.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {MEAL_ROWS.map((meal) => {
              const cell = cellFor(meal);
              const items =
                cell && cell.items_english.length > 0
                  ? cell.items_english
                  : cell?.items ?? [];
              const myPick = chosenByMeal[`${selectedDay}-${meal}`];
              return (
                <div key={meal} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold">{MEAL_LABELS[meal]}</p>
                    <span className="flex items-center gap-1.5">
                      {cell?.is_special_day && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Sparkles className="mr-1 h-3 w-3" />
                          {cell.special_day_name ?? 'Special day'}
                        </Badge>
                      )}
                      {canChoose && onChoose && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => onChoose(selectedDay, meal, MEAL_LABELS[meal])}
                        >
                          {myPick ? 'Change' : 'Choose'}
                        </Button>
                      )}
                      {/* Rating intake (the loop's measurement leg). Renders
                          only when the cell carries its menu-row identity AND
                          useCanRate (inside the dialog) allows — allocation /
                          mess plan + the post-meal rating window. */}
                      {profileId && cell?.id && cell.institution_id && cell.week_start_date && (
                        <RateMealDialog
                          profileId={profileId}
                          menu={{
                            id: cell.id,
                            institution_id: cell.institution_id,
                            week_start_date: cell.week_start_date,
                            day_of_week: selectedDay,
                            meal_type: meal,
                            items_tamil: cell.items_tamil,
                            items_english: cell.items_english,
                            items: cell.items,
                          }}
                          trigger={
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                              <Star className="mr-1 h-3 w-3 text-yellow-500" />
                              Rate
                            </Button>
                          }
                        />
                      )}
                    </span>
                  </div>
                  {myPick && (
                    <Badge className="mb-1.5 text-[10px]" variant="secondary">
                      Your pick: {myPick}
                    </Badge>
                  )}
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Not set</p>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {items.join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
