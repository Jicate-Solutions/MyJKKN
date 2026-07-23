'use client';

// ============================================================================
// MenuGrid — 7-column × 4-row weekly menu grid for a single tier.
// ============================================================================
// Reads via useMessMenuWeek(institutionId, weekStartDate, tierKey, catererId).
// catererId scopes the fetch to one gender (Boys/Girls) so the two menus stay
// in distinct rows and distinct query caches.
// Cells show items_tamil chips with items_english underneath (when present).
// "Edit" pencil opens CellEditDialog.
//
// The 2-hour edit cutoff is enforced server-side in
// MessMenuService.upsertMenuCell. This UI does NOT yet pre-compute the
// lock state for past-meal cells (a future polish — for now Director sees
// the cutoff toast only when trying to save).
// ============================================================================

import { useMemo, useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useMessMenuWeek } from '@/hooks/campus-living/use-mess-menu-week';
import type { MealType, MessMenu, TierKey } from '@/types/campus-living';

import { CellEditDialog } from './cell-edit-dialog';

interface MenuGridProps {
  institutionId: string;
  catererId: string;
  weekStartDate: string;
  tierKey: TierKey;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Display order matches the chairperson's photo layout.
const MEAL_ROWS: MealType[] = ['breakfast', 'lunch', 'tea', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast (07:30)',
  lunch: 'Lunch (12:30)',
  snacks: 'Snacks (legacy)',
  tea: 'Tea (16:30)',
  dinner: 'Dinner (19:00)',
};

interface EditTarget {
  dayOfWeek: number;
  mealType: MealType;
  existing: MessMenu | null;
}

export function MenuGrid({ institutionId, catererId, weekStartDate, tierKey }: MenuGridProps) {
  const { data: rows, isLoading } = useMessMenuWeek(institutionId, weekStartDate, tierKey, catererId);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  // Build a (day, meal) → MessMenu lookup so the grid render is O(1) per cell.
  const lookup = useMemo(() => {
    const m = new Map<string, MessMenu>();
    for (const row of rows ?? []) {
      m.set(`${row.day_of_week}-${row.meal_type}`, row);
    }
    return m;
  }, [rows]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 28 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <p>No menu rows seeded for this tier & week.</p>
          <p className="mt-1">
            Run the seed migration or use the editor to create cells.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border border-border bg-muted/40 p-2 text-left font-medium">
                Meal
              </th>
              {DAY_LABELS.map((d, i) => (
                <th
                  key={i}
                  className="border border-border bg-muted/40 p-2 text-left font-medium"
                >
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
                  const dayOfWeek = i + 1;
                  const cell = lookup.get(`${dayOfWeek}-${meal}`) ?? null;
                  const items = cell?.items_tamil ?? [];
                  const en = cell?.items_english ?? [];
                  return (
                    <td
                      key={i}
                      className="border border-border p-2 align-top h-32 min-w-[120px]"
                    >
                      <div className="flex h-full flex-col justify-between gap-2">
                        <div className="space-y-1">
                          {items.length === 0 ? (
                            <p className="text-xs italic text-muted-foreground">
                              (empty — Director to fill)
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {items.map((t, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-[11px] font-normal"
                                >
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {en.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              {en.join(', ')}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() =>
                              setEditTarget({ dayOfWeek, mealType: meal, existing: cell })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <CellEditDialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          existing={editTarget.existing}
          cell={{
            institutionId,
            catererId,
            weekStartDate,
            dayOfWeek: editTarget.dayOfWeek,
            mealType: editTarget.mealType,
            tierKey,
          }}
        />
      )}
    </>
  );
}
