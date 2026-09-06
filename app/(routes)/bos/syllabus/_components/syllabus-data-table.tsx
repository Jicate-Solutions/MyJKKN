'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/data-table/data-table';
import { BosCourseSyllabus } from '@/types/bos';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosSyllabus } from '@/hooks/bos/use-bos-syllabus';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { createSyllabusColumns } from './columns';
import { BulkSyllabiDownloadButton } from './bulk-syllabi-download';
import { SyllabusSearchParams } from './data-table-schema';
import type { InstitutionOption } from '../../_components/institution-picker';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface SyllabusDataTableProps {
  search: SyllabusSearchParams;
}

export function SyllabusDataTable({ search }: SyllabusDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const boardScope = useBosBoardScope();
  const deleteBosSyllabus = useDeleteBosSyllabus();
  // The syllabus list query lives under ['bos', 'syllabi', ...] (see
  // hooks/bos/use-bos-syllabus.ts). The table fetches via fetchDataFn so it
  // never observes that query directly — this bridge re-fetches on invalidate.
  const refetchKey = useDataTableRefreshOnInvalidate(['bos', 'syllabi']);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isReady = !permissionsLoading && !!userProfile;

  // Resolve institution name once for PDF headers — reuses the same cached query
  // that InstitutionPicker and filters already populate.
  const { data: institutions = [] } = useQuery<InstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) throw new Error('Failed to load institutions');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const scopedInstitutionsId = search.institutionsId || (!isSuperAdmin ? userProfile?.institution_id : undefined);
  const institutionName = useMemo(
    () => institutions.find(
      (i) => i.id === scopedInstitutionsId || i.myjkkn_institution_ids.includes(scopedInstitutionsId ?? '')
    )?.name,
    [institutions, scopedInstitutionsId]
  );

  // All MyJKKN UUIDs (Aided + Self) belonging to CAS (Arts & Science). Detected
  // via the COE institution_code = MyJKKN counselling_code bridge ('CAS'). A
  // syllabus in this set renders its unit content as a flowing paragraph in the PDF.
  const casInstitutionIds = useMemo(
    () => new Set(
      institutions
        .filter((i) => (i.institution_code ?? '').toUpperCase() === 'CAS')
        .flatMap((i) => i.myjkkn_institution_ids)
    ),
    [institutions]
  );

  // All MyJKKN UUIDs belonging to CET (College of Engineering & Technology),
  // via the same COE institution_code = MyJKKN counselling_code bridge. Every
  // syllabus hosted under CET renders the Engineering (Anna University) PDF
  // format — course_code/stream heuristics alone miss codes like "CP25C22".
  const cetInstitutionIds = useMemo(
    () => new Set(
      institutions
        .filter((i) => (i.institution_code ?? '').toUpperCase() === 'CET')
        .flatMap((i) => i.myjkkn_institution_ids)
    ),
    [institutions]
  );

  // Regulation title for the bulk-download filename ("Syllabi_R-2024_….zip").
  // Same endpoint the filter bar uses, so React Query serves it from cache.
  const { data: regulations = [] } = useQuery<{ id: string; title?: string }[]>({
    queryKey: ['bos', 'regulations', scopedInstitutionsId],
    queryFn: async () => {
      const url = new URL('/api/bos/regulations', window.location.origin);
      if (scopedInstitutionsId) url.searchParams.set('institutionId', scopedInstitutionsId);
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error('Failed to load regulations');
      return (await r.json()).data ?? [];
    },
    enabled: !!search.regulationId,
    staleTime: 5 * 60 * 1000,
  });
  const regulationLabel = useMemo(
    () => regulations.find((r) => r.id === search.regulationId)?.title,
    [regulations, search.regulationId],
  );

  // Board membership IS the authorization here — see the same comment in
  // syllabus-actions.tsx. We intentionally don't gate on canAccess('create')
  // because role-permission grants drift out of sync with composition
  // membership in this codebase. Server enforces via guardInstitutionWrite.
  const isBoardMember = !boardScope.isLoading && boardScope.memberOf.size > 0;
  const canCreate = useMemo(
    () => isSuperAdmin || isBoardMember,
    [isSuperAdmin, isBoardMember]
  );
  const canDelete = useMemo(
    () => isSuperAdmin || canAccess('academic.bos-syllabus', 'delete'),
    [isSuperAdmin, canAccess]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search?: string;
      from_date?: string;
      to_date?: string;
      sort_by?: string;
      sort_order?: string;
    }) => {
      try {
        // Determine institution scope.
        // Super-admin: undefined = "All institutions" — let the API fan-out across every institution.
        // Non-admin: must always have an institutions_id; if the profile lacks one we have nothing to query.
        const scopedInstitutionsId = search.institutionsId || (!isSuperAdmin ? userProfile?.institution_id : undefined);

        if (!isSuperAdmin && !scopedInstitutionsId) {
          return {
            success: true,
            data: [],
            pagination: { page: 1, limit: 20, total_pages: 0, total_items: 0 },
          };
        }

        const { data, metadata } = await BosSyllabusService.getSyllabi({
          page: params.page,
          limit: params.limit,
          search: params.search,
          boardId: search.boardId,
          regulationId: search.regulationId,
          stream: search.stream,
          isLatest: search.is_latest === 'true' ? true : search.is_latest === 'false' ? false : undefined,
          institutionsId: scopedInstitutionsId,
        });

        return {
          success: true,
          data: data || [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: Math.ceil((metadata?.total || 0) / params.limit),
            total_items: metadata?.total || 0,
          },
        };
      } catch (error) {
        console.error('Failed to fetch syllabi:', error);
        return {
          success: false,
          data: [],
          pagination: { page: 1, limit: 20, total_pages: 0, total_items: 0 },
        };
      }
    },
    [search.boardId, search.regulationId, search.stream, search.is_latest, search.institutionsId, isSuperAdmin, userProfile?.institution_id]
  );

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(selectedIds.map((id) => deleteBosSyllabus.mutateAsync(id)));
      setDeleteDialogOpen(false);
      setSelectedIds([]);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

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
        getColumns={() => createSyllabusColumns(institutionName, casInstitutionIds, cetInstitutionIds)}
        exportConfig={{
          entityName: 'syllabi',
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
          columnResizingTableId: 'bos-syllabi-table',
        }}
        refetchKey={refetchKey}
        renderToolbarContent={({ selectedRows, allSelectedIds, totalSelectedCount }) => (
          <div className='flex gap-2'>
            <BulkSyllabiDownloadButton
              institutionsId={scopedInstitutionsId}
              regulationId={search.regulationId}
              regulationLabel={regulationLabel}
              boardId={search.boardId}
              stream={search.stream}
              institutions={institutions}
              casInstitutionIds={casInstitutionIds}
              cetInstitutionIds={cetInstitutionIds}
            />
            {canCreate && (
              <Button
                size='sm'
                onClick={() => router.push('/bos/syllabus/new')}
              >
                <Plus className='h-4 w-4 mr-2' />
                New Syllabus
              </Button>
            )}
            {canDelete && totalSelectedCount > 0 && (
              <Button
                size='sm'
                variant='destructive'
                onClick={() => {
                  setSelectedIds(allSelectedIds);
                  setDeleteDialogOpen(true);
                }}
              >
                Delete ({totalSelectedCount})
              </Button>
            )}
          </div>
        )}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Syllabi</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} syllabus/syllabi? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex justify-end gap-3'>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className='bg-red-600 hover:bg-red-700'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
