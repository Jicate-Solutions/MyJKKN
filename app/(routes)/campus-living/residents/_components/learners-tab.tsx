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
import { useMyBlockAccess } from '@/hooks/campus-living/use-hostel-attendance';
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
import { AddLearnerToHostelDialog } from './add-learner-to-hostel-dialog';
import { EditHosteliteDrawer } from './edit-hostelite-drawer';
import { LearnerDetailDrawer } from './learner-detail-drawer';
import { AllocateRoomDialog } from './allocate-room-dialog';

// Export schema for the Hostel Residents (Learners) table — the single source of
// truth for the CSV/XLSX columns, their labels, and their widths (in column
// order). Keys are deliberately DISTINCT from the table's column ids: the shared
// DataTable drops any export header that collides with a HIDDEN table column, so
// non-colliding keys guarantee the full detail set is always emitted regardless
// of the user's column-visibility choices. The transformFunction below produces
// exactly these keys.
const RESIDENT_EXPORT_COLUMNS: ReadonlyArray<{
  key: string;
  label: string;
  width: number;
}> = [
  { key: 'roll_no', label: 'Roll Number', width: 16 },
  { key: 'full_name', label: 'Name', width: 24 },
  { key: 'gender', label: 'Gender', width: 10 },
  { key: 'student_email', label: 'Student Email', width: 28 },
  { key: 'college_email', label: 'College Email', width: 28 },
  { key: 'father_name', label: 'Father Name', width: 22 },
  { key: 'mother_name', label: 'Mother Name', width: 22 },
  { key: 'institution_name', label: 'Institution', width: 28 },
  { key: 'program', label: 'Program', width: 26 },
  { key: 'degree', label: 'Degree', width: 18 },
  { key: 'semester', label: 'Semester', width: 14 },
  { key: 'academic_year', label: 'Academic Year', width: 16 },
  { key: 'year_of_study', label: 'Year of Study', width: 12 },
  { key: 'block', label: 'Block', width: 20 },
  { key: 'block_code', label: 'Block Code', width: 12 },
  { key: 'room', label: 'Room', width: 12 },
  { key: 'bed', label: 'Bed', width: 10 },
  { key: 'room_category_name', label: 'Room Category', width: 18 },
  { key: 'mess_category_name', label: 'Mess Category', width: 18 },
  { key: 'status', label: 'Lifecycle Status', width: 16 },
  { key: 'hostel_fee', label: 'Hostel Fee', width: 14 },
  { key: 'bills_generated', label: 'Bills Generated', width: 14 },
  { key: 'bill_count', label: 'Bill Count', width: 10 },
  { key: 'total_billed', label: 'Total Billed', width: 14 },
  { key: 'total_paid', label: 'Total Paid', width: 14 },
  { key: 'total_outstanding', label: 'Outstanding', width: 14 },
  { key: 'payment_status', label: 'Payment Status', width: 14 },
  { key: 'bill_academic_year', label: 'Billing Academic Year', width: 18 },
];

const RESIDENT_EXPORT_HEADERS = RESIDENT_EXPORT_COLUMNS.map((c) => c.key);
const RESIDENT_EXPORT_MAPPING: Record<string, string> = Object.fromEntries(
  RESIDENT_EXPORT_COLUMNS.map((c) => [c.key, c.label]),
);
const RESIDENT_EXPORT_WIDTHS = RESIDENT_EXPORT_COLUMNS.map((c) => ({
  wch: c.width,
}));

