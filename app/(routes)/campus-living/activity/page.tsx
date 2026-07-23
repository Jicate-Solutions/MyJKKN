'use client';

import { useMemo, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useActivityFeed } from '@/hooks/campus-living/use-activity-feed';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { ActivityEventRow } from './_components/event-row';
import {
  ActivityFilters,
  ACTIVITY_FILTERS_DEFAULT,
  type ActivityFiltersValue,
} from './_components/activity-filters';
import type {
  ActivityFeedFilters,
  CampusLivingEventType,
} from '@/types/campus-living/activity-feed';

/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

const PAGE_SIZE = 50;

export default function CampusLivingActivityPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const [filters, setFilters] = useState<ActivityFiltersValue>(
    ACTIVITY_FILTERS_DEFAULT,
  );
  const [page, setPage] = useState(1);

  // Translate UI filter state into service-layer filter object
  const feedFilters = useMemo<Omit<ActivityFeedFilters, 'institution_id'>>(
    () => ({
      event_type:
        filters.event_type === 'all'
          ? undefined
          : (filters.event_type as CampusLivingEventType),
      block_id: filters.block_id === 'all' ? undefined : filters.block_id,
      date_from: filters.date_from ? `${filters.date_from}T00:00:00Z` : undefined,
      date_to: filters.date_to ? `${filters.date_to}T23:59:59Z` : undefined,
    }),
    [filters],
  );

  const { data, isLoading, isFetching, error } = useActivityFeed({
    institutionId,
    filters: feedFilters,
    page,
    pageSize: PAGE_SIZE,
  });

  const { data: blockListData } = useHostelBlocks(institutionId);
  const blocks = ((blockListData as any)?.data ?? []).map((b: any) => ({
    id: b.id,
    name: b.name,
  }));

  const events = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Campus Living', href: '/campus-living' },
    { label: 'Activity Feed' },
  ];

  return (
    <ContentLayout title="Activity Feed">
      <PageBreadcrumb items={breadcrumbs} />

      <div className="container mx-auto p-6 space-y-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Activity Feed
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Chronological stream of attendance, leave, gate-pass,
              maintenance, and incident events across all hostels.
              {isFetching && !isLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  refreshing…
                </span>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{totalCount}</span>{' '}
              {totalCount === 1 ? 'event' : 'events'}
            </div>
            <div>Auto-refresh: 30s</div>
          </div>
        </header>

        <Card>
          <CardContent className="pt-6">
            <ActivityFilters
              value={filters}
              onChange={(v) => {
                setFilters(v);
                setPage(1);
              }}
              blocks={blocks}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="py-16 text-center">
                <p className="text-sm text-destructive">
                  Could not load activity feed. Try again in a moment.
                </p>
              </div>
            ) : events.length === 0 ? (
              <EmptyState filters={filters} />
            ) : (
              <>
                <div className="divide-y divide-border">
                  {events.map((event) => (
                    <ActivityEventRow key={event.id} event={event} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || isFetching}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || isFetching}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function EmptyState({ filters }: { filters: ActivityFiltersValue }) {
  const hasActiveFilters =
    filters.event_type !== 'all' ||
    filters.block_id !== 'all' ||
    filters.date_from !== '' ||
    filters.date_to !== '';

  return (
    <div className="py-16 text-center">
      <div className="inline-flex rounded-full bg-muted p-4 mb-4">
        <Activity className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-sm">
        {hasActiveFilters ? 'No events match these filters' : 'No activity yet'}
      </h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        {hasActiveFilters
          ? 'Try widening the date range or clearing a filter.'
          : 'Attendance check-ins, leave requests, gate passes, maintenance tickets, and incidents will appear here as they happen.'}
      </p>
    </div>
  );
}
