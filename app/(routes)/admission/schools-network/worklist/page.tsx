'use client';

/**
 * Schools Network — Visit Worklist.
 *
 * Turns the feeder priority ranking into assigned outreach: every adopted
 * school with its momentum delta, assigned coordinator, last visit, and a
 * ✓visit/✓contribution done-gate. "Auto-assign" fills owners in bulk; the
 * per-row popover reassigns. A daily cron nudges the coordinator of any school
 * that is slipping OR overdue (see /api/schools-network/visit-nudges/cron).
 *
 * Mirrors the list-page shell of app/(routes)/admission/schools-network/page.tsx
 * and the debounced staff picker of the owners/assign form.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownRight,
  Bell,
  Check,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  UserCog,
  Users,
  Wand2,
  X,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PermissionGuard, CanEdit } from '@/components/auth/permission-guard';

import {
  autoAssignVisits,
  getVisitWorklist,
  assignVisit,
  getAssignableOwners,
  type VisitWorklistRow,
} from '../_lib/worklist-api';

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Momentum badge — negative delta (slipping) is the whole point of the list. */
function MomentumBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (delta < 0) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 gap-1">
        <ArrowDownRight className="h-3 w-3" />
        {delta}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      {delta > 0 ? `+${delta}` : delta}
    </Badge>
  );
}

