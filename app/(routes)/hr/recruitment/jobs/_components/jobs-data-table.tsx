'use client';

// ============================================================================
// HR Recruitment — Jobs admin, advanced-DataTable edition.
// Replaces the policy-shell LookupTable with the shared advanced DataTable
// (server pagination/sort/search, column controls, row selection) plus a
// dedicated filter bar. Create/Edit still uses PolicyFormShell so the
// institution dropdown + department cascade + trigger-derived org are reused.
// ============================================================================

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { DataTable } from '@/components/data-table/data-table';
import {
  PolicyFormShell,
  type EnumOption,
  type FieldSchema,
} from '@/lib/admin/policy-shell';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RecruitmentJobsService } from '@/lib/services/hr/recruitment-jobs-service';
import {
  JOB_STATUS_LABELS,
  type HRRecruitmentJob,
  type JobStatus,
  type RoleCategory,
} from '@/types/hr-recruitment';

import { getJobColumns } from './jobs-columns';
import { JobsFilters, type JobsFilterState } from './jobs-filters';
import { ROLE_CATEGORY_OPTIONS } from './labels';

// ---------------------------------------------------------------------------
// Status options (with the per-status guidance hints the old form carried).
// ---------------------------------------------------------------------------
const STATUS_OPTIONS: ReadonlyArray<EnumOption> = (
  Object.keys(JOB_STATUS_LABELS) as JobStatus[]
).map((value) => ({
  value,
  label: JOB_STATUS_LABELS[value],
  hint:
    value === 'open'
      ? 'Visible to interviewers; flip "Public on /careers" on to also expose it externally.'
      : value === 'on_hold'
      ? 'Hidden from public; existing applications stay attached.'
      : value === 'closed'
      ? 'Hiring abandoned. Future applications blocked.'
      : value === 'filled'
      ? 'All positions filled. Closes the posting cleanly.'
      : 'Not visible to anyone yet — finalise details before opening.',
}));

// ---------------------------------------------------------------------------
// Create/Edit form schema. institution_id is a dropdown; hr_organization_id is
// derived from it by a DB trigger. department_id cascades off the institution.
// ---------------------------------------------------------------------------
function buildFormSchema(
  editing: HRRecruitmentJob | null,
  institutionOptions: ReadonlyArray<EnumOption>,
  departmentsByInstitution: ReadonlyMap<string, EnumOption[]>,
): ReadonlyArray<FieldSchema> {
  const isEdit = editing !== null;

  return [
    {
      name: 'institution_id',
      kind: 'enum',
      englishLabel: 'Institution / College',
      englishHint: isEdit
        ? 'The college this posting belongs to. Locked once created.'
        : 'Pick the college this job is posted for. The matching HR organization is set automatically — no UUIDs to paste.',
      placeholder: 'Select a college…',
      options: institutionOptions,
      required: true,
      disabled: isEdit,
    },
    {
      name: 'title',
      kind: 'text',
      englishLabel: 'Job title',
      englishHint:
        'How the role is named in the posting (e.g. "Assistant Professor — Mechanical").',
      placeholder: 'e.g. Assistant Professor — Mechanical Engineering',
      required: true,
    },
    {
      name: 'role_category',
      kind: 'enum',
      englishLabel: 'Role category',
      englishHint:
        'Drives the approval chain on candidates submitted against this job.',
      options: ROLE_CATEGORY_OPTIONS,
      required: true,
    },
    {
      name: 'department_id',
      kind: 'enum',
      englishLabel: 'Department (optional)',
      englishHint:
        'Pin the posting to one department so its HoD sees the applications. Pick the institution first; leave blank for none.',
      placeholder: 'No specific department',
      dynamicOptions: (values) => {
        const instId =
          typeof values.institution_id === 'string' ? values.institution_id : '';
        return instId ? departmentsByInstitution.get(instId) ?? [] : [];
      },
    },
    {
      name: 'description',
      kind: 'textarea',
      englishLabel: 'Description',
      englishHint:
        'What the role does and what success looks like. Shown on /careers when published.',
      placeholder: 'What does this role do? What does success look like?',
    },
    {
      name: 'positions_open',
      kind: 'number',
      englishLabel: 'Positions open',
      englishHint: 'How many people you intend to hire under this posting.',
      min: 1,
      step: 1,
    },
    {
      name: 'positions_filled',
      kind: 'number',
      englishLabel: 'Positions filled',
      englishHint:
        'Updated as candidates join. When this reaches positions open, set status to "Filled".',
      min: 0,
      step: 1,
    },
    {
      name: 'min_monthly_salary',
      kind: 'number',
      englishLabel: 'Min monthly salary (INR)',
      englishHint: 'Lower bound advertised. Leave blank to keep it undisclosed.',
      min: 0,
      step: 1000,
    },
    {
      name: 'max_monthly_salary',
      kind: 'number',
      englishLabel: 'Max monthly salary (INR)',
      englishHint: 'Upper bound. Must be ≥ min if both are set.',
      min: 0,
      step: 1000,
    },
    {
      name: 'status',
      kind: 'enum-with-hint',
      englishLabel: 'Status',
      englishHint:
        'Draft = not visible. Open = ready for applications. On Hold = paused. Closed/Filled = no more applications.',
      options: STATUS_OPTIONS,
      required: true,
    },
    {
      name: 'is_public',
      kind: 'toggle',
      englishLabel: 'Public on /careers',
      englishHint:
        'When on, this job is visible on the public careers page. Best paired with status "Open".',
    },
  ];
}

