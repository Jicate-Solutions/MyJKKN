'use client';

/**
 * Recruitment approval workflows manager — advanced-DataTable edition.
 *
 * List-first: the shared DataTable (search, sort, pagination, URL state,
 * column controls, row selection with bulk delete) over hr_approval_flows
 * rows (one per organization × role category). Create and Edit are real
 * routes (/new and /[id]) so browser back returns to this table. The editor
 * lives in flow-editor.tsx. Runtime invariant to keep in mind: candidate
 * routing consults ONE active band-less flow per (org, category) — the
 * editor warns when a save would replace an overlapping flow.
 *
 * The flow list is small config data, so fetchDataFn pulls the whole set
 * from the API and applies search/sort/pagination in-memory.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/data-table/data-table';
import {
  useHrOrganizations,
  useRoleUserCounts,
  useSetApprovalFlowActive,
  useDeleteApprovalFlow,
} from '@/hooks/hr/use-recruitment';
import {
  ROLE_CATEGORY_LABELS,
  type HRApprovalFlow,
  type RoleCategory,
} from '@/types/hr-recruitment';

import { getFlowColumns } from './flows-columns';
import { FlowDetailsDialog } from './flow-details-dialog';

const BASE_PATH = '/hr/admin/recruitment-approval-flows';

export function FlowBuilderClient() {
  const router = useRouter();

  const { data: orgs } = useHrOrganizations();
  const { data: roleCounts } = useRoleUserCounts();
  const setActive = useSetApprovalFlowActive();
  const deleteFlow = useDeleteApprovalFlow();

  const [viewingFlow, setViewingFlow] = useState<HRApprovalFlow | null>(null);
  const [deletingRows, setDeletingRows] = useState<HRApprovalFlow[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  const orgNameById = useMemo(
    () => new Map((orgs ?? []).map((o) => [o.id, o.name ?? o.id] as const)),
    [orgs],
  );
  const roleNameByKey = useMemo(
    () => new Map((roleCounts ?? []).map((r) => [r.role_key, r.role_name] as const)),
    [roleCounts],
  );

  // -------- Data fetch: whole list from the API, filtered/sorted/paged here ----
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
      const res = await fetch('/api/hr/recruitment/approval-flows');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Flows fetch failed: ${res.status}`);
      }
      let rows = (((await res.json()).data) ?? []) as HRApprovalFlow[];

      const categoryLabel = (f: HRApprovalFlow) => {
        const cat = (f.conditions as Record<string, string> | null)?.role_category;
        return cat ? (ROLE_CATEGORY_LABELS[cat as RoleCategory] ?? cat) : '';
      };
      const orgName = (f: HRApprovalFlow) =>
        orgNameById.get(f.hr_organization_id) ?? '';

      const q = params.search.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (f) =>
            f.flow_name.toLowerCase().includes(q) ||
            categoryLabel(f).toLowerCase().includes(q) ||
            orgName(f).toLowerCase().includes(q),
        );
      }

      const dir = params.sort_order === 'desc' ? -1 : 1;
      switch (params.sort_by) {
        case 'flow_name':
          rows.sort((a, b) => dir * a.flow_name.localeCompare(b.flow_name));
          break;
        case 'role_category':
          rows.sort((a, b) => dir * categoryLabel(a).localeCompare(categoryLabel(b)));
          break;
        case 'organization':
          rows.sort((a, b) => dir * orgName(a).localeCompare(orgName(b)));
          break;
        case 'is_active':
          rows.sort((a, b) => dir * (Number(a.is_active) - Number(b.is_active)));
          break;
        default:
          rows.sort(
            (a, b) =>
              orgName(a).localeCompare(orgName(b)) ||
              categoryLabel(a).localeCompare(categoryLabel(b)) ||
              a.flow_name.localeCompare(b.flow_name),
          );
      }

      const start = (params.page - 1) * params.limit;
      return {
        success: true,
        data: rows.slice(start, start + params.limit),
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(rows.length / params.limit)),
          total_items: rows.length,
        },
      };
    },
    [orgNameById],
  );

  // -------- Row actions --------
  const handleToggle = useCallback(
    (f: HRApprovalFlow) => {
      setActive.mutate(
        { id: f.id, is_active: !f.is_active },
        {
          onSuccess: () => {
            toast.success(`“${f.flow_name}” ${f.is_active ? 'deactivated' : 'activated'}.`);
            refetch();
          },
          onError: (err) => toast.error(err.message),
        },
      );
    },
    [setActive, refetch],
  );

  const getColumns = useCallback(
    () =>
      getFlowColumns({
        orgNameById,
        roleNameByKey,
        onView: (f) => setViewingFlow(f),
        onEdit: (f) => router.push(`${BASE_PATH}/${f.id}`),
        onToggle: handleToggle,
        onDelete: (f) => {
          setDeleteResetFn(null);
          setDeletingRows([f]);
        },
      }),
    [orgNameById, roleNameByKey, router, handleToggle],
  );

  // -------- Delete (single or bulk) --------
  const confirmDelete = useCallback(async () => {
    if (deletingRows.length === 0) return;
    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        deletingRows.map((row) => deleteFlow.mutateAsync(row.id)),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      if (ok > 0) toast.success(`Deleted ${ok} workflow${ok > 1 ? 's' : ''}.`);
      if (failed > 0) toast.error(`Failed to delete ${failed} workflow${failed > 1 ? 's' : ''}.`);
      deleteResetFn?.();
      setDeletingRows([]);
      setDeleteResetFn(null);
      refetch();
    } finally {
      setIsDeleting(false);
    }
  }, [deletingRows, deleteResetFn, deleteFlow, refetch]);

  // -------- Toolbar: Create + bulk delete --------
  const renderToolbar = useCallback(
    (props: { selectedRows: HRApprovalFlow[]; resetSelection: () => void }) => (
      <div className='flex items-center gap-2'>
        <Button size='sm' className='h-8' onClick={() => router.push(`${BASE_PATH}/new`)}>
          <Plus className='mr-2 h-4 w-4' />
          Create Workflow
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
    [router],
  );

  return (
    <div className='mt-2 space-y-4'>
      <Alert>
        <GitBranch className='h-4 w-4' />
        <AlertDescription>
          Each workflow routes candidates of one <span className='font-medium'>role category</span> in
          one <span className='font-medium'>organization</span>. Flows are frozen onto each candidate
          when they enter the pipeline — editing or deleting here changes{' '}
          <span className='font-medium'>future</span> candidates only.
        </AlertDescription>
      </Alert>

      <DataTable<HRApprovalFlow, unknown>
        fetchDataFn={fetchData}
        getColumns={getColumns}
        idField='id'
        refetchKey={refetchKey}
        exportConfig={{
          entityName: 'approval workflows',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          columnResizingTableId: 'hr-recruitment-approval-flows',
        }}
        renderToolbarContent={renderToolbar}
      />

      <FlowDetailsDialog
        flow={viewingFlow}
        orgNameById={orgNameById}
        roleNameByKey={roleNameByKey}
        onClose={() => setViewingFlow(null)}
        onEdit={(f) => {
          setViewingFlow(null);
          router.push(`${BASE_PATH}/${f.id}`);
        }}
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
                ? `Delete ${deletingRows.length} workflows?`
                : `Delete “${deletingRows[0]?.flow_name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Candidates already in the pipeline keep their frozen approval chain, but{' '}
              <span className='font-medium'>new candidates</span> in the affected organization and
              role category will have no workflow and can&rsquo;t be submitted until another one
              covers them. Consider deactivating instead if you may need it again.
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
    </div>
  );
}
