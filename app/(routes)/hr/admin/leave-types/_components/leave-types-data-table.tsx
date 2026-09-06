'use client';

// HR Leave Types — advanced DataTable wrapper (2026-07-23).
//
// Adapts HRLeaveTypeService.list (returns a plain array) to the DataTable's
// fetchDataFn contract. The three filters the service understands are pushed
// down to Postgres; the rest, plus sorting and pagination, are applied here in
// memory. That is deliberate: one HR org's leave catalog is a handful of rows,
// so paging it server-side would mean a new API route and a service rewrite for
// no measurable gain. If a single org ever grows past a few hundred types, move
// the predicates into HRLeaveTypeFilters and page in the query instead.
//
// NOTE: DataTable does NOT read through React Query — it owns its own state and
// calls fetchDataFn directly (data-table.tsx:549). Mutations that invalidate
// ['hr-leave-types'] are therefore invisible to it, hence the refetchKey bridge.

import { useCallback, useMemo, useState } from 'react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRLeaveTypeService } from '@/lib/services/hr/leave-type-service';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useLeaveApprovalFlowCoverage } from '@/hooks/hr/use-leave-approval-flows';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import {
  REQUEST_CATEGORY_LABELS,
  type HRLeaveType,
  type HRLeaveTypeFilters,
} from '@/types/hr-leave-types';

import { getLeaveTypeColumns } from './leave-type-columns';
import { LeaveTypeRowActions } from './leave-type-row-actions';
import type { HRLeaveTypeDeleteResult } from '@/lib/services/hr/leave-type-service';
import type { LeaveTypeFilterState, TriState } from './leave-type-filters';

interface LeaveTypesDataTableProps {
  filters: LeaveTypeFilterState;
  canManage: boolean;
  onAdd: () => void;
  onView: (t: HRLeaveType) => void;
  onEdit: (t: HRLeaveType) => void;
  onAssign: (t: HRLeaveType) => void;
  /** Opens the approval-chain editor for this type. */
  onApprovalFlow: (t: HRLeaveType) => void;
  /** Asks the page to open its archive confirmation. */
  onArchive: (t: HRLeaveType) => void;
  onActivate: (t: HRLeaveType) => Promise<void> | void;
  /** Asks the page to open its delete confirmation. */
  onDelete: (t: HRLeaveType) => void;
  /**
   * Bumped by the page after a save or archive. Needed in addition to the
   * invalidate bridge below: that bridge listens for cache events, which only
   * fire for queries that ACTUALLY EXIST in the cache. This page no longer
   * mounts useHRLeaveTypes, so on a cold load there is no ['hr-leave-types']
   * query to invalidate and no event would ever arrive.
   */
  refreshToken: number;
}

/** `all` passes everything through; otherwise the row's flag must match. */
function matchesTriState(value: boolean, filter: TriState): boolean {
  if (filter === 'all') return true;
  return filter === 'yes' ? value : !value;
}

