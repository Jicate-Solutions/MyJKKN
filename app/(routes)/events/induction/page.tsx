'use client';

// Induction — list of inductions (RLS-scoped), as a table.
//
// Creation goes through the events module's flow: the "Create induction" button
// opens the dedicated creator (/events/induction/new), which the /events/create
// wizard also routes to for format='induction'. No bespoke create dialog here.
//
// WAS a card grid plus an "Induction Coordinators" panel. Both changed on
// 2026-08-18:
//
//   • The cards became a DataTable with per-row actions (view / edit / change
//     status / delete), each gated separately — see induction-row-actions.tsx
//     for which gate covers which action and why — plus multi-select bulk delete
//     and an advanced Filters panel.
//
//     Change Status is the only way to activate an induction anywhere in the
//     app: fn_induction_create_program hardcodes 'draft' and, until 2026-08-18,
//     nothing ever wrote another value — the detail console renders the badge
//     but cannot change it.
//
//     Coordinators are NOT a column: they are loaded, searchable, and filterable
//     (College / Status / Coordinator / Staffing / Timing), which is how people
//     actually use that data. Reading a full roster belongs on the induction's
//     own console, where it is also edited.
//
//   • The coordinators panel is GONE. It appointed a college-wide
//     'induction_coordinator' role (a row in user_roles carrying
//     induction.manage over every induction that college runs), while its
//     per-college grouping made it look like a per-college appointment. That is
//     why the same names appeared both here and inside an individual induction:
//     two independent grants, no sync between them. Coordinators are now
//     appointed in one place only — the Coordinators section of each
//     induction's own console — and this page reads those appointments back.
//     See 20260818091000_induction_retire_collegewide_coordinator_role.sql.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Library, Plus, Rocket, Trash2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBulkDeleteInductions,
  useInductions,
  useUpdateInductionStatus,
} from '@/hooks/events/use-inductions';
import { useDeleteEvent } from '@/hooks/events/use-general-events';
import { getErrorMessage } from '@/lib/utils';
import type { EventStatus } from '@/types/events';
import type { InductionListRow } from '@/lib/services/induction/induction-service';
import { getInductionColumns } from './_components/induction-columns';
import { EditInductionDialog } from './_components/edit-induction-dialog';
import {
  countActiveInductionFilters,
  EMPTY_INDUCTION_FILTERS,
  InductionFiltersPanel,
  inductionMatchesFilters,
  type InductionAdvancedFilters,
} from './_components/induction-filters-panel';

/**
 * DataTable search. Required, not optional polish: the table renders a search
 * box only when a globalFilterFn (or onSearch) is passed — the fallback is a
 * single-column filter defaulting to `email`, which this table has no column
 * for, so without this the placeholder would be ignored and no input would
 * appear at all.
 *
 * Matches on the three things someone actually types: the induction's name, its
 * college, and a coordinator's name.
 */
const inductionGlobalFilter = (
  row: { original: InductionListRow },
  _columnId: string,
  value: string
) => {
  const needle = value.toLowerCase();
  const r = row.original;
  return (
    r.name.toLowerCase().includes(needle) ||
    (r.institution_name ?? '').toLowerCase().includes(needle) ||
    r.coordinators.some((c) => c.full_name.toLowerCase().includes(needle))
  );
};

