'use client';

// app/(routes)/internships/cycles/page.tsx
// Internship Posting Cycles — list view (Phase 2A, Decision #1)
// Renders all cycles ordered created_at DESC with college/status/year filter chips.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarRange,
  Plus,
  X,
  GraduationCap,
  Users2,
  CalendarDays,
  CircleDashed,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCycles } from '@/hooks/internships/useCycles';
import type { CycleStatus, InternshipCycle } from '@/lib/services/internships/types';
import { CycleStatusBadge } from './_components/cycle-status-badge';
import { CollegeSelect, useCollegeNameMap } from './_components/college-select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../_components/no-access-alert';

const STATUS_OPTIONS: Array<{ value: 'all' | CycleStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'fee_checking', label: 'Fee checking' },
  { value: 'assignments_ready', label: 'Assignments ready' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Date columns come back as 'YYYY-MM-DD'; appending 'T00:00:00' keeps Date local-tz-stable.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InternshipCyclesPage() {
  const [collegeFilter, setCollegeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CycleStatus>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const collegeNameMap = useCollegeNameMap();

  const institutionFilter = collegeFilter === 'all' ? undefined : collegeFilter;
  const { data: cycles = [], isLoading, error, refetch } = useCycles(institutionFilter);

  // Derive the unique posting_type set for the type filter chip
  // (replaces academic_year — which doesn't exist on live schema).
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cycles) if (c.posting_type) set.add(c.posting_type);
    return Array.from(set).sort();
  }, [cycles]);

  const filtered = useMemo(() => {
    return cycles.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (yearFilter !== 'all' && c.posting_type !== yearFilter) return false;
      return true;
    });
  }, [cycles, statusFilter, yearFilter]);

  const hasActiveFilter =
    collegeFilter !== 'all' || statusFilter !== 'all' || yearFilter !== 'all';

  const clearFilters = () => {
    setCollegeFilter('all');
    setStatusFilter('all');
    setYearFilter('all');
  };

  return (
    <PermissionGuard module="internship.cycles" action="view" fallback={<NoAccessAlert />}>
    <ContentLayout title="Internship Posting Cycles">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/internships">Internships</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Cycles</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarRange className="h-6 w-6 text-orange-600" />
            Posting cycles
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each cycle is a college-scoped batch of internship postings. Activating a cycle locks
            its approval chain, posting type, fee threshold, and geofence per the policy spec.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/internships/cycles/new">
            <Plus className="h-4 w-4" />
            Create cycle
          </Link>
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label
              htmlFor="filter-college"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              College
            </label>
            <CollegeSelect
              value={collegeFilter}
              onChange={setCollegeFilter}
              includeAll
              triggerClassName="w-full"
              ariaLabel="Filter by college"
            />
          </div>

          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="filter-status"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as 'all' | CycleStatus)}
            >
              <SelectTrigger id="filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="filter-type"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Posting type
            </label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger id="filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Body */}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load cycles</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-sm">{(error as Error).message}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <CyclesTableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState hasFilter={hasActiveFilter} onClear={clearFilters} />
      ) : (
        <CyclesTable cycles={filtered} collegeNameMap={collegeNameMap} />
      )}
    </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CyclesTable({
  cycles,
  collegeNameMap,
}: {
  cycles: InternshipCycle[];
  collegeNameMap: Record<string, string>;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Cycle</TableHead>
            <TableHead className="min-w-[180px]">College</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Learners</TableHead>
            <TableHead className="w-[110px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cycles.map((cycle) => (
            <TableRow key={cycle.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/internships/cycles/${cycle.id}`}
                  className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {cycle.cycle_name}
                </Link>
                {cycle.notes && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {cycle.notes}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {collegeNameMap[cycle.institution_id] ?? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {cycle.institution_id.slice(0, 8)}…
                  </span>
                )}
              </TableCell>
              <TableCell>
                <CycleStatusBadge status={cycle.status} />
              </TableCell>
              <TableCell className="text-sm">
                <span className="capitalize">{cycle.posting_type}</span>
              </TableCell>
              <TableCell className="text-sm tabular-nums">{formatDate(cycle.start_date)}</TableCell>
              <TableCell className="text-sm tabular-nums">{formatDate(cycle.end_date)}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {cycle.learners_count?.toLocaleString('en-IN') ?? '—'}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/internships/cycles/${cycle.id}`}>View</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function EmptyState({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }) {
  if (hasFilter) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <CircleDashed className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-base font-medium">No cycles match the current filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try clearing one or more filters to see more results.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="rounded-full bg-orange-50 p-3">
          <CalendarRange className="h-8 w-8 text-orange-600" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">No posting cycles yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first cycle to start scheduling internship postings for a college and
            academic year.
          </p>
        </div>
        <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
          <Button asChild className="gap-2">
            <Link href="/internships/cycles/new">
              <Plus className="h-4 w-4" />
              Create your first cycle
            </Link>
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> 7 colleges
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> ~2,740 learners
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Locked policy after activation
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CyclesTableSkeleton() {
  return (
    <Card>
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </Card>
  );
}