export function LeaveTypesDataTable({
  filters,
  canManage,
  onAdd,
  onView,
  onEdit,
  onAssign,
  onApprovalFlow,
  onArchive,
  onActivate,
  onDelete,
  refreshToken,
}: LeaveTypesDataTableProps) {
  // Both counters only ever increase, so their sum is a valid monotonic key.
  // One fetch for the Approval column — 22 flows group-wide, versus a query
  // per visible row if the cell resolved it itself.
  const { data: flowCoverage } = useLeaveApprovalFlowCoverage();

  const invalidateKey = useDataTableRefreshOnInvalidate(['hr-leave-types']);
  const refetchKey = invalidateKey + refreshToken;

  // Shares the ['hr-org-mappings'] query the page and filters already hold —
  // React Query dedupes it, so the Institution column costs no extra request.
  const { orgNameById } = useHrOrgMappings();

  const columns = useMemo(
    () => getLeaveTypeColumns({ canManage, onView, onAssign, onEdit, onApprovalFlow, onArchive, onActivate, onDelete, orgNameById, flowCoverage }),
    [canManage, onView, onAssign, onEdit, onApprovalFlow, onArchive, onActivate, onDelete, orgNameById, flowCoverage]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const supabase = createClientSupabaseClient();

      // Pushed down to Postgres. `undefined` (not '' / null) so the service's
      // `!= null` guards skip the predicate entirely — an empty string would be
      // sent as a real uuid parameter and match zero rows.
      const serviceFilters: HRLeaveTypeFilters = {
        hr_organization_id: filters.hrOrgId || undefined,
        request_category:
          filters.requestCategory === 'all' ? undefined : filters.requestCategory,
        is_active:
          filters.status === 'all' ? undefined : filters.status === 'active',
        search: params.search || undefined,
      };

      const rows = await HRLeaveTypeService.list(supabase, serviceFilters);

      // Applied in memory — the service has no predicate for these columns.
      const filtered = rows.filter(
        (t) =>
          (filters.durationType === 'all' || t.duration_type === filters.durationType) &&
          (filters.gender === 'all' || t.applicable_gender === filters.gender) &&
          matchesTriState(t.is_paid, filters.isPaid) &&
          matchesTriState(t.allow_carry_forward, filters.carryForward) &&
          matchesTriState(t.is_encashable, filters.encashable) &&
          matchesTriState(t.requires_approval, filters.requiresApproval) &&
          matchesTriState(t.requires_documents, filters.requiresDocuments)
      );

      // The service's own ORDER BY (display_order, name) is the default; a
      // column header click overrides it.
      const sortBy = params.sort_by;
      if (sortBy && sortBy !== 'created_at') {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          // Institution sorts by its RESOLVED NAME. The stored value is a uuid,
          // and ordering the column the user sees by a hidden uuid looks random.
          const av =
            sortBy === 'hr_organization_id'
              ? orgNameById.get(a.hr_organization_id) ?? ''
              : a[sortBy as keyof HRLeaveType];
          const bv =
            sortBy === 'hr_organization_id'
              ? orgNameById.get(b.hr_organization_id) ?? ''
              : b[sortBy as keyof HRLeaveType];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing a filter while on
      // page 3 would otherwise render a blank table with no way back except the
      // pager. Clamping shows the last real page instead.
      const limit = params.limit || 10;
      const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
      const safePage = Math.min(Math.max(1, params.page || 1), totalPages);
      const start = (safePage - 1) * limit;

      return {
        success: true,
        data: filtered.slice(start, start + limit),
        pagination: {
          page: safePage,
          limit,
          total_pages: totalPages,
          total_items: filtered.length,
        },
      };
    },
    [filters, orgNameById]
  );

  // Mobile keeps the card layout the page used before the table landed — a
  // 10-column table is unusable under 768 px.
  const renderMobileRow = useCallback(
    (t: HRLeaveType) => (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          {/* Tappable like the table's Leave Type cell, so the detail modal is
              reachable the same way on both breakpoints. */}
          <button
            type="button"
            onClick={() => onView(t)}
            className="min-w-0 text-left"
            title={`View ${t.leave_type_name} details`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full border"
                style={{ background: t.color_code }}
                aria-hidden
              />
              <span className="truncate underline-offset-4 hover:underline">
                {t.leave_type_name}
              </span>
            </span>
            <span className="block font-mono text-xs text-muted-foreground">
              {t.leave_type_code}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {!t.is_active && <Badge variant="secondary">Archived</Badge>}
            {canManage && (
              // Same menu the table uses, so Archive goes through one
              // confirmation path on every breakpoint.
              <LeaveTypeRowActions
                leaveType={t}
                onView={onView}
                onAssign={onAssign}
                onEdit={onEdit}
                onApprovalFlow={onApprovalFlow}
                onArchive={onArchive}
                onActivate={onActivate}
                onDelete={onDelete}
              />
            )}
          </div>
        </div>
        {/* Matches the table's Institution column — with the org filter on
            "All organizations" the card is otherwise ambiguous. */}
        {orgNameById.get(t.hr_organization_id) && (
          <p className="truncate text-xs text-muted-foreground">
            {orgNameById.get(t.hr_organization_id)}
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">
            {REQUEST_CATEGORY_LABELS[t.request_category] ?? t.request_category}
          </Badge>
          {t.request_category !== 'short_time_off' && (
            <Badge variant="outline">{t.default_entitled_days} days</Badge>
          )}
          <Badge variant="outline">
            {LEAVE_DURATION_LABELS[t.duration_type] ?? t.duration_type}
          </Badge>
          {t.is_paid && <Badge variant="outline">Paid</Badge>}
          {t.allow_carry_forward && <Badge variant="outline">Carry-forward</Badge>}
          {t.is_encashable && <Badge variant="outline">Encashable</Badge>}
          {t.applicable_gender !== 'all' && (
            <Badge variant="outline">{t.applicable_gender}</Badge>
          )}
        </div>
      </div>
    ),
    [canManage, onView, onAssign, onEdit, onArchive, onActivate, onDelete, orgNameById, flowCoverage]
  );

  const renderToolbarContent = useCallback(
    () =>
      canManage ? (
        <Button
          size="sm"
          className="h-8"
          disabled={!filters.hrOrgId}
          title={
            filters.hrOrgId
              ? undefined
              : 'Pick an organization first — leave types are scoped per organization'
          }
          onClick={onAdd}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Leave Type
        </Button>
      ) : null,
    [canManage, filters.hrOrgId, onAdd]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      renderToolbarContent={renderToolbarContent}
      idField="id"
      exportConfig={{
        entityName: 'hr-leave-types',
        columnMapping: {
          leave_type_code: 'Code',
          leave_type_name: 'Leave Type',
          hr_organization_id: 'Institution',
          request_category: 'Category',
          default_entitled_days: 'Entitled Days',
          duration_type: 'Duration',
          applicable_gender: 'Applies To',
          is_paid: 'Paid',
          allow_carry_forward: 'Carry Forward',
          is_encashable: 'Encashable',
          requires_approval: 'Requires Approval',
          requires_documents: 'Requires Documents',
          display_order: 'Order',
          is_active: 'Active',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: true,
        enableSearch: true,
        searchPlaceholder: 'Search by name or code…',
        enableDateFilter: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        enableRowSelection: true,
        enableExport: true,
        columnResizingTableId: 'hr-leave-types-table',
      }}
      refetchKey={refetchKey}
    />
  );
}
