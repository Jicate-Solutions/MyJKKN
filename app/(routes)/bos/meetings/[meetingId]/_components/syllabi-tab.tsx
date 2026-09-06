'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edit2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SyllabusForm } from '@/components/bos/syllabus-form';
import { DataTable } from '@/components/data-table/data-table';
import type { DataFetchParams, DataFetchResult } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { BosSyllabusService } from '@/lib/services/bos/bos-syllabus-service';
import { createSyllabusColumns } from '@/app/(routes)/bos/syllabus/_components/columns';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import type { InstitutionOption } from '@/app/(routes)/bos/_components/institution-picker';
import type { ColumnDef } from '@tanstack/react-table';
import type { BosCourseSyllabus, BosMeetingStatus } from '@/types/bos';

interface SyllabusTabProps {
  meetingId: string;
  boardId?: string;
  regulationId?: string;
  /**
   * The composition this meeting belongs to. Used as the authoritative link
   * between meeting and syllabi: syllabus.composition_id === meeting.composition_id
   * is the implicit "composition → meeting → course syllabus" hierarchy. The
   * meeting_syllabi junction table exists in schema but isn't written by any
   * UI flow today, so filtering on it would exclude every real syllabus.
   */
  compositionId?: string | null;
  institutionsId: string;
  /**
   * Current meeting status. Used to gate the per-row Edit button: once the
   * meeting reaches `minutes_approved` or `ratified`, the discussed syllabi
   * have been auto-forked into V2 by the server's
   * forkSyllabiOnMinutesApproval helper, and V1 is now locked (see the
   * "Superseded by Version N" banner on SyllabusForm). Hiding the Edit button
   * from the tab prevents users from clicking into a read-only edit dialog
   * for V1 — they should be editing the new V2 via the main syllabus list.
   */
  meetingStatus?: BosMeetingStatus;
  /**
   * Kept for interface compatibility with the meeting detail page. Per-row
   * edit/delete/duplicate gating is enforced inside the shared row-actions
   * component (see app/(routes)/bos/syllabus/_components/row-actions.tsx),
   * so this prop is currently unused but kept to avoid an upstream change.
   */
  canEdit: boolean;
}

