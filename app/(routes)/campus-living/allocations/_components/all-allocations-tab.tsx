'use client';

// The "All" (combined) tab on /campus-living/allocations.
//
// Merges the two live populations into ONE table:
//   • active bed allocations        (useAllAllocations, status === 'active')
//   • active hostelites with no bed (useUnallocatedCandidates)
// so an admin sees who is placed and who is still waiting in a single view.
//
// The two sources are DIFFERENT row shapes (hostel_allocations vs a
// learners_profiles RPC), so each row is normalised into a `UnifiedRow` with a
// `placement` discriminator + the original `raw` object. The actions column
// branches on `placement`: allocated rows keep the full View / Change room /
// Reset menu; unplaced rows get the Allocate action — all reusing the exact same
// dialogs the dedicated tabs use.
//
// Filter semantics (see the note under the filters): the Type→Block→Floor +
// academic cascade describes a physical/academic placement an unplaced learner
// can't have, so the moment any of those is set, candidates drop out; only the
// Institution filter + search span both populations.

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAllAllocations,
  hostelAllocationKeys,
} from '@/hooks/campus-living/use-hostel-allocations';
import {
  useUnallocatedCandidates,
  unallocatedCandidatesKeys,
} from '@/hooks/campus-living/use-unallocated-candidates';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AllocationCascadeFilters,
  EMPTY_ALLOCATION_CASCADE,
  allocationMatchesCascade,
  candidateMatchesCascade,
} from './allocation-filters';
import { TransferDialog } from './transfer-dialog';
import { ResetAllocationDialog } from './reset-allocation-dialog';
import { AllocateRoomDialog } from '../../residents/_components/allocate-room-dialog';
import { toAllocatable } from './not-allocated-tab';
import {
  MoreHorizontal,
  Eye,
  ArrowRightLeft,
  RotateCcw,
  BedDouble,
  Loader2,
  UserCheck,
  Users,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { UnallocatedCandidate } from '@/types/campus-living';

type Alloc = any;
type Placement = 'all' | 'allocated' | 'not-allocated';

interface UnifiedRow {
  rowId: string;
  placement: 'allocated' | 'not-allocated';
  learnerName: string;
  email: string;
  program: string;
  semester: string;
  roomCategory: string;
  institution: string;
  blockName: string | null;
  roomNumber: string | null;
  bedNumber: string | null;
  readiness: 'ready' | 'incomplete' | null;
  // The original source row, used to hydrate the correct action dialog.
  raw: Alloc | UnallocatedCandidate;
}

// Export schema — keys deliberately DISTINCT from the table column ids so the
// shared DataTable never drops a header on a hidden-column collision and never
// collapses into an "undefined" column (empty columnMapping bug).
const ALL_EXPORT_COLUMNS: ReadonlyArray<{ key: string; label: string; width: number }> = [
  { key: 'learner_name', label: 'Learner', width: 24 },
  { key: 'learner_email', label: 'Email', width: 28 },
  { key: 'placement_state', label: 'Placement', width: 16 },
  { key: 'program_name', label: 'Program', width: 24 },
  { key: 'semester_name', label: 'Semester', width: 16 },
  { key: 'block', label: 'Block', width: 18 },
  { key: 'room', label: 'Room', width: 12 },
  { key: 'bed', label: 'Bed', width: 10 },
  { key: 'room_category_name', label: 'Room Category', width: 18 },
  { key: 'status_label', label: 'Status', width: 14 },
  { key: 'institution_name', label: 'Institution', width: 26 },
];
const ALL_EXPORT_HEADERS = ALL_EXPORT_COLUMNS.map((c) => c.key);
const ALL_EXPORT_MAPPING: Record<string, string> = Object.fromEntries(
  ALL_EXPORT_COLUMNS.map((c) => [c.key, c.label])
);
const ALL_EXPORT_WIDTHS = ALL_EXPORT_COLUMNS.map((c) => ({ wch: c.width }));

export function AllAllocationsTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const qc = useQueryClient();

  // Same tight audience as the dedicated tabs' actions.
  const canManage = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  // `useAllAllocations` gates on isSuperAdmin internally; the unallocated feed
  // takes an explicit undefined for super-admins (all institutions).
  const allocInstitutionId = profile?.institution_id ?? '';
  const candInstitutionId = isSuperAdmin ? undefined : (profile?.institution_id ?? undefined);

  const { data: allocations = [], isLoading: allocLoading } = useAllAllocations(allocInstitutionId);
  const { data: candidates = [], isLoading: candLoading } = useUnallocatedCandidates(candInstitutionId);

  const [placement, setPlacement] = useState<Placement>('all');
  const [cascade, setCascade] = useState(EMPTY_ALLOCATION_CASCADE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Alloc | null>(null);
  const [resetTarget, setResetTarget] = useState<Alloc | null>(null);
  const [allocateTarget, setAllocateTarget] = useState<UnallocatedCandidate | null>(null);

  // Active allocations only — the cascade filter options derive from these.
  const activeAllocations = useMemo(
    () => (allocations as Alloc[]).filter((a) => a.status === 'active'),
    [allocations]
  );

  // Merge the two shapes into one normalised row list.
  const allRows = useMemo<UnifiedRow[]>(() => {
    const allocated: UnifiedRow[] = activeAllocations.map((a) => ({
      rowId: `alloc:${a.id}`,
      placement: 'allocated',
      learnerName: a?.learner?.full_name ?? '',
      email: a?.learner?.email ?? '',
      program: a?.learner?.academic?.program?.program_name ?? '',
      semester: a?.learner?.academic?.semester?.semester_name ?? '',
      roomCategory: a?.learner?.academic?.room_category?.name ?? '',
      institution: a?.learner?.academic?.institution?.name ?? '',
      blockName: a?.hostel_blocks?.name ?? null,
      roomNumber: a?.hostel_rooms?.room_number ?? null,
      bedNumber: a?.hostel_beds?.bed_number ?? null,
      readiness: null,
      raw: a,
    }));
    const notAllocated: UnifiedRow[] = (candidates as UnallocatedCandidate[]).map((c) => ({
      rowId: `cand:${c.learner_id}`,
      placement: 'not-allocated',
      learnerName: c.full_name ?? '',
      email: c.email ?? '',
      program: c.program_name ?? '',
      semester: c.semester_name ?? '',
      roomCategory: c.resolved_room_category_name ?? '',
      institution: c.institution_name ?? '',
      blockName: null,
      roomNumber: null,
      bedNumber: null,
      readiness: c.readiness,
      raw: c,
    }));
    return [...allocated, ...notAllocated];
  }, [activeAllocations, candidates]);

  const counts = useMemo(() => {
    const allocated = activeAllocations.length;
    const notAllocated = (candidates as UnallocatedCandidate[]).length;
    const ready = (candidates as UnallocatedCandidate[]).filter((c) => c.readiness === 'ready').length;
    return { allocated, notAllocated, ready, incomplete: notAllocated - ready };
  }, [activeAllocations, candidates]);

  const invalidateFeeds = useCallback(() => {
    // A move / reset / allocate crosses the two feeds (e.g. a reset frees a bed
    // and the learner returns to the not-allocated set), so refresh both plus
    // the rooms/beds occupancy views.
    qc.invalidateQueries({ queryKey: hostelAllocationKeys.all });
    qc.invalidateQueries({ queryKey: unallocatedCandidatesKeys.all });
    qc.invalidateQueries({ queryKey: ['hostel-rooms'] });
    qc.invalidateQueries({ queryKey: ['hostel-beds'] });
  }, [qc]);

  // Client-side feed for the DataTable: placement + cascade + search, then sort
  // + paginate. Unplaced candidates are matched by institution + search only.
  const fetchData = useCallback(
    async (params: { page: number; limit: number; search: string; sort_by: string; sort_order: string }) => {
      const q = (params.search ?? '').trim().toLowerCase();

      let rows = allRows.filter((r) => {
        if (placement !== 'all' && r.placement !== placement) return false;
        if (r.placement === 'allocated') {
          if (!allocationMatchesCascade(r.raw, cascade)) return false;
        } else {
          if (!candidateMatchesCascade(r.raw as UnallocatedCandidate, cascade)) return false;
        }
        if (q) {
          const hay = [r.learnerName, r.email, r.program, r.semester, r.roomNumber, r.blockName, r.institution]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const sortKey = params.sort_by;
      if (sortKey) {
        const val = (r: UnifiedRow): string => {
          switch (sortKey) {
            case 'learner': return r.learnerName;
            case 'placement': return r.placement;
            case 'location': return [r.blockName, r.roomNumber].filter(Boolean).join(' ');
            default: return '';
          }
        };
        const dir = params.sort_order === 'desc' ? -1 : 1;
        rows = [...rows].sort((x, y) => val(x).localeCompare(val(y)) * dir);
      }

      const limit = params.limit || 25;
      const total = rows.length;
      const start = (params.page - 1) * limit;
      return {
        success: true,
        data: rows.slice(start, start + limit),
        pagination: { page: params.page, limit, total_pages: Math.max(1, Math.ceil(total / limit)), total_items: total },
      };
    },
    [allRows, placement, cascade]
  );

  // Typed as ColumnDef<Alloc> (Alloc = any) to match the repo's DataTable idiom:
  // the shared table constrains TData to ExportableData (all-primitive fields),
  // which a UnifiedRow — carrying a nested `raw` object — can't satisfy. Cells
  // read row.original as a UnifiedRow at each use site.
  const columns = useMemo<ColumnDef<Alloc>[]>(() => {
    const cols: ColumnDef<Alloc>[] = [
      {
        id: 'learner',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.learnerName || '—'}</span>
            {row.original.email && (
              <span className="text-xs text-muted-foreground">{row.original.email}</span>
            )}
          </div>
        ),
        size: 220,
      },
      {
        id: 'program',
        header: 'Program · Semester',
        cell: ({ row }) => (
          <div className="flex flex-col text-sm">
            <span>{row.original.program || '—'}</span>
            {row.original.semester && (
              <span className="text-xs text-muted-foreground">{row.original.semester}</span>
            )}
          </div>
        ),
        enableSorting: false,
        size: 190,
      },
      {
        id: 'placement',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Placement" />,
        cell: ({ row }) =>
          row.original.placement === 'allocated' ? (
            <Badge variant="success">Allocated</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
              Not Allocated
            </Badge>
          ),
        size: 130,
      },
      {
        id: 'location',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Block · Room · Bed" />,
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement !== 'allocated') return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-sm">
              {[r.blockName, r.roomNumber && `Room ${r.roomNumber}`, r.bedNumber && `Bed ${r.bedNumber}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </span>
          );
        },
        size: 200,
      },
      {
        id: 'room_category',
        header: 'Room Cat.',
        cell: ({ row }) =>
          row.original.roomCategory ? (
            <Badge variant="outline" className="text-xs">{row.original.roomCategory}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        enableSorting: false,
        size: 130,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const r = row.original;
          if (r.placement === 'allocated') return <Badge variant="success">Active</Badge>;
          return r.readiness === 'ready' ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 gap-1">
              <XCircle className="h-3 w-3" /> Incomplete
            </Badge>
          );
        },
        enableSorting: false,
        size: 120,
      },
    ];

    if (isSuperAdmin) {
      cols.push({
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.institution || '—'}</span>
        ),
        enableSorting: false,
        size: 160,
      });
    }

    cols.push({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        if (r.placement === 'allocated') {
          const a = r.raw as Alloc;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <span className="sr-only">Open actions menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/campus-living/allocations/${a.id}`}>
                      <Eye className="mr-2 h-4 w-4" /> View details
                    </Link>
                  </DropdownMenuItem>
                  {canManage && a.status === 'active' && (
                    <DropdownMenuItem onClick={() => setTransferTarget(a)}>
                      <ArrowRightLeft className="mr-2 h-4 w-4" /> Change room / bed
                    </DropdownMenuItem>
                  )}
                  {canManage && ['active', 'pending_approval'].includes(a.status) && (
                    <DropdownMenuItem
                      onClick={() => setResetTarget(a)}
                      className="text-destructive focus:text-destructive"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }
        if (!canManage) return null;
        const c = r.raw as UnallocatedCandidate;
        return (
          <div className="flex justify-end">
            {r.readiness === 'ready' ? (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAllocateTarget(c)}>
                <BedDouble className="h-3.5 w-3.5" /> Allocate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setAllocateTarget(c)}
              >
                Assign anyway
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 80,
    });

    return cols;
  }, [canManage, isSuperAdmin]);

  const exportConfig = useMemo(
    () => ({
      entityName: 'hostel-allocations-all',
      headers: ALL_EXPORT_HEADERS,
      columnMapping: ALL_EXPORT_MAPPING,
      columnWidths: ALL_EXPORT_WIDTHS,
      transformFunction: (row: UnifiedRow) => ({
        learner_name: row.learnerName || null,
        learner_email: row.email || null,
        placement_state: row.placement === 'allocated' ? 'Allocated' : 'Not Allocated',
        program_name: row.program || null,
        semester_name: row.semester || null,
        block: row.blockName ?? null,
        room: row.roomNumber ?? null,
        bed: row.bedNumber ?? null,
        room_category_name: row.roomCategory || null,
        status_label:
          row.placement === 'allocated' ? 'Active' : row.readiness === 'ready' ? 'Ready' : 'Incomplete',
        institution_name: row.institution || null,
      }),
    }),
    []
  );

  if (allocLoading || candLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const placementLabel: Record<Placement, string> = {
    all: `All (${allRows.length})`,
    allocated: `Allocated (${counts.allocated})`,
    'not-allocated': `Not Allocated (${counts.notAllocated})`,
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard icon={<UserCheck className="h-8 w-8 text-green-600" />} value={counts.allocated} label="Allocated" />
        <SummaryCard icon={<Users className="h-8 w-8 text-amber-600" />} value={counts.notAllocated} label="Not Allocated" />
        <SummaryCard icon={<CheckCircle2 className="h-8 w-8 text-green-500" />} value={counts.ready} label="Ready to allocate" />
        <SummaryCard icon={<XCircle className="h-8 w-8 text-amber-500" />} value={counts.incomplete} label="Incomplete" />
      </div>

      {/* Placement quick-filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'allocated', 'not-allocated'] as Placement[]).map((p) => (
          <Button key={p} size="sm" variant={placement === p ? 'default' : 'outline'} onClick={() => setPlacement(p)}>
            {placementLabel[p]}
          </Button>
        ))}
      </div>

      {/* Advanced Filters — shared Type→Block→Floor + academic cascade */}
      <AllocationCascadeFilters
        rows={activeAllocations}
        value={cascade}
        onChange={setCascade}
        open={showAdvancedFilters}
        onOpenChange={setShowAdvancedFilters}
      />
      <p className="text-xs text-muted-foreground">
        Unplaced learners aren&apos;t in a room yet, so Block, floor and
        program/semester filters hide them — they&apos;re matched only by
        institution, search, and a boys/girls Type filter (via the learner&apos;s
        gender).
      </p>

      <div className="pinned-actions-col">
        <DataTable
          fetchDataFn={fetchData}
          getColumns={() => columns}
          idField="rowId"
          exportConfig={exportConfig}
          config={{ enableUrlState: false, enableDateFilter: false, enableExport: true, enableRowSelection: false }}
        />
      </div>

      {/* Allocated-row actions — same dialogs as the dedicated Allocated tab. */}
      {transferTarget && (
        <TransferDialog
          allocationId={transferTarget.id}
          currentBlockId={transferTarget.block_id}
          currentRoomId={transferTarget.room_id}
          currentBedId={transferTarget.bed_id}
          current={{
            learnerName: transferTarget?.learner?.full_name ?? null,
            blockName: transferTarget?.hostel_blocks?.name ?? null,
            roomNumber: transferTarget?.hostel_rooms?.room_number ?? null,
            bedNumber: transferTarget?.hostel_beds?.bed_number ?? null,
            roomCategory: transferTarget?.learner?.academic?.room_category?.name ?? null,
          }}
          open={!!transferTarget}
          onOpenChange={(o) => { if (!o) setTransferTarget(null); }}
          onSuccess={() => { invalidateFeeds(); setTransferTarget(null); }}
        />
      )}

      {resetTarget && (
        <ResetAllocationDialog
          allocationId={resetTarget.id}
          current={{
            learnerName: resetTarget?.learner?.full_name ?? null,
            blockName: resetTarget?.hostel_blocks?.name ?? null,
            roomNumber: resetTarget?.hostel_rooms?.room_number ?? null,
            bedNumber: resetTarget?.hostel_beds?.bed_number ?? null,
            roomCategory: resetTarget?.learner?.academic?.room_category?.name ?? null,
            messCategory: resetTarget?.learner?.academic?.mess_category?.name ?? null,
          }}
          open={!!resetTarget}
          onOpenChange={(o) => { if (!o) setResetTarget(null); }}
          onSuccess={() => { invalidateFeeds(); setResetTarget(null); }}
        />
      )}

      {/* Not-allocated-row action — same dialog as the Not Allocated tab. */}
      <AllocateRoomDialog
        learner={allocateTarget ? toAllocatable(allocateTarget) : null}
        onClose={() => setAllocateTarget(null)}
        onSuccess={() => { invalidateFeeds(); setAllocateTarget(null); }}
      />
    </div>
  );
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
