'use client';

// "Upgrade Categories" tab on /campus-living/residents (?tab=upgrade-categories).
//
// Office-side room/mess category upgrades. Lists hostelites from the SAME
// v_learner_hostelites surface the Learners tab uses (now carrying current
// room/mess category) + a current-academic-year bill rollup, with row
// selection. Selected learners are bulk-upgraded via the BulkUpgradeDialog
// (preview -> confirm), reusing the self-service upgrade lifecycle. Row click
// opens the shared read-only LearnerDetailDrawer for the full detail view.
//
// Gated by campus_living.upgrades.manage (the page only mounts this tab for
// holders); the RPCs re-check the permission + institution access server-side.

import { useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUpCircle, Building2, MoreHorizontal } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
  HosteliteBillStatus,
  BlockFilterValue,
} from '@/types/campus-living';
import { BulkUpgradeDialog } from './bulk-upgrade-dialog';
import { AdminRoomUpgradeDialog } from './admin-room-upgrade-dialog';
import { LearnerDetailDrawer } from './learner-detail-drawer';
import { LearnersFilters } from './learners-filters';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

function BillStatusCell({ s }: { s?: HosteliteBillStatus }) {
  if (!s || s.payment_status === 'none' || s.bill_count === 0) {
    return <span className='text-xs text-muted-foreground'>No bills</span>;
  }
  const map: Record<HosteliteBillStatus['payment_status'], { label: string; cls: string }> = {
    paid: { label: 'Paid', cls: 'bg-green-100 text-green-800 hover:bg-green-100' },
    partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
    unpaid: { label: 'Unpaid', cls: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
    none: { label: '—', cls: '' },
  };
  const b = map[s.payment_status];
  return (
    <div className='space-y-0.5'>
      <Badge className={`border-transparent text-[10px] ${b.cls}`}>{b.label}</Badge>
      <div className='text-[11px] text-muted-foreground'>
        {s.academic_year_name ? `${s.academic_year_name} · ` : ''}
        {inr(s.total_billed)}
        {s.total_outstanding > 0 ? ` · ${inr(s.total_outstanding)} due` : ''}
      </div>
    </div>
  );
}

export function UpgradeCategoriesTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];

  const searchParams = useSearchParams();

  // Filters come from the URL via the shared <LearnersFilters> (same advanced
  // cascade the Learners tab uses). The DataTable keeps enableUrlState:false so
  // its page/sort don't collide with the always-mounted Learners tab — only the
  // filter keys are shared, which is the intended cross-tab behaviour.
  const filterParams = useMemo<Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'>>(() => {
    const f: Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'> = {};
    const g = (k: string) => searchParams.get(k) ?? undefined;
    if (isSuperAdmin && g('institution_id')) f.institution_id = g('institution_id');
    if (g('degree_id')) f.degree_id = g('degree_id');
    if (g('department_id')) f.department_id = g('department_id');
    if (g('program_id')) f.program_id = g('program_id');
    if (g('semester_id')) f.semester_id = g('semester_id');
    if (g('section_id')) f.section_id = g('section_id');
    if (g('academic_year_id')) f.academic_year_id = g('academic_year_id');
    if (g('gender')) f.gender = g('gender') as 'Male' | 'Female' | 'Other';
    if (g('block_id')) f.block_id = g('block_id') as BlockFilterValue;
    if (g('hostel_category_id')) f.hostel_category_id = g('hostel_category_id');
    const y = g('year_of_study');
    if (y) f.year_of_study = Number(y);
    return f;
  }, [searchParams, isSuperAdmin]);

  // Non-super-admins are pinned to their institution; super-admins narrow via
  // the Advanced Filters' Institution select (URL → filterParams.institution_id).
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Drawer + dialog + refresh state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLearners, setBulkLearners] = useState<LearnerHostelite[]>([]);
  const [roomUpgradeLearner, setRoomUpgradeLearner] = useState<LearnerHostelite | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const resetSelectionRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(
    async (params: {
      page: number; limit: number; search: string;
      sort_by: string; sort_order: string;
    }) => {
      const filters: LearnerHostelitesFilters = {
        ...filterParams,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      };
      const { data, count } = await LearnerHosteliteService.listHostelites(
        effectiveInstitutionId,
        filters,
        params.page,
        params.limit,
      );
      // Per-page current-year bill rollup (non-fatal; same RPC the Learners tab uses).
      const statusMap = await LearnerHosteliteService.getBillStatusForStudents(
        data.map((d) => d.id),
      );
      const rows = data.map((d) => ({ ...d, bill_status: statusMap.get(d.id) }));
      const limit = params.limit || 50;
      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit,
          total_pages: Math.max(1, Math.ceil(count / limit)),
          total_items: count,
        },
      };
    },
    [effectiveInstitutionId, filterParams],
  );

  const columns = useMemo<ColumnDef<LearnerHostelite>[]>(() => {
    const selectCol: ColumnDef<LearnerHostelite> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    };

    const nameCol: ColumnDef<LearnerHostelite> = {
      accessorKey: 'first_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Learner' />,
      cell: ({ row }) => (
        <button
          type='button'
          className='flex flex-col text-left hover:underline underline-offset-2'
          onClick={() => setDetailId(row.original.id)}
        >
          <span className='font-medium'>{fullName(row.original)}</span>
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.roll_number ?? '—'}
          </span>
        </button>
      ),
      size: 220,
    };

    const institutionCol: ColumnDef<LearnerHostelite> = {
      id: 'institution',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>{instName(row.original.institution_id)}</span>
      ),
      enableSorting: false,
      size: 180,
    };

    const programCol: ColumnDef<LearnerHostelite> = {
      id: 'program',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Program / Year' />,
      cell: ({ row }) => {
        const y = row.original.year_of_study;
        return (
          <div className='text-sm'>
            <div>{row.original.program_name ?? '—'}</div>
            <div className='text-xs text-muted-foreground'>
              {y === null || y === undefined ? '' : `Year ${y}`}
              {row.original.gender ? ` · ${row.original.gender}` : ''}
            </div>
          </div>
        );
      },
      enableSorting: false,
      size: 200,
    };

    const roomCatCol: ColumnDef<LearnerHostelite> = {
      id: 'room_category',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Room category' />,
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.hostel_category_name ?? '—'}</span>
      ),
      enableSorting: false,
      size: 150,
    };

    const messCatCol: ColumnDef<LearnerHostelite> = {
      id: 'mess_category',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Mess category' />,
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.mess_category_name ?? '—'}</span>
      ),
      enableSorting: false,
      size: 150,
    };

    const billCol: ColumnDef<LearnerHostelite> = {
      id: 'bill_status',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Current-year bill' />,
      cell: ({ row }) => <BillStatusCell s={row.original.bill_status} />,
      enableSorting: false,
      size: 200,
    };

    // Per-row action — single-learner ROOM upgrade into a manual (room-picked)
    // category e.g. Premium. Auto-room + mess use the bulk selection toolbar.
    const actionsCol: ColumnDef<LearnerHostelite> = {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open menu</span>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => setRoomUpgradeLearner(row.original)}>
              <Building2 className='mr-2 h-4 w-4' />
              Upgrade room (pick room)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false,
      maxSize: 50,
    };

    return [
      selectCol,
      nameCol,
      ...(isSuperAdmin ? [institutionCol] : []),
      programCol,
      roomCatCol,
      messCatCol,
      billCol,
      actionsCol,
    ];
  }, [instName, isSuperAdmin]);

  return (
    <div className='space-y-4'>
      <p className='text-xs text-muted-foreground sm:max-w-2xl'>
        Select learners, then upgrade their room and/or mess category in bulk. Tip: use the
        Advanced Filters (institution, degree, program, gender, room category…) and search to
        target a cohort on the same current category.
      </p>

      <LearnersFilters />

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns}
        idField='id'
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'hostel-upgrade-candidates',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
        }}
        renderToolbarContent={({ selectedRows, resetSelection }) => {
          const rows = selectedRows as unknown as LearnerHostelite[];
          return (
            <Button
              size='sm'
              className='h-8'
              disabled={rows.length === 0}
              onClick={() => {
                setBulkLearners(rows);
                resetSelectionRef.current = resetSelection;
                setBulkOpen(true);
              }}
            >
              <ArrowUpCircle className='mr-2 h-4 w-4' />
              Upgrade selected{rows.length > 0 ? ` (${rows.length})` : ''}
            </Button>
          );
        }}
      />

      <BulkUpgradeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        learners={bulkLearners}
        onCommitted={() => {
          resetSelectionRef.current?.();
          setRefetchKey((k) => k + 1);
        }}
      />

      <AdminRoomUpgradeDialog
        open={!!roomUpgradeLearner}
        onOpenChange={(o) => { if (!o) setRoomUpgradeLearner(null); }}
        learner={roomUpgradeLearner}
        onCommitted={() => setRefetchKey((k) => k + 1)}
      />

      <LearnerDetailDrawer
        learnerId={detailId}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
      />
    </div>
  );
}
