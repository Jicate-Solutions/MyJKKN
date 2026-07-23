'use client';

// Not-Allocated tab on /campus-living/allocations.
// Shows every active hostelite without a bed, with block-independent readiness
// checks (profile, gender, academic year, room-category rule, academic bill)
// so the admin knows exactly WHY each student hasn't been placed and what to fix.
//
// "ready" = all blocking conditions pass → student can be auto-allocated or
// manually assigned a bed immediately.
// "incomplete" = one or more data gaps → admin must fix the flagged items first.

import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUnallocatedCandidates,
  unallocatedCandidatesKeys,
} from '@/hooks/campus-living/use-unallocated-candidates';
import { hostelAllocationKeys } from '@/hooks/campus-living/use-hostel-allocations';
import { AllocateRoomDialog } from '../../residents/_components/allocate-room-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle2,
  XCircle,
  BedDouble,
  Loader2,
  Search,
  AlertTriangle,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { UnallocatedCandidate } from '@/types/campus-living';
import type { LearnerHostelite } from '@/types/campus-living';

// Adapter: maps the minimal fields the AllocateRoomDialog actually reads
// from LearnerHostelite. Unallocated students have no current room, so those
// fields are left null — the dialog handles null current_room_id gracefully.
function toAllocatable(c: UnallocatedCandidate): LearnerHostelite {
  return {
    id: c.learner_id,
    first_name: c.first_name,
    last_name: c.last_name,
    student_email: c.email,
    college_email: null,
    roll_number: null,
    gender: c.gender,
    father_name: null,
    mother_name: null,
    accommodation_type: 'HOSTEL' as const,
    hostel_fee: null,
    dayscholar_fee: null,
    institution_id: c.institution_id,
    current_block_id: null,
    current_room_id: null,
    current_bed_id: null,
    current_allocation_id: null,
    current_block_name: null,
    current_block_code: null,
    current_room_number: null,
    current_bed_number: null,
    mess_category_id: null,
    mess_category_name: null,
  } as unknown as LearnerHostelite;
}

const BILL_STATE_LABEL: Record<string, string> = {
  matched: 'Bill matched',
  different_year: 'Wrong year',
  untagged: 'Not year-tagged',
  none: 'No bill',
};

const BILL_STATE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  matched: 'default',
  different_year: 'secondary',
  untagged: 'secondary',
  none: 'destructive',
};

const PAGE_SIZE = 25;

type ReadinessFilter = 'all' | 'ready' | 'incomplete';

