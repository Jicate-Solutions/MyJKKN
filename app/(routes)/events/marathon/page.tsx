'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DataTable, type PermissionColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMarathonEvents, useUpdateMarathonStatus } from '@/hooks/events/marathon/use-marathon-events';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { Loader2, Plus, Calendar, MapPin, Eye, MoreHorizontal, ArrowRight, Settings, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import type { Event, EventStatus } from '@/types/events';
import { EVENT_STATUS_TRANSITIONS } from '@/types/events';

// Status badge color mapping
const STATUS_VARIANT: Record<
  EventStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  planning: 'outline',
  preparation: 'outline',
  execution: 'default',
  live: 'default',
  post_event: 'secondary',
  archived: 'secondary',
  cancelled: 'destructive',
};

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  planning: 'Planning',
  preparation: 'Preparation',
  execution: 'Execution',
  live: 'Live',
  post_event: 'Post Event',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export default function MarathonEventsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { selectedInstitutionId, loading: institutionLoading } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || profile?.institution_id || '';
  const updateStatus = useUpdateMarathonStatus();

  const {
    data: events,
    isLoading,
    error,
    refetch,
  } = useMarathonEvents(institutionId);

  const columns: PermissionColumnDef<Event>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Event Name',
        cell: ({ row }) => (
          <div className="font-medium">{row.original.name}</div>
        ),
      },
      {
        accessorKey: 'year',
        header: 'Year',
        cell: ({ row }) => row.original.year ?? '-',
      },
      {
        accessorKey: 'event_date',
        header: 'Date',
        cell: ({ row }) => {
          const d = row.original.event_date;
          if (!d) return <span className="text-muted-foreground">Not set</span>;
          try {
            return (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {format(new Date(d), 'dd MMM yyyy')}
              </div>
            );
          } catch {
            return d;
          }
        },
      },
      {
        accessorKey: 'venue',
        header: 'Venue',
        cell: ({ row }) => {
          const v = row.original.venue;
          if (!v) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex items-center gap-1.5 max-w-[200px] truncate">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{v}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
              {STATUS_LABELS[status] ?? status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'target_registrations',
        header: 'Target',
        cell: ({ row }) => row.original.target_registrations ?? '-',
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const event = row.original;
          const allowedTransitions = EVENT_STATUS_TRANSITIONS[event.status] ?? [];

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push(`/events/marathon/${event.id}/dashboard`)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(`/events/marathon/${event.id}/registrations`)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Registrations
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(`/events/marathon/${event.id}/settings`)}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                {allowedTransitions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Change Status
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {allowedTransitions.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() =>
                              updateStatus.mutate({ id: event.id, status: s })
                            }
                          >
                            → {STATUS_LABELS[s] ?? s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [router, updateStatus]
  );

  // Global filter across name, venue, and year
  const globalFilterFn = (
    row: any,
    _columnId: string,
    filterValue: string
  ): boolean => {
    const search = filterValue.toLowerCase();
    const event = row.original as Event;
    return (
      (event.name?.toLowerCase().includes(search) ?? false) ||
      (event.venue?.toLowerCase().includes(search) ?? false) ||
      (event.year?.toString().includes(search) ?? false)
    );
  };

  if (authLoading || institutionLoading) {
    return (
      <ContentLayout title="Marathon Events">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Marathon Events">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Marathon Events</h1>
            <p className="text-sm text-muted-foreground">
              Manage marathon events, categories, registrations, and results.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load marathon events. Please try again.
          </div>
        )}

        {!isLoading && !error && (
          <DataTable
            columns={columns}
            data={events ?? []}
            searchPlaceholder="Search by name, venue, or year..."
            globalFilterFn={globalFilterFn}
            onRefresh={() => refetch()}
            tableTools={
              <Link href="/events/marathon/new">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Create Event
                </Button>
              </Link>
            }
          />
        )}
      </div>
    </ContentLayout>
  );
}
