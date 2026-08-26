'use client';

// HR Leave Types — admin catalog.
//
// 2026-07-23: the two-column card grid became an advanced DataTable
// (components/data-table). The grid rendered every type as a badge cluster
// with no sorting, no column control, no selection and no export, which stopped
// scaling once an organization defined more than a handful of types. The card
// layout survives as the DataTable's mobile renderer.

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import {
  useDeleteHRLeaveType,
  useRestoreHRLeaveType,
  useHardDeleteHRLeaveType,
} from '@/hooks/hr/use-hr-leave-types';
import { LeaveTypeFormDialog } from './_components/leave-type-form-dialog';
import { AssignmentManagerDialog } from './_components/assignment-manager-dialog';
import { LeaveApprovalFlowDialog } from './_components/leave-approval-flow-dialog';
import {
  LeaveTypeFilters,
  DEFAULT_LEAVE_TYPE_FILTERS,
  type LeaveTypeFilterState,
} from './_components/leave-type-filters';
import { LeaveTypesDataTable } from './_components/leave-types-data-table';
import { LeaveTypeDetailDialog } from './_components/leave-type-detail-dialog';
import type { HRLeaveType } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

export default function HRLeaveTypesPage() {
  const { mappings, institutionIdByOrg } = useHrOrgMappings();
  const [filters, setFilters] = useState<LeaveTypeFilterState>(DEFAULT_LEAVE_TYPE_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<HRLeaveType | null>(null);
  const [editing, setEditing] = useState<HRLeaveType | null>(null);
  // `detailFor` is intentionally NOT cleared when the modal closes — the dialog
  // needs a row to render while its exit transition plays. `detailOpen` owns
  // visibility; the next open overwrites the row.
  const [detailFor, setDetailFor] = useState<HRLeaveType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Same open/row split as the detail modal above, for the same reason: the
  // dialog needs a row to render while its exit transition plays.
  const [flowFor, setFlowFor] = useState<HRLeaveType | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);

  // Tells the DataTable to re-run fetchDataFn after a mutation. See the prop's
  // doc comment on LeaveTypesDataTable for why invalidateQueries is not enough.
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  // The staff and department pickers query by institution, not by HR org;
  // the mapping is 1:1 and resolved here rather than in each picker.
  const institutionId = assignFor
    ? institutionIdByOrg.get(assignFor.hr_organization_id)
    : undefined;

  const archive = useDeleteHRLeaveType();
  const restore = useRestoreHRLeaveType();
  const hardDelete = useHardDeleteHRLeaveType();

  const handleFilterChange = useCallback((patch: Partial<LeaveTypeFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleFilterReset = useCallback(
    () => setFilters(DEFAULT_LEAVE_TYPE_FILTERS),
    []
  );

  const handleAdd = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((t: HRLeaveType) => {
    setEditing(t);
    setDialogOpen(true);
  }, []);

  const handleAssign = useCallback((t: HRLeaveType) => setAssignFor(t), []);

  const handleView = useCallback((t: HRLeaveType) => {
    setDetailFor(t);
    setDetailOpen(true);
  }, []);

  const handleApprovalFlow = useCallback((t: HRLeaveType) => {
    setFlowFor(t);
    setFlowOpen(true);
  }, []);

  const handleArchive = useCallback(
    async (t: HRLeaveType) => {
      try {
        await archive.mutateAsync(t.id);
        toast.success(`${t.leave_type_name} archived`);
        bumpRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [archive, bumpRefresh]
  );

  const handleActivate = useCallback(
    async (t: HRLeaveType) => {
      try {
        await restore.mutateAsync(t.id);
        toast.success(`${t.leave_type_name} is active again`);
        bumpRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [restore, bumpRefresh]
  );

  /**
   * Dry run. Throws on a transport failure so the dialog can show its own
   * "could not check" state — a destructive dialog that cannot verify must not
   * fall through to offering the button.
   */
  const handleCheckDelete = useCallback(
    async (t: HRLeaveType) => {
      try {
        return await hardDelete.mutateAsync({ id: t.id, dryRun: true });
      } catch (err) {
        toast.error(getErrorMessage(err));
        throw err;
      }
    },
    [hardDelete]
  );

  const handleDelete = useCallback(
    async (t: HRLeaveType) => {
      try {
        const result = await hardDelete.mutateAsync({ id: t.id, dryRun: false });
        // The RPC reports refusal in its payload, not as an error — a row that
        // gained an application between the check and the commit lands here,
        // and must not be announced as a success.
        if (!result?.ok) {
          toast.error(result?.message ?? result?.error ?? 'Could not delete this leave type');
          return;
        }
        toast.success(`${t.leave_type_name} deleted`);
        bumpRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [hardDelete, bumpRefresh]
  );

  return (
    <PermissionGuard module="hr.leave.types" action="manage">
      <ContentLayout title="HR Leave Types">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/admin">Admin</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Leave Types</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mt-4">
          <CardContent className="space-y-4 p-6">
            <LeaveTypeFilters
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleFilterReset}
              organizations={mappings}
            />

            {!filters.hrOrgId && (
              <p className="text-sm text-muted-foreground">
                Showing every organization. Select one to add a leave type — types are
                scoped per organization.
              </p>
            )}

            <LeaveTypesDataTable
              filters={filters}
              // The whole page is behind PermissionGuard hr.leave.types/manage,
              // so anyone who can see this can manage it.
              canManage
              onAdd={handleAdd}
              onView={handleView}
              onEdit={handleEdit}
              onAssign={handleAssign}
              onApprovalFlow={handleApprovalFlow}
              onArchive={handleArchive}
              onActivate={handleActivate}
              onCheckDelete={handleCheckDelete}
              onDelete={handleDelete}
              refreshToken={refreshToken}
            />
          </CardContent>
        </Card>

        <LeaveTypeDetailDialog
          leaveType={detailFor}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          canManage
          onEdit={handleEdit}
          onAssign={handleAssign}
        />

        <LeaveTypeFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          hrOrgId={filters.hrOrgId}
          leaveType={editing}
          onSaved={bumpRefresh}
        />

        <AssignmentManagerDialog
          open={!!assignFor}
          onOpenChange={(v) => { if (!v) setAssignFor(null); }}
          leaveType={assignFor}
          institutionId={institutionId}
        />

        <LeaveApprovalFlowDialog
          leaveType={flowFor}
          open={flowOpen}
          onOpenChange={setFlowOpen}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
