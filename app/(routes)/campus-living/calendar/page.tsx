'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, AlertTriangle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useCalendarEvents } from '@/hooks/campus-living/use-calendar-events';
import type { CalendarEventSource } from '@/types/campus-living/calendar';
import { DEFAULT_CALENDAR_FILTER } from '@/types/campus-living/calendar';
import { FilterBar } from './_components/filter-bar';
import { MonthGrid } from './_components/month-grid';
import { DayEventsDialog } from './_components/day-events-dialog';
import { bucketEventsByDate } from './_components/calendar-utils';

/**
 * navMeta — invoked via row-click on /campus-living dashboard. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

export default function CampusLivingCalendarPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  });
  const [filter, setFilter] = useState(DEFAULT_CALENDAR_FILTER);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { events, isLoading, isError, errors, counts } = useCalendarEvents(institutionId);

  const filteredEvents = useMemo(
    () => events.filter((e) => filter[e.source as CalendarEventSource]),
    [events, filter],
  );

  const dayBucket = useMemo(() => bucketEventsByDate(filteredEvents), [filteredEvents]);
  const openDayEvents = openDate ? dayBucket.get(openDate) ?? [] : [];

  return (
    <ContentLayout title="Campus Living Calendar">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Calendar' },
        ]}
      />

      <div className="container mx-auto p-4 sm:p-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle>Unified calendar</CardTitle>
                <CardDescription>
                  Leaves, gate passes, maintenance windows, mess menu cycles, and incidents in
                  one view. Click a day to drill into its events.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FilterBar filter={filter} counts={counts} onChange={setFilter} />
          </CardContent>
        </Card>

        {isError && errors.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-2 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="font-medium text-destructive">
                  Some calendar sources failed to load
                </p>
                <p className="text-xs text-muted-foreground">
                  Affected: {errors.map((e) => e.source).join(', ')}. Other sources are still
                  shown.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <MonthGrid
            anchor={anchor}
            events={filteredEvents}
            onAnchorChange={setAnchor}
            onDayClick={setOpenDate}
          />
        )}

        <DayEventsDialog
          isoDate={openDate}
          events={openDayEvents}
          onClose={() => setOpenDate(null)}
        />
      </div>
    </ContentLayout>
  );
}