export default function InductionLandingPage() {
  const { data: rows, isLoading, error, refetch } = useInductions();

  // Ownership is per row, but the viewer is not — resolve them once here and
  // pass down, rather than calling the hooks inside every row's actions.
  // Two hooks on purpose: useAuth() carries only { profile, isLoading, error },
  // and the super-admin flag comes from usePermissions(). `profile.id` IS the
  // auth uid (profiles.id = auth.uid() is an invariant here), so it is the right
  // value to compare against events.created_by.
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const viewer = useMemo(
    () => ({
      userId: profile?.id,
      institutionId: profile?.institution_id,
      isSuperAdmin,
    }),
    [profile?.id, profile?.institution_id, isSuperAdmin]
  );

  const [editing, setEditing] = useState<InductionListRow | null>(null);
  const deleteEvent = useDeleteEvent();

  const updateStatus = useUpdateInductionStatus();

  const handleEdit = useCallback((induction: InductionListRow) => setEditing(induction), []);
  const handleDelete = useCallback((id: string) => deleteEvent.mutate(id), [deleteEvent]);
  const handleStatusChange = useCallback(
    (id: string, status: EventStatus) => updateStatus.mutate({ id, status }),
    [updateStatus]
  );

  // Each mutation's own isPending is table-wide; pairing it with the id in
  // flight keeps the spinner on the row that was clicked.
  const deletingId = deleteEvent.isPending ? (deleteEvent.variables ?? null) : null;
  const statusUpdatingId = updateStatus.isPending
    ? (updateStatus.variables?.id ?? null)
    : null;

  const columns = useMemo(
    () =>
      getInductionColumns({
        viewer,
        onEdit: handleEdit,
        onStatusChange: handleStatusChange,
        onDelete: handleDelete,
        deletingId,
        statusUpdatingId,
      }),
    [viewer, handleEdit, handleStatusChange, handleDelete, deletingId, statusUpdatingId]
  );

  // ── Advanced filters ────────────────────────────────────────────────────────
  // Applied here rather than inside the table so the panel and the predicate
  // stay in one file (inductionMatchesFilters) and the DataTable keeps receiving
  // a plain array. `today` is resolved once per pass so a list being judged as
  // it crosses midnight is judged against a single day.
  const [filters, setFilters] = useState<InductionAdvancedFilters>(EMPTY_INDUCTION_FILTERS);
  const visibleRows = useMemo(() => {
    const all = rows ?? [];
    if (countActiveInductionFilters(filters) === 0) return all;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return all.filter((r) => inductionMatchesFilters(r, filters, today));
  }, [rows, filters]);

  // ── Multi-select bulk delete ────────────────────────────────────────────────
  // The selection checkboxes only exist because onBulkAction is passed, and the
  // DataTable gates them on the `permissions` prop below — so a viewer without
  // events.delete gets no checkbox column at all rather than a selection that
  // leads nowhere.
  const bulkDelete = useBulkDeleteInductions();
  const canDelete = canAccess('events', 'delete');
  const canCreate = canAccess('induction', 'create');

  const handleBulkDelete = useCallback(
    async (selected: InductionListRow[]) => {
      if (selected.length === 0) return;
      const { deleted, refused } = await bulkDelete(selected);

      // THROW ON PARTIAL FAILURE, on purpose. The DataTable shows its generic
      // "Successfully processed N items" toast whenever this resolves — which
      // would be a lie the moment one row was refused, and refusal is the normal
      // case here (any induction with enrolled learners is blocked in the DB).
      // Throwing routes the outcome to its error toast instead, where the real
      // breakdown can be read.
      if (refused.length > 0) {
        const led = refused
          .slice(0, 3)
          .map((r) => `${r.name} — ${r.reason}`)
          .join('\n');
        const more = refused.length > 3 ? `\n…and ${refused.length - 3} more.` : '';
        throw new Error(
          `${deleted.length} deleted, ${refused.length} refused:\n${led}${more}`
        );
      }
    },
    [bulkDelete]
  );

  return (
    <ContentLayout title="Induction">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Induction' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
              <Rocket className="h-6 w-6 text-primary" /> Fresher Induction
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Run each college&apos;s induction as a guided program. Create one, auto-enroll
              this year&apos;s freshers, and split them into batches — then track who completes
              and who turns into a referral that joins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/events/induction/catalog">
                <Library className="h-4 w-4 mr-1" /> Session catalog
              </Link>
            </Button>
            {/* Create is Induction Lead + super admin only (2026-08-21). This
                button was previously ungated, so all 654 induction.manage holders
                saw it — including 493 Facilitators. The real refusal is
                fn_induction_create_program, which now gates on induction.create;
                this only stops offering a button the RPC would reject. */}
            {canCreate && (
              <Button asChild>
                <Link href="/events/induction/new">
                  <Plus className="h-4 w-4 mr-1" /> Create induction
                </Link>
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Couldn&apos;t load inductions</CardTitle>
              <CardDescription>{getErrorMessage(error)}</CardDescription>
            </CardHeader>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading inductions…</p>
        ) : (rows?.length ?? 0) === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No inductions yet</CardTitle>
              <CardDescription>
                Create the first one. After that, other colleges can copy it as a starting point.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <DataTable
            columns={columns}
            data={visibleRows}
            searchPlaceholder="Search inductions, colleges or coordinators…"
            globalFilterFn={inductionGlobalFilter}
            getRowId={(row) => row.id}
            onRefresh={() => refetch()}
            tableTools={
              <InductionFiltersPanel
                // Options come from the UNFILTERED list. Deriving them from
                // visibleRows would make each choice erase the others — pick a
                // college and the College dropdown would collapse to that one
                // value, with no way back except Clear all.
                inductions={rows ?? []}
                value={filters}
                onChange={setFilters}
              />
            }
            // Passing onBulkAction is what makes the DataTable inject the
            // selection checkbox column at all.
            onBulkAction={handleBulkDelete}
            // The bulk gate is checked against `edit` when onBulkAction is used,
            // and `events.edit` is not a key in the catalog — so the explicit
            // boolean is the only way to gate this on the key that actually
            // governs the write. `view` is left unset so the table itself stays
            // visible to everyone who can reach the page.
            permissions={{ module: 'events', actions: { edit: canDelete } }}
            bulkActionConfig={{
              label: 'Delete',
              icon: Trash2,
              variant: 'destructive',
              confirmTitle: 'Delete the selected inductions?',
              confirmDescription:
                'Any induction that has enrolled learners will be refused by the database — its batches, attendance, feedback and completion records cannot be recovered. Only empty inductions will be removed, and you will be told exactly which ones were not.',
              successMessage: '{count} induction{plural} deleted',
              loadingText: 'Deleting…',
            }}
          />
        )}
      </div>

      <EditInductionDialog
        induction={editing}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </ContentLayout>
  );
}