/** ✓visit ✓contribution done-gate cell. */
function StatusCell({ row }: { row: VisitWorklistRow }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span
        className={`inline-flex items-center gap-1 ${
          row.hasSession ? 'text-green-700' : 'text-muted-foreground'
        }`}
      >
        {row.hasSession ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        Visit
      </span>
      <span
        className={`inline-flex items-center gap-1 ${
          row.hasContribution ? 'text-green-700' : 'text-muted-foreground'
        }`}
      >
        {row.hasContribution ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        Contribution
      </span>
    </div>
  );
}

/**
 * Per-row assign popover. Source = ONLY existing coordinators / school owners
 * (Director ruling), fetched ONCE (react-query dedupes across every row) and
 * filtered client-side — not a live all-staff search. Empty state explains how
 * to add coordinators, so a fresh install (no owners yet) doesn't read as broken.
 */
function AssignControl({
  row,
  onAssign,
  pending,
}: {
  row: VisitWorklistRow;
  onAssign: (schoolId: string, assignedTo: string | null) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['schools-network', 'assignable-owners'],
    queryFn: getAssignableOwners,
    enabled: open, // only load when a picker is actually opened
    staleTime: 5 * 60 * 1000,
  });
  const owners = useMemo(() => data?.owners ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.fullName.toLowerCase().includes(q) ||
        (o.email ?? '').toLowerCase().includes(q) ||
        o.roleLabel.toLowerCase().includes(q)
    );
  }, [owners, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="h-7 gap-1">
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserCog className="h-3 w-3" />
          )}
          {row.assignedTo ? 'Reassign' : 'Assign'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8 h-9"
              placeholder="Filter coordinators…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-auto space-y-1">
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-1.5">Loading…</p>
            ) : owners.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1.5">
                No coordinators set up yet. Assign the &ldquo;Outreach
                Coordinator&rdquo; role to staff in User Management, or add a
                school owner first.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1.5">No match.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onAssign(row.schoolId, o.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:border-primary"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {o.fullName || o.email || 'Unnamed'}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[o.roleLabel, o.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {row.assignedTo && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => {
                onAssign(row.schoolId, null);
                setOpen(false);
              }}
            >
              <X className="h-3 w-3 mr-1" /> Unassign
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorklistSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 7 }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 7 }).map((__, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WorklistContent() {
  const queryClient = useQueryClient();
  const [pendingSchool, setPendingSchool] = useState<string | null>(null);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['schools-network', 'worklist'],
    queryFn: getVisitWorklist,
    placeholderData: (prev) => prev,
  });

  const rows: VisitWorklistRow[] = useMemo(() => data?.rows ?? [], [data]);

  const stats = useMemo(() => {
    let needsNudge = 0;
    let done = 0;
    let unassigned = 0;
    for (const r of rows) {
      if (r.nudgeEligible && !r.isDone) needsNudge++;
      if (r.isDone) done++;
      if (!r.assignedTo) unassigned++;
    }
    return { total: rows.length, needsNudge, done, unassigned };
  }, [rows]);

  const assignMutation = useMutation({
    mutationFn: ({ schoolId, assignedTo }: { schoolId: string; assignedTo: string | null }) =>
      assignVisit(schoolId, assignedTo),
    onMutate: ({ schoolId }) => setPendingSchool(schoolId),
    onSuccess: (_res, { assignedTo }) => {
      toast.success(assignedTo ? 'Coordinator assigned' : 'Assignment cleared');
      queryClient.invalidateQueries({ queryKey: ['schools-network', 'worklist'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to assign'),
    onSettled: () => setPendingSchool(null),
  });

  const autoAssignMutation = useMutation({
    mutationFn: autoAssignVisits,
    onSuccess: (res) => {
      toast.success(
        res.assigned > 0
          ? `Auto-assigned ${res.assigned} school${res.assigned === 1 ? '' : 's'}`
          : 'No unassigned schools had an owner or district match to auto-assign'
      );
      queryClient.invalidateQueries({ queryKey: ['schools-network', 'worklist'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Auto-assign failed'),
  });

  // Toast the load error as a side-effect, NOT in the render body (which would
  // re-fire a new toast on every re-render while the error persists).
  useEffect(() => {
    if (error && rows.length === 0 && !isLoading) {
      toast.error((error as Error).message || 'Failed to load worklist');
    }
  }, [error, rows.length, isLoading]);

  return (
    <div className="space-y-6">
      {/* Summary band */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Adopted schools</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs a nudge</CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.needsNudge}</div>
            <p className="text-xs text-muted-foreground">Slipping or overdue, not yet done</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Handled</CardTitle>
            <Check className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{stats.done}</div>
            <p className="text-xs text-muted-foreground">Visit + follow-up contribution</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unassigned}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Visit worklist
          </CardTitle>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              disabled={isFetching}
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ['schools-network', 'worklist'] })
              }
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {/* Edit-only: assigning owners needs schools.edit. Hidden (not
                403-on-click) for schools.view-only viewers. */}
            <CanEdit module="schools_network.schools" fallback={null}>
              <Button
                size="sm"
                onClick={() => autoAssignMutation.mutate()}
                disabled={autoAssignMutation.isPending}
              >
                {autoAssignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Auto-assign
              </Button>
            </CanEdit>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <WorklistSkeleton />
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No adopted schools yet</h3>
              <p className="text-muted-foreground">
                Adopt feeder schools from the discovery panel to start a visit worklist.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Momentum</TableHead>
                    <TableHead>Coordinator</TableHead>
                    <TableHead>Last visit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const stale = daysSince(row.lastVisit);
                    return (
                      <TableRow key={row.schoolId} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="font-medium">{row.schoolName}</div>
                          {row.isDone ? (
                            <Badge
                              variant="secondary"
                              className="mt-0.5 bg-green-100 text-green-800 hover:bg-green-100 gap-1"
                            >
                              <Check className="h-3 w-3" /> Handled
                            </Badge>
                          ) : row.nudgeEligible ? (
                            <Badge className="mt-0.5 bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
                              <Bell className="h-3 w-3" /> Needs nudge
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.district || '—'}
                        </TableCell>
                        <TableCell>
                          <MomentumBadge delta={row.cycleDelta} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.assignedToName ? (
                            row.assignedToName
                          ) : row.assignedTo ? (
                            <span className="text-muted-foreground">Assigned</span>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(row.lastVisit)}
                          {stale !== null && stale > 60 && (
                            // > 60 (not >=) to match the SQL nudge_eligible boundary
                            // (last_visit < now() - interval '60 days').
                            <div className="text-[11px] text-amber-600">{stale}d ago</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusCell row={row} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CanEdit
                            module="schools_network.schools"
                            fallback={<span className="text-xs text-muted-foreground">—</span>}
                          >
                            <AssignControl
                              row={row}
                              pending={pendingSchool === row.schoolId && assignMutation.isPending}
                              onAssign={(schoolId, assignedTo) =>
                                assignMutation.mutate({ schoolId, assignedTo })
                              }
                            />
                          </CanEdit>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VisitWorklistPage() {
  return (
    <PermissionGuard module="schools_network.schools" action="view">
      <ContentLayout title="Visit Worklist">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Visit Worklist</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <WorklistContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
