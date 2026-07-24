'use client';

import { Suspense, useState, useMemo, useCallback } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/hooks/use-auth';
import { useAllAllocations } from '@/hooks/campus-living/use-hostel-allocations';
import {
  AllocationCascadeFilters,
  EMPTY_ALLOCATION_CASCADE,
  allocationMatchesCascade,
} from './_components/allocation-filters';
import { NotAllocatedTab } from './_components/not-allocated-tab';
import { AllAllocationsTab } from './_components/all-allocations-tab';
import {
  Plus, BedDouble, Loader2, Users, ArrowRightLeft, LogOut, UserCheck, Eye,
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

const ALLOCATIONS_TABS = ['all', 'allocated', 'not-allocated'] as const;

function AllocationsPageInner() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  // Full set (no page cap) — summary counts + the table all read this, so they
  // reflect every allocation, not just the first page.
  const { data: allocations = [], isLoading } = useAllAllocations(institutionId);

  // The Allocated tab is view-only — all mutating actions (transfer / reset /
  // allocate) live in the combined "All" tab.
  const [activeTab, setActiveTab] = useTabParam('all', ALLOCATIONS_TABS);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [cascade, setCascade] = useState(EMPTY_ALLOCATION_CASCADE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Tab badge shows the stable total active count — it's visible from every tab,
  // so it must not shift with this tab's Advanced Filters.
  const totalActive = useMemo(
    () => allocations.filter((a: Alloc) => a.status === 'active').length,
    [allocations],
  );

  // Summary cards reflect the active Advanced Filters (cascade). The status
  // quick-filter + the table search narrow the TABLE only, not the cards.
  const scopedAllocations = useMemo(
    () => allocations.filter((a: Alloc) => allocationMatchesCascade(a, cascade)),
    [allocations, cascade],
  );
  const counts = useMemo(() => ({
    active: scopedAllocations.filter((a: Alloc) => a.status === 'active').length,
    transfers: scopedAllocations.filter((a: Alloc) => a.allocation_type === 'transfer').length,
    vacated: scopedAllocations.filter((a: Alloc) => a.status === 'vacated').length,
    feePending: scopedAllocations.filter((a: Alloc) => a.fee_status === 'pending').length,
  }), [scopedAllocations]);

  // Client-side data feed for the advanced DataTable: applies the external
  // status/block/advanced filters + the table's own search & sort, then paginates.
  const fetchData = useCallback(
    async (params: { page: number; limit: number; search: string; sort_by: string; sort_order: string }) => {
      const q = (params.search ?? '').trim().toLowerCase();
      let rows = allocations.filter((a: Alloc) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (!allocationMatchesCascade(a, cascade)) return false;
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
    [allocations, statusFilter, cascade],
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
      // View-only: this tab has no mutating actions (those live in the "All"
      // tab) — just a read-only link through to the allocation detail page.
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" asChild>
            <Link href={`/campus-living/allocations/${row.original.id}`}>
              <Eye className="h-4 w-4" /> View
            </Link>
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 90,
    },
  ], []);

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">
              All
            </TabsTrigger>
            <TabsTrigger value="allocated">
              Allocated
              <Badge variant="secondary" className="ml-2 text-xs">{totalActive}</Badge>
            </TabsTrigger>
            <TabsTrigger value="not-allocated">
              Not Allocated
            </TabsTrigger>
          </TabsList>

          {/* ── All (combined) tab ─────────────────────────────────────── */}
          <TabsContent value="all" className="space-y-4">
            {activeTab === 'all' && <AllAllocationsTab />}
          </TabsContent>


          {/* ── Allocated tab ─────────────────────────────────────────── */}
          <TabsContent value="allocated" className="space-y-4">
            {/* Summary cards — true totals over the full set */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard icon={<UserCheck className="h-8 w-8 text-green-600" />} value={counts.active} label="Active" />
              <SummaryCard icon={<ArrowRightLeft className="h-8 w-8 text-blue-600" />} value={counts.transfers} label="Transfers" />
              <SummaryCard icon={<LogOut className="h-8 w-8 text-amber-600" />} value={counts.vacated} label="Vacated" />
              <SummaryCard icon={<BedDouble className="h-8 w-8 text-purple-600" />} value={counts.feePending} label="Fee Pending" />
            </div>

            {/* Status quick-filters */}
            <div className="flex gap-2 flex-wrap">
              {['all', 'active', 'vacated', 'transferred', 'suspended'].map((s) => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
                  {s === 'all' ? 'All' : statusConfig[s]?.label ?? s}
                </Button>
              ))}
            </div>

            {/* Advanced Filters — shared Type→Block→Floor + academic cascade */}
            <AllocationCascadeFilters
              rows={allocations}
              value={cascade}
              onChange={setCascade}
              open={showAdvancedFilters}
              onOpenChange={setShowAdvancedFilters}
            />

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
          </TabsContent>

          {/* ── Not Allocated tab ──────────────────────────────────────── */}
          <TabsContent value="not-allocated" className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Active hostelites who have not yet been assigned a bed. Shows
                block-independent readiness checks so you can see exactly what
                data is missing before allocation can proceed.
              </p>
            </div>
            {activeTab === 'not-allocated' && <NotAllocatedTab />}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function AllocationsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <AllocationsPageInner />
    </Suspense>
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