export function NotAllocatedTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const canAllocate =
    isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  const institutionId = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  const { data: rows = [], isLoading, error } = useUnallocatedCandidates(institutionId);

  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all');
  const [page, setPage] = useState(1);
  const [allocateTarget, setAllocateTarget] = useState<UnallocatedCandidate | null>(null);

  // Summary counts (over full unfiltered set)
  const readyCount = useMemo(
    () => rows.filter((r) => r.readiness === 'ready').length,
    [rows],
  );
  const incompleteCount = rows.length - readyCount;

  // Filtered + searched
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (readinessFilter !== 'all' && r.readiness !== readinessFilter) return false;
      if (q) {
        const hay = [r.full_name, r.email, r.program_name, r.semester_name, r.institution_name]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, readinessFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filter/search changes
  const handleFilterChange = (f: ReadinessFilter) => {
    setReadinessFilter(f);
    setPage(1);
  };
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive p-4">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">Failed to load unallocated candidates.</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-7 w-7 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{rows.length}</p>
                <p className="text-xs text-muted-foreground">Total not allocated</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{readyCount}</p>
                <p className="text-xs text-muted-foreground">
                  Ready — all data in place
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-7 w-7 text-amber-500" />
              <div>
                <p className="text-2xl font-bold text-amber-600">{incompleteCount}</p>
                <p className="text-xs text-muted-foreground">
                  Incomplete — data gaps to fix
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Readiness filter */}
          <div className="flex gap-2">
            {(['all', 'ready', 'incomplete'] as ReadinessFilter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={readinessFilter === f ? 'default' : 'outline'}
                onClick={() => handleFilterChange(f)}
                className="capitalize"
              >
                {f === 'all'
                  ? `All (${rows.length})`
                  : f === 'ready'
                  ? `Ready (${readyCount})`
                  : `Incomplete (${incompleteCount})`}
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, program…"
              className="pl-8"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Student</TableHead>
                <TableHead className="min-w-[160px]">Program · Semester</TableHead>
                {isSuperAdmin && (
                  <TableHead className="min-w-[140px]">Institution</TableHead>
                )}
                <TableHead className="min-w-[130px]">Room Category</TableHead>
                <TableHead className="min-w-[100px]">Readiness</TableHead>
                <TableHead className="min-w-[260px]">Why not allocated</TableHead>
                {canAllocate && <TableHead className="w-[120px] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canAllocate ? (isSuperAdmin ? 7 : 6) : (isSuperAdmin ? 6 : 5)}
                    className="text-center text-sm text-muted-foreground py-10"
                  >
                    No students match the current filter.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((row) => (
                <TableRow
                  key={row.learner_id}
                  className={row.readiness === 'ready' ? 'bg-green-50/40 dark:bg-green-950/20' : ''}
                >
                  {/* Student */}
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {row.full_name ?? '—'}
                      </span>
                      {row.email && (
                        <span className="text-xs text-muted-foreground">
                          {row.email}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Program · Semester */}
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{row.program_name ?? '—'}</span>
                      {row.semester_name && (
                        <span className="text-xs text-muted-foreground">
                          {row.semester_name}
                          {row.academic_year_name
                            ? ` · ${row.academic_year_name}`
                            : ''}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Institution (super-admin only) */}
                  {isSuperAdmin && (
                    <TableCell className="text-sm text-muted-foreground">
                      {row.institution_name ?? '—'}
                    </TableCell>
                  )}

                  {/* Room category eligible for */}
                  <TableCell>
                    {row.resolved_room_category_name ? (
                      <Badge variant="outline" className="text-xs">
                        {row.resolved_room_category_name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not resolved</span>
                    )}
                  </TableCell>

                  {/* Readiness badge */}
                  <TableCell>
                    {row.readiness === 'ready' ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-700 dark:text-amber-400 gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        Incomplete
                      </Badge>
                    )}
                  </TableCell>

                  {/* Why not allocated — missing items + bill state */}
                  <TableCell>
                    {row.readiness === 'ready' ? (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        All conditions met — ready to allocate
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {/* Missing items (blocking) */}
                        {(row.missing_items ?? []).map((item) => (
                          <Tooltip key={item}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400 cursor-default"
                              >
                                {item}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {item}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        {/* Bill state pill (if missing items is empty but bill is the issue) */}
                        {(row.missing_items ?? []).length === 0 &&
                          row.bill_state !== 'matched' && (
                            <Badge
                              variant={BILL_STATE_VARIANT[row.bill_state] ?? 'outline'}
                              className="text-[10px]"
                            >
                              {BILL_STATE_LABEL[row.bill_state] ?? row.bill_state}
                            </Badge>
                          )}
                      </div>
                    )}
                  </TableCell>

                  {/* Actions */}
                  {canAllocate && (
                    <TableCell className="text-right">
                      {row.readiness === 'ready' ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs gap-1"
                          onClick={() => setAllocateTarget(row)}
                        >
                          <BedDouble className="h-3.5 w-3.5" />
                          Allocate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setAllocateTarget(row)}
                        >
                          Assign anyway
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filtered.length} students · page {safePage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Footnote */}
        <p className="text-xs text-muted-foreground">
          Readiness checks here are block-independent. Block-specific eligibility
          (physical room rules, free beds) is shown in the{' '}
          <a
            href="/campus-living/allocations/auto"
            className="underline underline-offset-2"
          >
            auto-allocation preview
          </a>{' '}
          once you select a block.
        </p>
      </div>

      {/* Allocate room dialog — reuses the same dialog as the Learners tab */}
      <AllocateRoomDialog
        learner={allocateTarget ? toAllocatable(allocateTarget) : null}
        onClose={() => setAllocateTarget(null)}
        onSuccess={() => {
          setAllocateTarget(null);
          // Invalidate both the unallocated list and the main allocations feed
          qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
          qc.invalidateQueries({ queryKey: hostelAllocationKeys.all });
        }}
      />
    </TooltipProvider>
  );
}
