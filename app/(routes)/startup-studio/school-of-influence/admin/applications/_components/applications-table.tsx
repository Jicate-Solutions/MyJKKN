'use client';

// School of Influence — the review queue as an advanced data table (2026-08-17).
//
// Replaces the one-card-per-applicant list that came before. That list was
// honest but unreadable at volume: each applicant occupied most of a screen, so
// comparing two people meant scrolling between them, and there was no way to
// sort by when somebody applied or to export the queue at all.
//
// WHAT THIS OWNS AND WHAT IT DOES NOT
//   Owns:     fetching the application rows, flattening them, the columns.
//   Does NOT: any decision. Accept and Turn down are handed straight back to the
//             workspace, which keeps the batch resolution, the over-capacity
//             confirmation (A3/A7) and the rejection-reason dialog exactly where
//             they were. Nothing about who may decide what moved into this file.
//
// ── WHY THE ROWS ARE FLATTENED ───────────────────────────────────────────────
// DataTable is `TData extends ExportableData`, i.e. a flat record of primitives.
// SoiApplicationRow is not one: `answers` is an array of {key,label,value} and
// `audiences` is an array. Flattening is therefore forced by the table — but it
// is also what makes each answer a REAL column: sortable, searchable, and
// exportable, which a nested array could never be.
//
// Answer keys are namespaced `answer.<key>` so a form field called `status` or
// `decision` can never collide with one of this table's own columns. The union
// of keys is taken across every fetched row, not from the first one: a form that
// gained a question mid-intake leaves earlier applicants without that key, and
// reading only row 0 would drop the column for everybody.
//
// ── THE EXPORT CONTRACT ──────────────────────────────────────────────────────
// exportConfig.headers must hold DATA KEYS, not display labels — buildExcelRows
// does `if (key in transformedItem)`, so a label there matches nothing and
// writes a file with zero columns while still reporting success. columnMapping
// is where the human-readable names go. Both are built from the same key list
// below so they cannot drift apart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Eye, EyeOff, Loader2, UserCheck, XCircle } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SoiReviewService,
  type SoiApplicationRow,
  type SoiReviewBatch,
  type SoiReviewScope,
} from '@/lib/services/school-of-influence/review-service';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';

/** Namespace for a flattened answer column. See the file header. */
const ANSWER_PREFIX = 'answer.';

/**
 * One applicant, flat. The index signature is what satisfies ExportableData;
 * the named fields are the ones the columns below actually reference.
 */
export interface SoiApplicationTableRow {
  [key: string]: string | number | boolean | null | undefined;
  application_id: string;
  applicant_name: string;
  applicant_email: string;
  institution_name: string;
  audience_label: string;
  requested_batch: string;
  status_label: string;
  submitted_at: string;
  decision_label: string;
  decision_reason: string;
  decided_by: string;
  /** Drives whether the row offers a decision at all. Never exported. */
  is_awaiting: boolean;
}

/**
 * The stored token is 'learner' / 'staff'; the words on screen are JKKN's own
 * vocabulary for the same two groups. An unrecognised token is shown as-is
 * rather than guessed at — a reviewer should see what is on the record.
 * Exported for the waiting-list card in applications-workspace.tsx, so the
 * vocabulary has ONE definition.
 */
export function audienceLabel(token: string): string {
  if (token === 'learner') return 'Learner';
  if (token === 'staff') return 'Team member';
  return token;
}

/** Render one stored answer without pretending to know its shape. */
function answerText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Split into two short lines rather than one long one. "Aug 14, 2026, 10:31 am"
 * needs ~190px on a row where the applicant's name needs the space more, and at
 * anything narrower it truncated to "Aug 14, 2026, …" — which hides the time
 * while still spending the width on it.
 */