export function SyllabusTab({
  meetingId,
  boardId,
  regulationId,
  compositionId,
  institutionsId,
  meetingStatus,
}: SyllabusTabProps) {
  // Once minutes are approved (or the meeting is ratified), the syllabi
  // discussed during the meeting have been forked to V2 and the V1 rows shown
  // in this tab are now superseded read-only history. Hide the Edit button
  // entirely for those statuses to steer users toward the V2 in the main
  // syllabus list. They can still view + download V1 from the tab.
  const isSyllabusEditingFrozen =
    meetingStatus === 'minutes_approved' || meetingStatus === 'ratified';
  // Open-in-popup edit state. null = no dialog open. We keep the full syllabus
  // row in state (not just the id) so SyllabusForm can be seeded from cached
  // row data instantly without a second fetch round-trip.
  const [editSyllabus, setEditSyllabus] = useState<BosCourseSyllabus | null>(null);

  // The DataTable below fetches via fetchDataFn, so it never observes the
  // ['bos', 'syllabi'] query directly. This bridge re-fetches the table when
  // the edit form's mutation invalidates that key (see SYLLABI_QUERY_KEY in
  // hooks/bos/use-bos-syllabus.ts) — keeps the row in the meeting tab in sync
  // with the edit dialog's save, with no manual refresh needed.
  const refetchKey = useDataTableRefreshOnInvalidate(['bos', 'syllabi']);

  // Institution name powers the PDF/DOCX action buttons in the row, which use
  // it to build the per-institution letterhead. Same query key as the syllabus
  // list page → fully cached when the user navigated from there.
  const { data: institutions = [] } = useQuery<InstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) throw new Error('Failed to load institutions');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const institutionName = useMemo(
    () =>
      institutions.find(
        (i) =>
          i.id === institutionsId ||
          i.myjkkn_institution_ids.includes(institutionsId ?? ''),
      )?.name,
    [institutions, institutionsId],
  );

  // CAS / CET institution UUID sets, resolved via the COE institution_code =
  // MyJKKN counselling_code bridge — mirrors syllabus-data-table.tsx, which is
  // where the main /bos/syllabus list builds them.
  //
  // These MUST be forwarded to createSyllabusColumns: without them the row's
  // PDF button falls back to the course_code/stream heuristics in
  // buildSyllabusPdfData, which only recognise an Anna-University code shape
  // ("EC3354"). A CET course whose code starts with digits (the MBA set —
  // "26MBC02", "26MBC08") then silently rendered the Arts & Science table
  // layout instead of the Engineering one, dropping the per-unit hour markers
  // and the "TOTAL: N PERIODS" line that only the CET renderer prints.
  // Institution identity is the reliable signal; the code shape is not.
  const casInstitutionIds = useMemo(
    () =>
      new Set(
        institutions
          .filter((i) => (i.institution_code ?? '').toUpperCase() === 'CAS')
          .flatMap((i) => i.myjkkn_institution_ids),
      ),
    [institutions],
  );

  const cetInstitutionIds = useMemo(
    () =>
      new Set(
        institutions
          .filter((i) => (i.institution_code ?? '').toUpperCase() === 'CET')
          .flatMap((i) => i.myjkkn_institution_ids),
      ),
    [institutions],
  );

  // Augment the shared syllabus columns with a visible pencil-icon Edit button
  // ahead of the kebab menu. Edit is already available inside DataTableRowActions
  // on the main /bos/syllabus list page, but in the meeting-tab context users
  // expect a one-click affordance — burying it in the menu makes the most common
  // tab action (jump to a specific course syllabus) feel two clicks too deep.
  // We wrap, not modify, the shared factory so the main list stays unchanged.
  // The leading 'select' (checkbox) column is dropped here too — bulk-delete
  // isn't a meeting-tab workflow, so the checkboxes are visual noise. An S.No
  // column is prepended for at-a-glance row counting; it is per-page (resets
  // each page) since pagination is server-side via fetchDataFn.
  const columns = useMemo<ColumnDef<BosCourseSyllabus>[]>(() => {
    const serialColumn: ColumnDef<BosCourseSyllabus> = {
      id: 'serial',
      header: 'S.No',
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>{row.index + 1}</span>
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 60,
    };
    const base = createSyllabusColumns(
      institutionName,
      casInstitutionIds,
      cetInstitutionIds,
    ).filter((col) => col.id !== 'select');
    const augmented = base.map((col) => {
      if (col.id !== 'actions') return col;
      const originalCell = col.cell;
      return {
        ...col,
        cell: (ctx) => (
          <div className='flex items-center gap-1'>
            {/* Edit button hidden once minutes are approved or the meeting is
                ratified — at those statuses V1 is locked and V2 (auto-forked
                on minutes approval) is where edits should land. */}
            {!isSyllabusEditingFrozen && (
              <Button
                size='icon'
                variant='ghost'
                className='h-8 w-8'
                aria-label='Edit syllabus'
                title='Edit syllabus'
                onClick={() => setEditSyllabus(ctx.row.original)}
              >
                <Edit2 className='h-4 w-4' />
              </Button>
            )}
            {typeof originalCell === 'function' ? originalCell(ctx) : null}
          </div>
        ),
        // The original column had size: 120 — extend to fit the new icon
        // when Edit is visible; shrink back when it's hidden (post-approval).
        size: isSyllabusEditingFrozen ? 120 : 160,
      };
    });
    return [serialColumn, ...augmented];
  }, [institutionName, casInstitutionIds, cetInstitutionIds, isSyllabusEditingFrozen]);

  // The /api/bos/syllabus endpoint accepts boardId, regulationId, institutionsId,
  // search — but NOT compositionId. We pull a large page (composition course
  // counts are bounded; >500 in one regulation would be unusual) and then
  // client-filter to the meeting's composition before re-paginating for the
  // DataTable. If composition course counts ever exceed this, add compositionId
  // as a real query param to the API instead of bumping this limit.
  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }) => {
      try {
        const { data } = await BosSyllabusService.getSyllabi({
          page: 1,
          limit: 500,
          search: params.search,
          boardId,
          regulationId,
          isLatest: true,
          institutionsId,
        });

        const allRows = data ?? [];
        const filtered = compositionId
          ? allRows.filter((s) => s.composition_id === compositionId)
          : allRows;

        const start = (params.page - 1) * params.limit;
        const paged = filtered.slice(start, start + params.limit);

        return {
          success: true,
          data: paged,
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: Math.max(1, Math.ceil(filtered.length / params.limit)),
            total_items: filtered.length,
          },
        };
      } catch (error) {
        console.error('Failed to fetch syllabi for meeting:', error);
        return {
          success: false,
          data: [],
          pagination: { page: 1, limit: 20, total_pages: 0, total_items: 0 },
        };
      }
    },
    [boardId, regulationId, compositionId, institutionsId],
  );

  return (
    <>
      {/* DataTable's generic constrains rows to ExportableData (a flat
          Record<string, primitive>). BosCourseSyllabus is a nested interface,
          so TS clamps TData to ExportableData and the BosCourseSyllabus-typed
          columns/fetchData no longer line up. The values are genuinely typed
          for BosCourseSyllabus rows (and unchanged at runtime — casts erase),
          so we bridge to the clamped ExportableData shape. This is the same
          latent mismatch the main /bos/syllabus list carries; here it surfaces
          because this file is type-checked in isolation. */}
      <DataTable
        fetchDataFn={
          fetchData as unknown as (
            params: DataFetchParams,
          ) => Promise<DataFetchResult<ExportableData>>
        }
        getColumns={() => columns as unknown as ColumnDef<ExportableData>[]}
        idField='id'
        refetchKey={refetchKey}
        config={{
          // Tabbed view: disable URL state so the meeting page's other tabs
          // (Agenda, Attendance, Documents) aren't fighting over query params.
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: false,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: `bos-meeting-${meetingId}-syllabi-table`,
        }}
      />

      {/* ── Edit Syllabus Popup ────────────────────────────────────────
          Re-uses the shared SyllabusForm in edit mode so users can update a
          syllabus without leaving the meeting page. The form's own permission
          guard decides whether saves are allowed — viewers without edit rights
          still see the data but the server will reject the PUT (we translate
          that to a friendly toast inside bos-syllabus-service.ts). */}
      <Dialog open={!!editSyllabus} onOpenChange={(v) => { if (!v) setEditSyllabus(null); }}>
        <DialogContent
          className='max-w-6xl max-h-[90vh] overflow-y-auto'
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>
              {editSyllabus
                ? `${editSyllabus.course_code} — ${editSyllabus.course_name}`
                : 'Edit Syllabus'}
            </DialogTitle>
            {editSyllabus && (
              <DialogDescription>
                Version {editSyllabus.version_number}
                {editSyllabus.is_latest ? ' (latest)' : ''}
              </DialogDescription>
            )}
          </DialogHeader>
          {editSyllabus && (
            <SyllabusForm
              syllabus={editSyllabus}
              isEditing={true}
              onSuccess={() => setEditSyllabus(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
