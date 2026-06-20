'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAllAllocations } from '@/hooks/campus-living/use-hostel-allocations';
import {
  AllocationFiltersPanel,
  EMPTY_ALLOCATION_FILTERS,
  allocationMatchesFilters,
} from './_components/allocation-filters';
import { TransferDialog } from './_components/transfer-dialog';
import {
  Plus, BedDouble, Loader2, Users, ArrowRightLeft, LogOut, UserCheck,
  MoreHorizontal, Eye,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  active: { label: 'Active', variant: 'success' },
  vacated: { label: 'Vacated', variant: 'secondary' },
  transferred: { label: 'Transferred', variant: 'outline' },
  pending_approval: { label: 'Pending', variant: 'default' },
  pending_vacate: { label: 'Pending Vacate', variant: 'default' },
  suspended: { label: 'Suspended', variant: 'destructive' },
};
const feeStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }> = {
  paid: { label: 'Paid', variant: 'success' },
  partial: { label: 'Partial', variant: 'default' },
  pending: { label: 'Pending', variant: 'destructive' },
  waived: { label: 'Waived', variant: 'outline' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Alloc = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getJoined = (row: any, relation: string, field: string): string => row?.[relation]?.[field] ?? '';
const floorLabel = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

export default function AllocationsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const institutionId = profile?.institution_id ?? '';
  // Full set (no page cap) — summary counts + the table all read this, so they
  // reflect every allocation, not just the first page.
  const { data: allocations = [], isLoading } = useAllAllocations(institutionId);

  // Manual room/bed edit is the same tight audience as category upgrades
  // (super-admin + the 5 hostel-admin roles) — the catalog .transfer/.edit
  // keys are mass-granted to every role, so we gate on upgrades.manage.
  const canTransfer = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [hostelTypeFilter, setHostelTypeFilter] = useState<string>('all');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [advancedFilters, setAdvancedFilters] = useState(EMPTY_ALLOCATION_FILTERS);
  const [transferTarget, setTransferTarget] = useState<Alloc | null>(null);

  // Type → Block → Floor cascade, all derived from the loaded rows so a value
  // can never match nothing. Block name maps to its hostel_type; floors are the
  // distinct floors present in the chosen block.
  const blockMeta = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of allocations as Alloc[]) {
      const name = getJoined(a, 'hostel_blocks', 'name');
      if (name && !m.has(name)) m.set(name, getJoined(a, 'hostel_blocks', 'hostel_type'));
    }
    return m;
  }, [allocations]);

  const hostelTypes = useMemo(
    () => [...new Set([...blockMeta.values()].filter(Boolean))].sort(),
    [blockMeta],
  );

  const blockNames = useMemo(
    () => [...blockMeta.keys()]
      .filter((n) => hostelTypeFilter === 'all' || blockMeta.get(n) === hostelTypeFilter)
      .sort((a, b) => a.localeCompare(b)),
    [blockMeta, hostelTypeFilter],
  );

  const floorOptions = useMemo(() => {
    if (blockFilter === 'all') return [] as number[];
    const set = new Set<number>();
    for (const a of allocations as Alloc[]) {
      if (getJoined(a, 'hostel_blocks', 'name') !== blockFilter) continue;
      const f = (a as Alloc)?.hostel_rooms?.floor;
      if (f != null) set.add(f as number);
    }
    return [...set].sort((x, y) => x - y);
  }, [allocations, blockFilter]);

  // True totals over the full set (the old page counted only the first 50 rows).
  const counts = useMemo(() => ({
    active: allocations.filter((a: Alloc) => a.status === 'active').length,
    transfers: allocations.filter((a: Alloc) => a.allocation_type === 'transfer').length,
    vacated: allocations.filter((a: Alloc) => a.status === 'vacated').length,
    feePending: allocations.filter((a: Alloc) => a.fee_status === 'pending').length,
  }), [allocations]);

  // Client-side data feed for the advanced DataTable: applies the external
  // status/block/advanced filters + the table's own search & sort, then paginates.
  const fetchData = useCallback(
    async (params: { page: number; limit: number; search: string; sort_by: string; sort_order: string }) => {
      const q = (params.search ?? '').trim().toLowerCase();
      let rows = allocations.filter((a: Alloc) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (hostelTypeFilter !== 'all' && getJoined(a, 'hostel_blocks', 'hostel_type') !== hostelTypeFilter) return false;
        if (blockFilter !== 'all' && getJoined(a, 'hostel_blocks', 'name') !== blockFilter) return false;
        if (floorFilter !== 'all' && String((a as Alloc)?.hostel_rooms?.floor ?? '') !== floorFilter) return false;
        if (!allocationMatchesFilters(a, advancedFilters)) return false;
        if (q) {
          const hay = [
            getJoined(a, 'learner', 'full_name'),
            getJoined(a, 'learner', 'email'),
            getJoined(a, 'hostel_rooms', 'room_number'),
            getJoined(a, 'hostel_blocks', 'name'),
            a.emergency_contact_name ?? '',
          ].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const sortKey = params.sort_by;
      if (sortKey) {
        const val = (a: Alloc): string => {
          switch (sortKey) {
            case 'learner': return getJoined(a, 'learner', 'full_name');
            case 'block': return getJoined(a, 'hostel_blocks', 'name');
            case 'room': return getJoined(a, 'hostel_rooms', 'room_number');
            case 'date': return a.allocation_date ?? '';
            case 'status': return a.status ?? '';
            case 'type': return a.allocation_type ?? '';
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
    [allocations, statusFilter, hostelTypeFilter, blockFilter, floorFilter, advancedFilters],
  );

  const columns = useMemo<ColumnDef<Alloc>[]>(() => [
    {
      id: 'learner',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{getJoined(row.original, 'learner', 'full_name') || '—'}</span>
          {getJoined(row.original, 'learner', 'email') && (
            <span className="text-xs text-muted-foreground">{getJoined(row.original, 'learner', 'email')}</span>
          )}
        </div>
      ),
      size: 220,
    },
    { id: 'block', header: ({ column }) => <DataTableColumnHeader column={column} title="Block" />, cell: ({ row }) => getJoined(row.original, 'hostel_blocks', 'name') || '—', enableSorting: false, size: 130 },
    { id: 'room', header: ({ column }) => <DataTableColumnHeader column={column} title="Room" />, cell: ({ row }) => getJoined(row.original, 'hostel_rooms', 'room_number') || '—', enableSorting: false, size: 90 },
    { id: 'bed', header: 'Bed', cell: ({ row }) => getJoined(row.original, 'hostel_beds', 'bed_number') || '—', enableSorting: false, size: 80 },
    { id: 'room_category', header: 'Room Cat.', cell: ({ row }) => row.original.learner?.academic?.room_category?.name ?? <span className="text-muted-foreground">—</span>, enableSorting: false, size: 130 },
    { id: 'mess_category', header: 'Mess Cat.', cell: ({ row }) => row.original.learner?.academic?.mess_category?.name ?? <span className="text-muted-foreground">—</span>, enableSorting: false, size: 120 },
    { id: 'type', header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />, cell: ({ row }) => <Badge variant="outline" className="text-xs capitalize">{row.original.allocation_type}</Badge>, size: 110 },
    { id: 'date', header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />, cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.allocation_date ?? '—'}</span>, size: 120 },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => { const c = statusConfig[row.original.status] ?? { label: row.original.status, variant: 'outline' as const }; return <Badge variant={c.variant}>{c.label}</Badge>; },
      size: 120,
    },
    {
      id: 'fee',
      header: 'Fee',
      cell: ({ row }) => { const c = feeStatusConfig[row.original.fee_status] ?? { label: row.original.fee_status, variant: 'outline' as const }; return <Badge variant={c.variant}>{c.label}</Badge>; },
      enableSorting: false,
      size: 100,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const a = row.original;
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
                {canTransfer && a.status === 'active' && (
                  <DropdownMenuItem onClick={() => setTransferTarget(a)}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Change room / bed
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 80,
    },
  ], [canTransfer]);

  if (isLoading) {
    return (
      <ContentLayout title="Allocations">
        <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Hostel Allocations">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Hostel Allocations</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Manage student bed allocations across all blocks</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/allocations/roommate-matching"><Users className="mr-2 h-4 w-4" /> Roommate Matching</Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/allocations/new"><Plus className="mr-2 h-4 w-4" /> Allocate Bed</Link>
            </Button>
          </div>
        </div>

        {/* Summary cards — true totals over the full set */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard icon={<UserCheck className="h-8 w-8 text-green-600" />} value={counts.active} label="Active" />
          <SummaryCard icon={<ArrowRightLeft className="h-8 w-8 text-blue-600" />} value={counts.transfers} label="Transfers" />
          <SummaryCard icon={<LogOut className="h-8 w-8 text-amber-600" />} value={counts.vacated} label="Vacated" />
          <SummaryCard icon={<BedDouble className="h-8 w-8 text-purple-600" />} value={counts.feePending} label="Fee Pending" />
        </div>

        {/* Filters — status quick-filters, then the Type → Block → Floor cascade
            plus the advanced (academic) popover. Search lives in the table toolbar.
            Stacks full-width on mobile, wraps inline from sm up. */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {['all', 'active', 'vacated', 'transferred', 'suspended'].map((s) => (
              <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : statusConfig[s]?.label ?? s}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {hostelTypes.length > 1 && (
              <Select
                value={hostelTypeFilter}
                onValueChange={(v) => { setHostelTypeFilter(v); setBlockFilter('all'); setFloorFilter('all'); }}
              >
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {hostelTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={blockFilter} onValueChange={(v) => { setBlockFilter(v); setFloorFilter('all'); }}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Blocks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Blocks</SelectItem>
                {blockNames.map((bn) => <SelectItem key={bn} value={bn}>{bn}</SelectItem>)}
              </SelectContent>
            </Select>
            {blockFilter !== 'all' && floorOptions.length > 0 && (
              <Select value={floorFilter} onValueChange={setFloorFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Floors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Floors</SelectItem>
                  {floorOptions.map((f) => <SelectItem key={f} value={String(f)}>{floorLabel(f)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="sm:ml-auto">
              <AllocationFiltersPanel rows={allocations} value={advancedFilters} onChange={setAdvancedFilters} />
            </div>
          </div>
        </div>

        {/* Advanced data table — paginated, sortable, exportable.
            Wrapped in .pinned-actions-col so the row-action column stays pinned
            to the right edge when the table overflows horizontally. */}
        <div className="pinned-actions-col">
          <DataTable
            fetchDataFn={fetchData}
            getColumns={() => columns}
            idField="id"
            exportConfig={{ entityName: 'hostel-allocations', columnMapping: {}, columnWidths: [], headers: [] }}
            config={{ enableUrlState: false, enableDateFilter: false, enableExport: true, enableRowSelection: false }}
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/campus-living/allocations/waitlist"><Users className="mr-2 h-4 w-4" /> View Waitlist</Link>
          </Button>
        </div>
      </div>

      {/* Manual room/bed reassignment. The mutation invalidates the
          allocations, rooms, beds and My-Hostel caches, so this table and the
          resident's own view both reflect the move. */}
      {transferTarget && (
        <TransferDialog
          allocationId={transferTarget.id}
          currentBlockId={transferTarget.block_id}
          currentRoomId={transferTarget.room_id}
          currentBedId={transferTarget.bed_id}
          current={{
            learnerName: getJoined(transferTarget, 'learner', 'full_name') || null,
            blockName: getJoined(transferTarget, 'hostel_blocks', 'name') || null,
            roomNumber: getJoined(transferTarget, 'hostel_rooms', 'room_number') || null,
            bedNumber: getJoined(transferTarget, 'hostel_beds', 'bed_number') || null,
            roomCategory: transferTarget.learner?.academic?.room_category?.name ?? null,
          }}
          open={!!transferTarget}
          onOpenChange={(o) => { if (!o) setTransferTarget(null); }}
          onSuccess={() => setTransferTarget(null)}
        />
      )}
    </ContentLayout>
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