export function whenParts(iso: string | null): { day: string; time: string } {
  if (!iso) return { day: '—', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso, time: '' };
  return {
    day: d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/** SoiApplicationRow → the flat shape the table and the exporter both need. */
function flatten(row: SoiApplicationRow): SoiApplicationTableRow {
  const flat: SoiApplicationTableRow = {
    application_id: row.application_id,
    applicant_name: row.applicant_name ?? 'Unnamed applicant',
    applicant_email: row.applicant_email ?? '',
    institution_name: row.institution_name ?? '',
    // Nearly always one; joined rather than truncated so a person who is both a
    // learner and a team member does not silently read as only one of them.
    audience_label: (row.audiences ?? []).map(audienceLabel).join(', '),
    requested_batch: row.requested_batch_name ? soiDisplayName(row.requested_batch_name) : '',
    status_label: SoiReviewService.labelFor(row.application_status),
    submitted_at: row.submitted_at,
    decision_label:
      row.decision === 'accepted'
        ? 'Accepted'
        : row.decision === 'rejected'
          ? 'Not accepted'
          : '',
    decision_reason: row.decision_reason ?? '',
    decided_by: row.decided_by_name ?? '',
    is_awaiting: SoiReviewService.isAwaitingReview(row.application_status),
  };

  for (const answer of row.answers ?? []) {
    flat[`${ANSWER_PREFIX}${answer.key}`] = answerText(answer.value);
  }

  return flat;
}

interface Props {
  eventId: string;
  scope: SoiReviewScope;
  batches: SoiReviewBatch[];
  /** soi.batch_choice_mode === 'staff_assign' — the reviewer names the batch. */
  reviewerPicksBatch: boolean;
  /** applicationId → the batch the reviewer picked. Owned by the workspace. */
  chosenBatch: Record<string, string>;
  onChooseBatch: (applicationId: string, cohortId: string) => void;
  busyId: string | null;
  /** Both hand the ORIGINAL row back, because the workspace's decision logic
   *  needs requested_batch_id and the raw status, which the flat row drops. */
  onAccept: (row: SoiApplicationRow) => void;
  onReject: (row: SoiApplicationRow) => void;
  /** Bump to force a refetch after a decision lands. */
  refetchKey: number;
  /** A 403 from the RPC is an access refusal, not a failed fetch (rule 27). */
  onDenied: (message: string) => void;
  onError: (message: string) => void;
}

export function ApplicationsTable({
  eventId,
  scope,
  batches,
  reviewerPicksBatch,
  chosenBatch,
  onChooseBatch,
  busyId,
  onAccept,
  onReject,
  refetchKey,
  onDenied,
  onError,
}: Props) {
  /**
   * The answer columns discovered in the last fetch, as {key,label}. Set from
   * inside fetchData — which is safe precisely because fetchData's identity does
   * not depend on it: DataTable lists fetchDataFn in its fetch effect's
   * dependencies, so a fetchData that changed whenever this state changed would
   * refetch forever. getColumns has no such constraint (it feeds a useMemo).
   */
  const [answerColumns, setAnswerColumns] = useState<
    Array<{ key: string; label: string }>
  >([]);

  /**
   * The unflattened rows, kept so a decision can be handed back whole. Keyed by
   * application_id because that is the only identifier the flat row carries.
   */
  const [originals, setOriginals] = useState<Record<string, SoiApplicationRow>>({});

  /**
   * Whether the form-answer columns are shown. OFF by default — see the comment
   * on the answer loop in getColumns. Deliberately a plain toggle rather than
   * the View menu's per-column checkboxes: the answers arrive as ONE group
   * whose members are not known until the fetch, so turning them on and off
   * one at a time is busywork, and DataTable's columnVisibility has no way to
   * be seeded with them pre-hidden anyway.
   */
  const [showAnswers, setShowAnswers] = useState(false);

  /**
   * The error reporters, held in a ref so fetchData can call them WITHOUT
   * listing them as dependencies.
   *
   * This is not tidiness — it is the difference between working and hanging.
   * DataTable puts fetchDataFn in its fetch effect's dependency array, so if
   * fetchData's identity changed on every render the table would refetch on
   * every render, forever. A parent that passes `onError={(m) => toast.error(m)}`
   * inline — the obvious way to write it, and how the workspace does — creates a
   * new function identity each render and would do exactly that. Reading the
   * callbacks through a ref means fetchData depends on eventId and scope alone:
   * the two things that genuinely change what is fetched.
   */
  const reporters = useRef({ onDenied, onError });
  useEffect(() => {
    reporters.current = { onDenied, onError };
  }, [onDenied, onError]);

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const empty = {
        success: true,
        data: [] as SoiApplicationTableRow[],
        pagination: { page: 1, limit: 1000, total_pages: 1, total_items: 0 },
      };

      let rows: SoiApplicationRow[];
      try {
        rows = await SoiReviewService.listApplications(eventId, scope);
      } catch (error) {
        const message =
          (error as { message?: string })?.message ?? 'Something went wrong.';
        if ((error as { status?: number })?.status === 403)
          reporters.current.onDenied(message);
        else reporters.current.onError(message);
        return empty;
      }

      setOriginals(
        Object.fromEntries(rows.map((r) => [r.application_id, r]))
      );

      // Union across EVERY row, not row 0 — see the file header. First label
      // wins for a given key so the column keeps the wording the form used.
      const labels = new Map<string, string>();
      for (const row of rows) {
        for (const answer of row.answers ?? []) {
          if (!labels.has(answer.key)) labels.set(answer.key, answer.label || answer.key);
        }
      }
      setAnswerColumns(
        Array.from(labels, ([key, label]) => ({ key, label }))
      );

      const flatRows = rows.map(flatten);

      // Search across everything the row holds, answers included — a coordinator
      // looking for "Dental" should find it whether it sits in the college
      // column or in an answer.
      const needle = params.search?.trim().toLowerCase();
      const filtered = needle
        ? flatRows.filter((row) =>
            Object.entries(row).some(
              ([key, value]) =>
                key !== 'is_awaiting' &&
                typeof value === 'string' &&
                value.toLowerCase().includes(needle)
            )
          )
        : flatRows;

      // Page HERE, in memory. fn_soi_list_applications takes an event and a
      // scope and returns the whole queue — it has no LIMIT/OFFSET — so
      // DataTable's page and pageSize have to be honoured on this side.
      // Returning every row while reporting total_pages: 1 made the footer read
      // "Rows per page: 10 · Page 1 of 1" above seventeen rendered rows: a
      // control that did nothing and a count that contradicted the screen.
      const limit = params.limit > 0 ? params.limit : filtered.length || 1;
      const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
      // Clamp: deleting or deciding the last row on the final page would
      // otherwise leave the table asking for a page that no longer exists and
      // rendering nothing at all.
      const page = Math.min(Math.max(1, params.page || 1), totalPages);
      const start = (page - 1) * limit;

      return {
        success: true,
        data: filtered.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total_pages: totalPages,
          total_items: filtered.length,
        },
      };
    },
    // eventId and scope ONLY — see the `reporters` ref above. Adding a callback
    // here reintroduces the refetch-every-render loop.
    [eventId, scope]
  );

  const getColumns = useCallback(
    (): ColumnDef<SoiApplicationTableRow, unknown>[] => {
      const columns: ColumnDef<SoiApplicationTableRow, unknown>[] = [
        {
          accessorKey: 'applicant_name',
          header: 'Applicant',
          // Every column carries an explicit `size`. DataTable renders each
          // header with `style={{ width: header.getSize() }}`, and TanStack's
          // default size is 150px — so WITHOUT this the widest and the narrowest
          // column get identical room and a name like "RANGANAYAKI J" is cut
          // mid-word. A min-w- class on the cell cannot rescue it: the <td> is
          // already fixed at 150px and clips whatever the div claims.
          size: 260,
          cell: ({ row }) => (
            <div className="space-y-0.5 overflow-hidden">
              <p
                className="truncate font-medium leading-tight"
                title={row.original.applicant_name}
              >
                {row.original.applicant_name}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={row.original.applicant_email || undefined}
              >
                {row.original.applicant_email || 'no address on record'}
              </p>
            </div>
          ),
        },
        {
          accessorKey: 'audience_label',
          header: 'Type',
          size: 120,
          cell: ({ row }) =>
            row.original.audience_label ? (
              <Badge variant="outline" className="whitespace-nowrap text-[10px] font-normal">
                {row.original.audience_label}
              </Badge>
            ) : (
              // Empty means S4 never established a member type — which for a
              // backfilled row means no MyJKKN account is linked. Saying so is
              // the point: this is the applicant who cannot be accepted.
              <span className="text-xs text-muted-foreground">not linked</span>
            ),
        },
        {
          accessorKey: 'institution_name',
          header: 'College',
          size: 180,
          cell: ({ row }) => (
            <span
              className="block truncate text-sm"
              title={row.original.institution_name || undefined}
            >
              {row.original.institution_name || '—'}
            </span>
          ),
        },
        {
          accessorKey: 'submitted_at',
          header: 'Applied',
          size: 130,
          cell: ({ row }) => {
            const { day, time } = whenParts(row.original.submitted_at);
            return (
              <div className="space-y-0.5">
                <p className="whitespace-nowrap text-sm leading-tight">{day}</p>
                {time && (
                  <p className="whitespace-nowrap text-xs text-muted-foreground">
                    {time}
                  </p>
                )}
              </div>
            );
          },
        },
        {
          accessorKey: 'status_label',
          header: 'Status',
          size: 140,
          cell: ({ row }) => (
            <Badge
              variant={row.original.is_awaiting ? 'secondary' : 'outline'}
              className="whitespace-nowrap text-[10px] font-normal"
            >
              {row.original.status_label}
            </Badge>
          ),
        },
        // The decision, once made — including the exact words the applicant is
        // shown. A reviewer must be able to see what was said in their name.
        //
        // Only under a scope that can CONTAIN a decision. In 'awaiting' — the
        // default the screen opens on — nothing has been decided by definition,
        // so this column was a 220px strip of em-dashes pushing the Decide
        // buttons off the right edge of the table.
        ...(scope === 'awaiting'
          ? []
          : [{
          accessorKey: 'decision_label',
          header: 'Decision',
          size: 220,
          cell: ({ row }) =>
            row.original.decision_label ? (
              <div className="space-y-0.5 overflow-hidden">
                <p
                  className={`text-sm font-medium ${
                    row.original.decision_label === 'Accepted'
                      ? 'text-green-700'
                      : 'text-red-700'
                  }`}
                >
                  {row.original.decision_label}
                  {row.original.decided_by ? ` by ${row.original.decided_by}` : ''}
                </p>
                {row.original.decision_reason && (
                  <p className="text-xs text-muted-foreground">
                    &ldquo;{row.original.decision_reason}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            ),
            }] as ColumnDef<SoiApplicationTableRow, unknown>[]),
      ];

      // "Batch asked for" only means something when the APPLICANT chose one.
      // Under 'staff_assign' — the live setting — nobody is shown a batch
      // chooser, so the column would read "none chosen" on every row forever:
      // a column of one repeated word, taking width from the names beside it.
      if (!reviewerPicksBatch) {
        columns.splice(4, 0, {
          accessorKey: 'requested_batch',
          header: 'Batch asked for',
          size: 170,
          cell: ({ row }) => (
            <span className="block truncate text-sm">
              {row.original.requested_batch || (
                <span className="text-muted-foreground">none chosen</span>
              )}
            </span>
          ),
        });
      }

      // One column per question the form asked — discovered at fetch time, so a
      // form that changes mid-intake needs no code change here.
      //
      // OFF BY DEFAULT (fixed 2026-08-17). Rendered unconditionally, these put
      // fourteen columns on the screen at once and every one of them truncated:
      // applicants' names were cut mid-word, and the Decide buttons were pushed
      // off the right edge where a coordinator had to scroll to reach them. They
      // also largely RESTATE the columns above — this form asks for Name,
      // College Name and "Learner or Senior Learner", which are the Applicant,
      // College and Type columns again. The toggle above the table brings them
      // back for anyone who wants to read or export the answers.
      if (showAnswers) {
        for (const answer of answerColumns) {
          columns.push({
            accessorKey: `${ANSWER_PREFIX}${answer.key}`,
            header: answer.label,
            size: 170,
            cell: ({ row }) => {
              const value = row.original[`${ANSWER_PREFIX}${answer.key}`];
              return (
                <span
                  className="block truncate text-sm"
                  title={value ? String(value) : undefined}
                >
                  {value ? String(value) : <span className="text-muted-foreground">—</span>}
                </span>
              );
            },
          });
        }
      }

      columns.push({
        id: 'actions',
        header: 'Decide',
        enableHiding: false,
        // Wide enough to hold the picker and both buttons on ONE line. At the
        // default 150px they wrapped into a three-deep stack that spilled over
        // the rows above and below it. Roughly: 130 picker + 95 Accept + 110
        // Turn down + gaps + the cell's own px-4.
        size: 380,
        cell: ({ row }) => {
          const flat = row.original;
          const original = originals[flat.application_id];
          if (!original) return null;

          // A decided application is shown, never re-decided. The database
          // refuses it too; this only keeps the buttons off a row that would
          // always fail.
          if (!flat.is_awaiting) {
            return <span className="text-xs text-muted-foreground">Decided</span>;
          }

          const busy = busyId === flat.application_id;
          const picked = chosenBatch[flat.application_id];
          const canAccept = !reviewerPicksBatch || !!picked;

          return (
            <div className="flex items-center gap-1.5">
              {reviewerPicksBatch && (
                <Select
                  value={picked ?? ''}
                  onValueChange={(v) => onChooseBatch(flat.application_id, v)}
                >
                  <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs">
                    <SelectValue placeholder="Choose a batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No batch has been set up yet
                      </SelectItem>
                    ) : (
                      /* Full batches stay listed and selectable (A3) — picking
                         one leads to the over-limit confirmation, not straight
                         to an accept. Hiding them did not prevent an over-fill,
                         it only made the decision unreachable. */
                      batches.map((b) => (
                        <SelectItem key={b.cohort_id} value={b.cohort_id}>
                          {soiDisplayName(b.batch_name)} —{' '}
                          {b.is_full
                            ? `FULL, ${b.occupancy} of ${b.capacity}`
                            : `${b.capacity - b.occupancy} of ${b.capacity} left`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}

              <Button
                size="sm"
                className="h-8"
                disabled={!canAccept || busy}
                onClick={() => onAccept(original)}
                title={
                  reviewerPicksBatch && !picked ? 'Choose a batch first.' : undefined
                }
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : reviewerPicksBatch ? (
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {reviewerPicksBatch ? 'Accept' : 'Confirm'}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy}
                onClick={() => onReject(original)}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Turn down
              </Button>
            </div>
          );
        },
      });

      return columns;
    },
    [
      answerColumns,
      batches,
      busyId,
      chosenBatch,
      onAccept,
      onChooseBatch,
      onReject,
      originals,
      reviewerPicksBatch,
      scope,
      showAnswers,
    ]
  );

  /**
   * Data KEYS, never labels — buildExcelRows matches on `key in row`, so a label
   * here silently writes a file with no columns. `is_awaiting` is deliberately
   * absent: it drives the buttons and means nothing in a spreadsheet.
   */
  const exportConfig = useMemo(() => {
    const baseKeys = [
      'applicant_name',
      'applicant_email',
      'audience_label',
      'institution_name',
      'submitted_at',
      'requested_batch',
      'status_label',
      'decision_label',
      'decided_by',
      'decision_reason',
    ];
    const baseLabels: Record<string, string> = {
      applicant_name: 'Applicant',
      applicant_email: 'Email',
      audience_label: 'Type',
      institution_name: 'College',
      submitted_at: 'Applied on',
      requested_batch: 'Batch asked for',
      status_label: 'Status',
      decision_label: 'Decision',
      decided_by: 'Decided by',
      decision_reason: 'Reason given',
    };

    const answerKeys = answerColumns.map((a) => `${ANSWER_PREFIX}${a.key}`);
    const answerLabels = Object.fromEntries(
      answerColumns.map((a) => [`${ANSWER_PREFIX}${a.key}`, a.label])
    );

    const headers = [...baseKeys, ...answerKeys];

    return {
      entityName: 'school-of-influence-applications',
      headers,
      columnMapping: { ...baseLabels, ...answerLabels },
      columnWidths: headers.map((key) =>
        key === 'decision_reason' ? { wch: 40 } : { wch: 22 }
      ),
    };
  }, [answerColumns]);

  return (
    /*
     * .pinned-actions-col sticks the LAST column to the right edge while the
     * rest of the table scrolls under it (rule in app/globals.css, opt-in, also
     * used by the Hostel Allocations tables).
     *
     * It is the fix for the real complaint: when the table is wider than its
     * container the Turn down button was simply cut off, and the horizontal
     * scrollbar that should have reached it is rendered by the shadcn <Table>
     * primitive's own inner `overflow-auto` div — which puts the scrollbar
     * BELOW seventeen rows of content, off the bottom of the screen. A
     * scrollbar you have to scroll down to find is one that does not work.
     * Pinning the column removes the need to reach it at all.
     *
     * The Decide column must therefore stay LAST: the CSS selects
     * `td:last-child`, so appending any column after it would pin that one
     * instead. This is why the answer columns are pushed before it above.
     */
    <div className="pinned-actions-col space-y-2">
      {/* The answers are one click away rather than always on screen. The count
          is named so nobody has to toggle it to find out whether there is
          anything behind it. */}
      {answerColumns.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setShowAnswers((v) => !v)}
          >
            {showAnswers ? (
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            {showAnswers
              ? 'Hide their answers'
              : `Show their answers (${answerColumns.length})`}
          </Button>
        </div>
      )}

      <DataTable<SoiApplicationTableRow, unknown>
      getColumns={getColumns}
      fetchDataFn={fetchData}
      exportConfig={exportConfig}
      idField="application_id"
      refetchKey={refetchKey}
      config={{
        enableRowSelection: false,
        // Every decision is per-applicant and routes through its own
        // confirmation, so a bulk bar would promise something no RPC offers.
        enableClickRowSelect: false,
        enableSearch: true,
        enableColumnVisibility: true,
        enableExport: true,
        enablePagination: true,
        enableColumnResizing: true,
        // Answer columns are discovered per fetch, so their widths cannot be
        // remembered against a stable id — a form that gains a question would
        // restore the previous column's width onto the new one.
        columnResizingTableId: undefined,
        // A date filter over submitted_at would need server support that
        // fn_soi_list_applications does not take (it accepts event + scope only).
        enableDateFilter: false,
        enableColumnFilters: false,
        enableToolbar: true,
        size: 'sm',
      }}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </div>
  );
}