export function LearnersTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();
  const searchParams = useSearchParams();

  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];
  const canAllocate = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];

  // Block-assigned wardens are scoped to the residents of THEIR blocks
  // (cross-institution) — a chief warden is commonly assigned to blocks owned by
  // other colleges, so pinning them to their own profile institution showed the
  // wrong roster. Everyone else stays institution-pinned (super-admins use the
  // institution_id URL filter, handled inside fetchData via filters).
  const { data: blockGrants } = useMyBlockAccess();
  const myBlockIds = useMemo(() => blockGrants ?? [], [blockGrants]);
  const isBlockScoped = !isSuperAdmin && myBlockIds.length > 0;

  const effectiveInstitutionId: string | undefined =
    isSuperAdmin || isBlockScoped
      ? undefined
      : (profile?.institution_id ?? undefined);

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Drawer / dialog state. detailLearner holds the whole row (not just the id)
  // so the detail drawer's "Allocate" CTA can hand the same LearnerHostelite to
  // the inline allocate dialog.
  const [detailLearner, setDetailLearner] = useState<LearnerHostelite | null>(null);
  const [editTarget, setEditTarget] = useState<LearnerHostelite | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // allocateTarget is set only from the detail drawer's "Allocate" CTA —
  // 2026-07-06: the row-action allocation entries (allocate / change bed /
  // remove) moved exclusively to the Allocations module.
  const [allocateTarget, setAllocateTarget] = useState<LearnerHostelite | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

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
    if (g('mess_category_id')) f.mess_category_id = g('mess_category_id');
    if (g('room_id')) f.room_id = g('room_id');
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
        ...(isBlockScoped ? { block_ids: myBlockIds } : {}),
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
    [filterParams, effectiveInstitutionId, isBlockScoped, myBlockIds],
  );

  const columns = useMemo(
    () =>
      getLearnerColumns({
        canEdit,
        isSuperAdmin,
        instName,
        onView: (l) => setDetailLearner(l),
        onEdit: (l) => setEditTarget(l),
      }),
    [canEdit, isSuperAdmin, instName],
  );

  // Complete-detail export config. The transform flattens each view row (plus the
  // merged per-page bill_status rollup) into the flat RESIDENT_EXPORT_COLUMNS
  // schema. instName resolves institution_id → name; bill_status fields surface
  // the current-academic-year billing rollup. "Export All Pages" walks every page
  // via the table's getAllItems(), so the export is not limited to the visible
  // page. Memoised on instName so the closure is stable across renders.
  const exportConfig = useMemo(
    () => ({
      entityName: 'hostel-learner-residents',
      headers: RESIDENT_EXPORT_HEADERS,
      columnMapping: RESIDENT_EXPORT_MAPPING,
      columnWidths: RESIDENT_EXPORT_WIDTHS,
      transformFunction: (row: LearnerHostelite) => {
        const b = row.bill_status;
        const name =
          [row.first_name, row.last_name]
            .filter(Boolean)
            .map((s) => s!.trim())
            .join(' ') || null;
        const inst = row.institution_id ? instName(row.institution_id) : null;
        return {
          roll_no: row.roll_number ?? null,
          full_name: name,
          gender: row.gender ?? null,
          student_email: row.student_email ?? null,
          college_email: row.college_email ?? null,
          father_name: row.father_name ?? null,
          mother_name: row.mother_name ?? null,
          institution_name: inst && inst !== '—' ? inst : null,
          program: row.program_name ?? null,
          degree: row.degree_name ?? null,
          semester: row.semester_name ?? null,
          academic_year: row.academic_year_name ?? null,
          year_of_study: row.year_of_study ?? null,
          block: row.current_block_name ?? null,
          block_code: row.current_block_code ?? null,
          room: row.current_room_number ?? null,
          bed: row.current_bed_number ?? null,
          room_category_name: row.hostel_category_name ?? null,
          mess_category_name: row.mess_category_name ?? null,
          status: row.lifecycle_status ?? null,
          hostel_fee: row.hostel_fee ?? null,
          bills_generated: b ? (b.bill_count > 0 ? 'Yes' : 'No') : 'No',
          bill_count: b?.bill_count ?? 0,
          total_billed: b?.total_billed ?? null,
          total_paid: b?.total_paid ?? null,
          total_outstanding: b?.total_outstanding ?? null,
          payment_status: b?.payment_status ?? null,
          bill_academic_year: b?.academic_year_name ?? null,
        };
      },
    }),
    [instName],
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

      <div className="pinned-actions-col">
        <DataTable
          fetchDataFn={fetchData}
          getColumns={() => columns}
          idField='id'
          refetchKey={refetchKey}
          exportConfig={exportConfig}
          config={{
            enableUrlState: true,
            enableDateFilter: false,
            enableExport: true,
            enableRowSelection: false,
          }}
        />
      </div>

      {/* Drawers + dialogs */}
      <EditHosteliteDrawer learner={editTarget} onClose={() => setEditTarget(null)} />
      <AddLearnerToHostelDialog open={addOpen} onOpenChange={setAddOpen} institutionId={effectiveInstitutionId} />
      <LearnerDetailDrawer
        learnerId={detailLearner?.id ?? null}
        onClose={() => setDetailLearner(null)}
        canEdit={canEdit}
        onEdit={canEdit && detailLearner ? () => { setDetailLearner(null); } : undefined}
        onAllocate={
          canAllocate && detailLearner
            ? () => { setAllocateTarget(detailLearner); setDetailLearner(null); }
            : undefined
        }
      />
      <AllocateRoomDialog
        learner={allocateTarget}
        onClose={() => setAllocateTarget(null)}
        onSuccess={() => { setAllocateTarget(null); setRefetchKey((k) => k + 1); }}
      />
    </div>
  );
}
