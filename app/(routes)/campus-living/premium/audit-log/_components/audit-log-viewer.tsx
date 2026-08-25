'use client';

// ============================================================================
// Premium Room Phase 2 — Audit Log Viewer
// ============================================================================
// Filterable list of hostel_premium_audit_log rows. Filters: event_type,
// tier, institution, date range, free-text search. Click a row to view
// the full before/after JSON diff in a dialog.
// ============================================================================

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePremiumAuditEvents } from '@/hooks/campus-living/use-premium-audit';
import type {
  PremiumAuditEventType,
  PremiumAuditFilters,
  PremiumAuditLogRow,
} from '@/types/campus-living/premium-audit';

import { AuditEventDetailDialog } from './audit-event-detail-dialog';

type EventTypeFilter = PremiumAuditEventType | 'all';
type TierKeyFilter = 'all' | 'standard' | 'premium' | 'premium_plus';

const PAGE_SIZE = 25;

const EVENT_TYPE_OPTIONS: ReadonlyArray<{ value: EventTypeFilter; label: string }> = [
  { value: 'all', label: 'All events' },
  { value: 'override', label: 'Chief warden override' },
  { value: 'tier_change', label: 'Tier change' },
  { value: 'room_change', label: 'Room / bed change' },
  { value: 'status_change', label: 'Status change' },
  { value: 'fee_status_change', label: 'Fee status change' },
  { value: 'opt_in', label: 'Premium opt-in' },
  { value: 'opt_out', label: 'Premium opt-out' },
  { value: 'invite_sent', label: 'Roommate invite sent' },
  { value: 'invite_resolved', label: 'Roommate invite resolved' },
];

export function AuditLogViewer() {
  const [eventType, setEventType] = useState<EventTypeFilter>('all');
  const [tierKey, setTierKey] = useState<TierKeyFilter>('all');
  const [institutionId, setInstitutionId] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<PremiumAuditLogRow | null>(null);

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const filters: PremiumAuditFilters = useMemo(
    () => ({
      eventTypes: eventType === 'all' ? undefined : [eventType],
      tierKey: tierKey === 'all' ? null : tierKey,
      institutionId: institutionId === 'all' ? null : institutionId,
      fromDate: fromDate ? new Date(fromDate).toISOString() : null,
      toDate: toDate ? new Date(toDate + 'T23:59:59.999Z').toISOString() : null,
      search: search.trim() || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [eventType, tierKey, institutionId, fromDate, toDate, search, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } =
    usePremiumAuditEvents(filters);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const rows = data?.rows ?? [];

  const resetFilters = () => {
    setEventType('all');
    setTierKey('all');
    setInstitutionId('all');
    setFromDate('');
    setToDate('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-event-type">
              Event type
            </Label>
            <Select
              value={eventType}
              onValueChange={(v) => {
                setEventType(v as EventTypeFilter);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-tier">
              Tier
            </Label>
            <Select
              value={tierKey}
              onValueChange={(v) => {
                setTierKey(v as TierKeyFilter);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="premium_plus">Premium+</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-institution">
              College
            </Label>
            <Select
              value={institutionId}
              onValueChange={(v) => {
                setInstitutionId(v);
                setPage(1);
              }}
              disabled={institutionsLoading}
            >
              <SelectTrigger id="filter-institution">
                <SelectValue placeholder="All colleges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All colleges</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-search">
              Search
            </Label>
            <Input
              id="filter-search"
              placeholder="Learner / actor / reason"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-from">
              From date
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="filter-to">
              To date
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="col-span-1 flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              disabled={
                eventType === 'all'
                && tierKey === 'all'
                && institutionId === 'all'
                && !fromDate
                && !toDate
                && !search
              }
            >
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* Result table */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load audit events: {error?.message ?? 'unknown error'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">No audit events match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The audit table starts populating from the moment the trigger was
            installed — earlier allocations don't have history. Reset filters
            to see all events.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">When</TableHead>
                  <TableHead className="w-[160px]">Event</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[180px]">Actor</TableHead>
                  <TableHead className="w-[120px]">Tier</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <EventTypeBadge eventType={row.event_type} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="line-clamp-2">{row.description}</div>
                      {row.override_reason && row.event_type !== 'override' && (
                        <div
                          className="mt-1 line-clamp-1 text-xs text-muted-foreground"
                          title={row.override_reason}
                        >
                          override-reason carried: {row.override_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{row.actor_name ?? 'System'}</div>
                      {row.actor_email && (
                        <div className="text-xs text-muted-foreground">
                          {row.actor_email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.new_tier_key ? (
                        <div className="flex flex-col gap-0.5">
                          <span>{row.new_tier_key}</span>
                          {row.old_tier_key && row.old_tier_key !== row.new_tier_key && (
                            <span className="text-muted-foreground">
                              was {row.old_tier_key}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetailRow(row)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="tabular-nums">
                Page {page} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AuditEventDetailDialog
        row={detailRow}
        open={!!detailRow}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function EventTypeBadge({ eventType }: { eventType: PremiumAuditEventType }) {
  switch (eventType) {
    case 'override':
      return <Badge>Override</Badge>;
    case 'tier_change':
      return <Badge variant="secondary">Tier change</Badge>;
    case 'room_change':
      return <Badge variant="outline">Room move</Badge>;
    case 'status_change':
      return <Badge variant="outline">Status</Badge>;
    case 'fee_status_change':
      return <Badge variant="outline">Fee status</Badge>;
    case 'opt_in':
      return <Badge variant="secondary">Opt-in</Badge>;
    case 'opt_out':
      return <Badge variant="outline">Opt-out</Badge>;
    case 'invite_sent':
      return <Badge variant="outline">Invite</Badge>;
    case 'invite_resolved':
      return <Badge variant="outline">Invite resolved</Badge>;
    default:
      return <Badge variant="outline">{eventType}</Badge>;
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