const NEW_ROW_DEFAULTS = {
  institution_id: '',
  title: '',
  role_category: 'teaching_faculty' as RoleCategory,
  description: '',
  department_id: '',
  positions_open: 1,
  positions_filled: 0,
  min_monthly_salary: '',
  max_monthly_salary: '',
  status: 'draft' as JobStatus,
  is_public: false,
};

function rowToFormValues(row: HRRecruitmentJob): Record<string, unknown> {
  return {
    institution_id: row.institution_id ?? '',
    title: row.title,
    role_category: row.role_category,
    description: row.description ?? '',
    department_id: row.department_id ?? '',
    positions_open: row.positions_open,
    positions_filled: row.positions_filled,
    min_monthly_salary: row.min_monthly_salary ?? '',
    max_monthly_salary: row.max_monthly_salary ?? '',
    status: row.status,
    is_public: row.is_public,
  };
}

export function JobsDataTable() {
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // -------- Reference data: institutions + departments --------
  const { institutions } = useInstitutionsWithAccess();
  const { data: deptResp } = useDepartments({ isActive: true, limit: 1000 });

  const institutionOptions = useMemo<EnumOption[]>(
    () => institutions.map((i) => ({ value: i.id, label: i.name })),
    [institutions],
  );
  const institutionNameById = useMemo(
    () => new Map(institutions.map((i) => [i.id, i.name] as const)),
    [institutions],
  );
  const departmentsByInstitution = useMemo<ReadonlyMap<string, EnumOption[]>>(() => {
    const map = new Map<string, EnumOption[]>();
    for (const d of deptResp?.data ?? []) {
      const opt: EnumOption = {
        value: d.id,
        label: d.display_name || d.department_name,
      };
      const existing = map.get(d.institution_id);
      if (existing) existing.push(opt);
      else map.set(d.institution_id, [opt]);
    }
    return map;
  }, [deptResp]);
  const departmentNameById = useMemo(
    () =>
      new Map(
        (deptResp?.data ?? []).map(
          (d) => [d.id, d.display_name || d.department_name] as const,
        ),
      ),
    [deptResp],
  );

  // -------- Filters --------
  const [filters, setFilters] = useState<JobsFilterState>({});
  const onFilterChange = useCallback((patch: Partial<JobsFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  // -------- Dialog state --------
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<HRRecruitmentJob | null>(null);
  const [deletingRows, setDeletingRows] = useState<HRRecruitmentJob[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  // -------- Data fetch (closes over filters → refetches when they change) -----
  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const { data, metadata } = await RecruitmentJobsService.listJobs(supabase, {
        page: params.page,
        pageSize: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        status: filters.status,
        role_category: filters.role_category,
        institution_id: filters.institution_id,
        department_id: filters.department_id,
        is_public: filters.is_public,
      });

      return {
        success: true,
        data,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    },
    [
      supabase,
      filters.status,
      filters.role_category,
      filters.institution_id,
      filters.department_id,
      filters.is_public,
    ],
  );

  // -------- Row action handlers --------
  const openCreate = useCallback(() => {
    router.push('/hr/recruitment/jobs/new');
  }, [router]);
  const openEdit = useCallback((row: HRRecruitmentJob) => {
    setEditingRow(row);
    setFormOpen(true);
  }, []);
  const openDeleteOne = useCallback((row: HRRecruitmentJob) => {
    setDeleteResetFn(null);
    setDeletingRows([row]);
  }, []);

  const getColumns = useCallback(
    () =>
      getJobColumns({
        institutionNameById,
        departmentNameById,
        onEdit: openEdit,
        onDelete: openDeleteOne,
      }),
    [institutionNameById, departmentNameById, openEdit, openDeleteOne],
  );

  // -------- Save (create or update) --------
  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      const optionalUuid = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const optionalText = (raw: unknown): string | null => {
        const v = typeof raw === 'string' ? raw.trim() : '';
        return v.length > 0 ? v : null;
      };
      const toIntOrNull = (raw: unknown): number | null => {
        if (raw == null || raw === '') return null;
        const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        return Number.isFinite(n) ? n : null;
      };

      const title = String(values.title ?? '').trim();
      if (!title) throw new Error('Job title is required.');
      const role_category = String(values.role_category ?? '').trim() as RoleCategory;
      if (!role_category) throw new Error('Role category is required.');
      const status = (String(values.status ?? '').trim() || 'draft') as JobStatus;

      const minSalary = toIntOrNull(values.min_monthly_salary);
      const maxSalary = toIntOrNull(values.max_monthly_salary);
      if (minSalary != null && maxSalary != null && minSalary > maxSalary) {
        throw new Error('Min monthly salary cannot exceed max monthly salary.');
      }
      const positionsOpen = toIntOrNull(values.positions_open);
      const positionsFilled = toIntOrNull(values.positions_filled);

      if (editingRow) {
        await RecruitmentJobsService.updateJob(supabase, editingRow.id, {
          title,
          role_category,
          description: optionalText(values.description),
          min_monthly_salary: minSalary,
          max_monthly_salary: maxSalary,
          positions_open: positionsOpen ?? editingRow.positions_open,
          positions_filled: positionsFilled ?? editingRow.positions_filled,
          department_id: optionalUuid(values.department_id),
          status,
          is_public: Boolean(values.is_public),
        });
      } else {
        const institution_id = optionalUuid(values.institution_id);
        if (!institution_id) throw new Error('Institution is required.');

        // Drop a stale department if the institution changed after picking one.
        const deptCandidate = optionalUuid(values.department_id);
        const department_id =
          deptCandidate &&
          (departmentsByInstitution.get(institution_id) ?? []).some(
            (o) => o.value === deptCandidate,
          )
            ? deptCandidate
            : null;

        // hr_organization_id omitted: derived from institution_id by the
        // hr_recruitment_jobs_fill_org trigger.
        await RecruitmentJobsService.createJob(supabase, {
          institution_id,
          title,
          role_category,
          description: optionalText(values.description),
          min_monthly_salary: minSalary,
          max_monthly_salary: maxSalary,
          positions_open: positionsOpen ?? 1,
          positions_filled: positionsFilled ?? 0,
          department_id,
          status,
          is_public: Boolean(values.is_public),
        });
      }

      toast.success(editingRow ? 'Job posting updated' : 'Job posting added');
      setFormOpen(false);
      setEditingRow(null);
      refetch();
    },
    [editingRow, supabase, departmentsByInstitution, refetch],
  );

  // -------- Delete (single or bulk) --------
  const confirmDelete = useCallback(async () => {
    if (deletingRows.length === 0) return;
    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        deletingRows.map((row) =>
          RecruitmentJobsService.deleteJob(supabase, row.id),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (ok > 0) toast.success(`Deleted ${ok} job posting${ok > 1 ? 's' : ''}`);
      if (failed > 0)
        toast.error(`Failed to delete ${failed} job posting${failed > 1 ? 's' : ''}`);
      deleteResetFn?.();
      setDeletingRows([]);
      setDeleteResetFn(null);
      refetch();
    } finally {
      setIsDeleting(false);
    }
  }, [deletingRows, deleteResetFn, supabase, refetch]);

  // -------- Toolbar: Add + bulk-delete --------
  const renderToolbar = useCallback(
    (props: {
      selectedRows: HRRecruitmentJob[];
      resetSelection: () => void;
    }) => (
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='sm' className='h-8' onClick={openCreate}>
          <Plus className='mr-2 h-4 w-4' />
          Add Job Posting
        </Button>
        {props.selectedRows.length > 0 && (
          <Button
            size='sm'
            variant='destructive'
            className='h-8'
            onClick={() => {
              setDeleteResetFn(() => props.resetSelection);
              setDeletingRows(props.selectedRows);
            }}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete selected ({props.selectedRows.length})
          </Button>
        )}
      </div>
    ),
    [openCreate],
  );

  const formFields = useMemo(
    () => buildFormSchema(editingRow, institutionOptions, departmentsByInstitution),
    [editingRow, institutionOptions, departmentsByInstitution],
  );
  const initialValues = useMemo(
    () => (editingRow ? rowToFormValues(editingRow) : { ...NEW_ROW_DEFAULTS }),
    [editingRow],
  );

  return (
    <>
      <JobsFilters
        filters={filters}
        onFilterChange={onFilterChange}
        institutions={institutions}
        departmentsByInstitution={departmentsByInstitution}
      />

      <DataTable<HRRecruitmentJob, unknown>
        fetchDataFn={fetchData}
        getColumns={getColumns}
        idField='id'
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'job postings',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          columnResizingTableId: 'hr-recruitment-jobs',
        }}
        renderToolbarContent={renderToolbar}
      />

      <PolicyFormShell
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingRow(null);
        }}
        title={editingRow ? 'Edit Job Posting' : 'Add Job Posting'}
        fields={formFields}
        initialValues={initialValues}
        institutions={institutions}
        saveLabel={editingRow ? 'Save changes' : 'Add job posting'}
        onSubmit={handleSubmit}
      />

      <AlertDialog
        open={deletingRows.length > 0}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeletingRows([]);
            setDeleteResetFn(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingRows.length > 1
                ? `Delete ${deletingRows.length} job postings?`
                : `Delete "${deletingRows[0]?.title}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the posting{deletingRows.length > 1 ? 's' : ''}.
              Existing candidates keep their records but lose the link back to{' '}
              {deletingRows.length > 1 ? 'these postings' : 'this posting'}. Use
              "Closed" status instead to soft-archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
