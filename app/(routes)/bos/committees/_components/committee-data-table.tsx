'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, TrashIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { getColumns } from './columns';
import type { CommitteeSearchParams } from './data-table-schema';
import { CommitteeFormDialog } from './committee-form-dialog';
import { BosCommittee } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useInstitutionContext,
  useAllInstitutionContexts,
} from '@/hooks/use-institution-context';
import {
  bosCommitteeKeys,
  useDeleteBosCommittee,
} from '@/hooks/bos/use-bos-committees';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { logger } from '@/lib/utils/enhanced-logger';

// Same shape /api/bos/institutions returns — CAS siblings pre-grouped.
interface BosInstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}

interface CommitteeDataTableProps {
  search: CommitteeSearchParams;
}

export function CommitteeDataTable({ search }: CommitteeDataTableProps) {
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } =
    usePermissions();
  const { data: ownCtx } = useInstitutionContext();
  const deleteCommittee = useDeleteBosCommittee();

  // Refresh bridge: invalidations (rare — mutations write caches directly)
  // plus a local bump after dialog saves / deletes, since fetchDataFn-mode
  // tables can't see direct setQueryData writes.
  const invalidateKey = useDataTableRefreshOnInvalidate(bosCommitteeKeys.all);
  const [localBump, setLocalBump] = useState(0);
  // Master-list view toggle. 'template' (default) keeps the historical
  // templates-only list (composition_id IS NULL); 'all' also lists every
  // composition's committees, labelled by composition. The view is part of the
  // refetchKey so switching re-runs the fetchDataFn against the new scope.
  const [view, setView] = useState<'template' | 'all'>('template');
  const refetchKey = `${invalidateKey}-${localBump}-${view}`;
  const bumpRefetch = useCallback(() => setLocalBump((n) => n + 1), []);

  // Institution options for the super-admin picker + CAS filter expansion.
  // Sourced from /api/institutions/resolve (via useAllInstitutionContexts,
  // which self-gates on super-admin) instead of the legacy /api/bos/institutions
  // COE proxy — that proxy 404s intermittently when COE's upstream
  // /api/v1/institutions is unstable, silently emptying this dropdown.
  const { data: institutionContexts = [] } = useAllInstitutionContexts();
  const allInstitutions = useMemo<BosInstitutionOption[]>(
    () =>
      institutionContexts.map((ctx) => ({
        id: ctx.myjkkn_id,
        name: ctx.display_name || ctx.name,
        institution_code: ctx.institution_code,
        myjkkn_institution_ids: ctx.myjkkn_institution_ids,
      })),
    [institutionContexts]
  );

  // Form dialog state (create + edit share one instance).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BosCommittee | undefined>(undefined);

  // Bulk delete state.
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    rows: BosCommittee[];
    resetSelection: () => void;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isReady = !permissionsLoading && !!userProfile;
  const canManage = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-compositions', 'edit'),
    [isSuperAdmin, canAccess]
  );

  const handleEdit = useCallback((committee: BosCommittee) => {
    setEditing(committee);
    setFormOpen(true);
  }, []);

  const columns = useMemo(
    () =>
      getColumns({
        canManage,
        showComposition: view === 'all',
        onEdit: handleEdit,
        onChanged: bumpRefetch,
      }),
    [canManage, view, handleEdit, bumpRefetch]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      try {
        const qs = new URLSearchParams({
          page: String(params.page),
          limit: String(params.limit),
          // 'template' (default) — institution-level template committees only
          // (composition_id IS NULL). 'all' — also every composition's
          // committees, each labelled by its composition
          // (20260706_bos_committees_per_composition.sql).
          scope: view,
        });
        if (params.search) qs.set('search', params.search);
        if (params.sort_by) qs.set('sortBy', params.sort_by);
        if (params.sort_order) qs.set('sortOrder', params.sort_order);
        if (search.is_active) qs.set('isActive', search.is_active);

        // Institution filter — expand a CAS institution to its sibling pair so
        // the super-admin filter doesn't hide half the rows. Non-admins send
        // nothing; the API clamps to their own CAS-aware scope.
        if (search.institutionsId) {
          const opt = allInstitutions.find((i) => i.id === search.institutionsId);
          const ids = opt?.myjkkn_institution_ids?.length
            ? opt.myjkkn_institution_ids
            : [search.institutionsId];
          qs.set('institutionsIds', ids.join(','));
        }

        const res = await fetch(`/api/bos/committees?${qs.toString()}`);
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? 'Failed to fetch committees');
        }
        const { data, metadata } = await res.json();

        return {
          success: true,
          data: data ?? [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: metadata?.totalPages ?? 0,
            total_items: metadata?.total ?? 0,
          },
        };
      } catch (error) {
        logger.error('academic/bos', 'Error fetching committees', error);
        throw error;
      }
    },
    [search, allInstitutions, view]
  );

  const handleBulkDeleteClick = (
    selectedRows: BosCommittee[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;
    setPendingDelete({ rows: selectedRows, resetSelection });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const count = pendingDelete.rows.length;
    setIsDeleting(true);
    try {
      await Promise.all(
        pendingDelete.rows.map((row) => deleteCommittee.mutateAsync(row.id))
      );
      toast.success(`${count} committee${count > 1 ? 's' : ''} deleted`);
      pendingDelete.resetSelection();
    } catch (error) {
      logger.error('academic/bos', 'Error deleting committees', error);
      // Committees with members are blocked server-side with a descriptive 409.
      toast.error((error as Error).message || 'Failed to delete some committees');
    } finally {
      bumpRefetch();
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setPendingDelete(null);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: unknown[];
    resetSelection: () => void;
  }) => (
    <div className='flex flex-wrap items-center gap-2'>
      {/* Templates-only vs. all-committees view. Templates are the reusable
          blueprints; "All" also surfaces every composition's committees. */}
      <div className='flex items-center rounded-md border p-0.5'>
        <Button
          type='button'
          onClick={() => setView('template')}
          variant={view === 'template' ? 'secondary' : 'ghost'}
          size='sm'
          className='h-7 px-2 text-xs'
        >
          Templates
        </Button>
        <Button
          type='button'
          onClick={() => setView('all')}
          variant={view === 'all' ? 'secondary' : 'ghost'}
          size='sm'
          className='h-7 px-2 text-xs'
        >
          All
        </Button>
      </div>
      {canManage && (
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Committee
        </Button>
      )}
      {canManage && props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDeleteClick(
              props.selectedRows as BosCommittee[],
              props.resetSelection
            )
          }
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>
    );
  }

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as never}
        exportConfig={{
          entityName: 'bos-committees',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'bos-committees-table',
        }}
        renderToolbarContent={renderCustomToolbar}
        refetchKey={refetchKey}
      />

      <CommitteeFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={bumpRefetch}
        committee={editing}
        institutions={allInstitutions}
        isSuperAdmin={!!isSuperAdmin}
        defaultInstitutionsId={ownCtx?.myjkkn_id ?? undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Committees</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.rows.length ?? 0} committee
              {(pendingDelete?.rows.length ?? 0) > 1 ? 's' : ''}? Committees that still
              have members are skipped with an error. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
