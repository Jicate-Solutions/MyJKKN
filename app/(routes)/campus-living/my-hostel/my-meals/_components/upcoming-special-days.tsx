'use client';

// ============================================================================
// My Meals — "Special days coming up" (Mode C resident surface, ships dark)
// ----------------------------------------------------------------------------
// Reads approved + future special-day proposals (fn_mess_special_day_list,
// status='approved', upcoming) so residents see festival menus confirmed for
// the days ahead. Renders only in the engagement layer (master ON), like the
// rest of Layer 2 — no "coming soon" leak while the feature is dark.
// ============================================================================

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarHeart } from 'lucide-react';
import { useSpecialDays } from '@/hooks/campus-living/use-mess-special-day';

export function UpcomingSpecialDays({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = useSpecialDays('approved', true, enabled);
  if (!enabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarHeart className="h-4 w-4 text-rose-600" />
          Special days coming up
        </CardTitle>
        <CardDescription>Festival menus confirmed for the days ahead.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No special days planned yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.map((s) => (
              <li key={s.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{s.occasion_name ?? 'Special day'}</span>
                  <Badge variant="secondary" className="shrink-0">{s.special_date}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {s.meal_type}
                  {s.dishes && s.dishes.length > 0 ? ` · ${s.dishes.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
