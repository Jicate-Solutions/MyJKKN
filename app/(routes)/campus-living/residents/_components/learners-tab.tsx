'use client';

// Learners tab on /campus-living/residents. Lists Learners classified as
// hostelites (learners_profiles.accommodation_type='HOSTEL') via
// v_learner_hostelites, in the shared advanced DataTable with the
// Learners-Profiles academic cascade filters + hostel filters. Mutations still
// target learners_profiles (the view is read-only).

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { DataTable } from '@/components/data-table/data-table';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
  BlockFilterValue,
} from '@/types/campus-living';
import { getLearnerColumns } from './learners-columns';
import { LearnersFilters } from './learners-filters';
import { RemoveHosteliteDialog } from './remove-hostelite-dialog';
import { AddLearnerToHostelDialog } from './add-learner-to-hostel-dialog';
import { EditHosteliteDrawer } from './edit-hostelite-drawer';
import { LearnerDetailDrawer } from './learner-detail-drawer';

export function LearnersTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const searchParams = useSearchParams();

  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];

  // Non-super-admins are pinned to their institution; super-admins use the
  // institution_id URL filter (handled inside fetchData via filters).
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Drawer / dialog state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<LearnerHostelite | null>(null);
  const [removeTarget, setRemoveTarget] = useState<LearnerHostelite | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Build cascade filters from URL params. The closure captures these values,
  // so its identity changes when the URL changes → DataTable refetches
  // (data-table.tsx effect deps include fetchDataFn).
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
      // Batched, non-fatal billing rollup for the visible page (merged onto rows
      // so the new columns read row.original.bill_status without N+1).
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
    [filterParams, effectiveInstitutionId],
  );

  const columns = useMemo(
    () =>
      getLearnerColumns({
        canEdit,
        isSuperAdmin,
        instName,
        onView: (l) => setDetailId(l.id),
        onEdit: (l) => setEditTarget(l),
        onRemove: (l) => setRemoveTarget(l),
      }),
    [canEdit, isSuperAdmin, instName],
  );

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className='mr-2 h-4 w-4' />
          Add Learner to Hostel
        </Button>
      </div>

      <LearnersFilters />

      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns}
        idField='id'
        exportConfig={{
          entityName: 'hostel-learner-residents',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: false,
        }}
      />

      {/* Drawers + dialogs */}
      <RemoveHosteliteDialog learner={removeTarget} onClose={() => setRemoveTarget(null)} />
      <EditHosteliteDrawer learner={editTarget} onClose={() => setEditTarget(null)} />
      <AddLearnerToHostelDialog open={addOpen} onOpenChange={setAddOpen} institutionId={effectiveInstitutionId} />
      <LearnerDetailDrawer
        learnerId={detailId}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
        onEdit={canEdit && detailId ? () => { setDetailId(null); } : undefined}
      />
    </div>
  );
}
