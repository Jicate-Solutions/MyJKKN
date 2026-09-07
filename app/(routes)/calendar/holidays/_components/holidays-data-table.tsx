'use client';

/**
 * Advanced DataTable wrapper for Common Holidays & Events.
 *
 * Rows are fetched ONCE by the page and passed in, so the filter panel's
 * faceted counts and the table read the same array — the rule
 * salary-directory-data-table.tsx records, and for the same reason: two
 * independent sources for one list is how a count comes to disagree with the
 * rows beneath it.
 *
 * This replaces a hand-rolled <Table> that had no pager. Because
 * CalendarService.listEntries defaulted to 50 rows and the component dropped
 * the totalCount that would have revealed the cut, 9 of the 59 live entries
 * were unreachable — not merely on another page, but absent from the UI.
 *
 * DataTable re-runs fetchDataFn whenever its identity changes, so `rows` and
 * `filters` in the deps are what make a filter change repaint the table.
 */

import { useCallback, useMemo } from 'react';
import moment from 'moment';
import { Trash2 } from 'lucide-react';

import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import type { ExportableData } from '@/components/data-table/utils/export-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CalendarCategory, CalendarEntry } from '@/types/calendar';

import { getHolidayColumns } from './holiday-columns';
import {
  dayCount,
  holidayFilterLabels,
  isCommonScope,
  matchesHolidayFilters,
  type HolidayFilterState,
} from './holiday-filters';

/**
 * Export keys are deliberately DISTINCT from the column ids.
 *
 * data-export.tsx keeps a custom header only when it is NOT a table column id
 * or the column is currently visible (see its `exportHeaders` filter), so an
 * export key named after a column a user has hidden is silently dropped from
 * the spreadsheet. Naming them `entry_title` / `start_date` rather than
 * `title` / `dates` sidesteps that entirely.
 */
const EXPORT_COLUMNS: Array<{ key: string; label: string; width: number }> = [
  { key: 'entry_title', label: 'Title', width: 34 },
  { key: 'entry_kind', label: 'Kind', width: 12 },
  { key: 'category_name', label: 'Category', width: 20 },
  { key: 'start_date', label: 'Start Date', width: 14 },
  { key: 'end_date', label: 'End Date', width: 14 },
  { key: 'days', label: 'Days', width: 8 },
  { key: 'scope_label', label: 'Scope', width: 18 },
  { key: 'institutions', label: 'Institutions', width: 44 },
  { key: 'blocks', label: 'Blocks Attendance', width: 18 },
  { key: 'entry_status', label: 'Status', width: 12 },
  { key: 'entry_description', label: 'Description', width: 48 },
];

/** A PDF page fits far fewer columns than a sheet — print the identifying subset. */
const PDF_COLUMNS = [
  'entry_title',
  'entry_kind',
  'category_name',
  'start_date',
  'end_date',
  'scope_label',
];

const utcDay = (iso: string) => moment.utc(iso).format('YYYY-MM-DD');

/**
 * Sort keyed by COLUMN ID, which is what the DataTable puts in `sort_by`
 * (createSortingHandler passes the column id straight through). A key map onto
 * CalendarEntry property names is not enough: `category` must sort by the
 * category's NAME — sorting it by `category_id` orders the column by uuid,
 * which looks random — and `blocks`/`status` are booleans whose property names
 * differ from their column ids. A column id missing from this map simply does
 * not sort, so every sortable column must appear here.
 */
const SORT_VALUE: Record<
  string,
  ((e: CalendarEntry, categoryNames: Map<string, string>) => string | number | null) | undefined
> = {
  title: (e) => e.title,
  kind: (e) => e.kind,
  category: (e, names) => (e.category_id ? names.get(e.category_id) ?? null : null),
  dates: (e) => e.start_at,
  blocks: (e) => (e.kind === 'holiday' ? Number(e.blocks_attendance) : null),
  status: (e) => Number(e.is_active),
};

interface Props {
  rows: CalendarEntry[];
  filters: HolidayFilterState;
  categories: CalendarCategory[];
  institutions: { id: string; name: string }[];
  canManage: boolean;
  /** Opens the read-only detail panel — the title cell and the mobile card. */
  onViewDetails: (e: CalendarEntry) => void;
  onEdit: (e: CalendarEntry) => void;
  onDelete: (e: CalendarEntry) => void;
  /** Hands the selected rows to the page's bulk-delete confirmation. */
  onBulkDelete: (entries: CalendarEntry[], resetSelection: () => void) => void;
}

export function HolidaysDataTable({
  rows,
  filters,
  categories,
  institutions,
  canManage,
  onViewDetails,
  onEdit,
  onDelete,
  onBulkDelete,
}: Props) {
  const institutionNames = useMemo(
    () => new Map(institutions.map((i) => [i.id, i.name])),
    [institutions]
  );

  const columns = useMemo(
    () =>
      getHolidayColumns({
        categories,
        institutionNames,
        canManage,
        onViewDetails,
        onEdit,
        onDelete,
      }),
    [categories, institutionNames, canManage, onViewDetails, onEdit, onDelete]
  );

  const byId = useMemo(() => {
    const m = new Map<string, CalendarEntry>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filterSubtitle = useMemo(
    () => holidayFilterLabels(filters, categories, institutions).join(' · '),
    [filters, categories, institutions]
  );

  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const term = (params.search ?? '').trim().toLowerCase();

      const filtered = rows.filter((e) => {
        if (!matchesHolidayFilters(e, filters)) return false;

        // The toolbar's date range is an OVERLAP test, not a containment one —
        // a week-long holiday must still appear when the user picks a range
        // covering only its middle day.
        if (params.from_date && utcDay(e.end_at) < params.from_date) return false;
        if (params.to_date && utcDay(e.start_at) > params.to_date) return false;

        if (!term) return true;
        return (
          e.title.toLowerCase().includes(term) ||
          (e.description ?? '').toLowerCase().includes(term)
        );
      });

      // 'created_at' is the DataTable's built-in initial sortBy and matches no
      // column here, so it means "keep the service's own order" — start_at
      // descending, which puts the nearest upcoming entries first.
      const sortBy = params.sort_by;
      const sortValue = SORT_VALUE[sortBy ?? ''];
      if (sortValue) {
        const dir = params.sort_order === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const av = sortValue(a, categoryNames);
          const bv = sortValue(b, categoryNames);
          if (av == null && bv == null) return 0;
          // Nulls last regardless of direction — an uncategorised entry sorting
          // into the middle of the Category column reads as a data error.
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }

      // Clamp rather than return an empty slice: narrowing a filter while on a
      // later page would otherwise render a blank table whose only way back is
      // the pager.
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
    [filters, rows, categoryNames]
  );

  const renderMobileRow = useCallback(
    (e: CalendarEntry) => (
      // Tapping opens DETAILS, not the edit form — same destination as the
      // title on desktop, and it gives a view-only user something to tap.
      // Edit is one button further in, inside the detail panel.
      <button
        type='button'
        onClick={() => onViewDetails(e)}
        className='w-full space-y-2 rounded-md border p-3 text-left'
      >
        <div className='flex items-start justify-between gap-2'>
          <p className='min-w-0 truncate text-sm font-medium'>{e.title}</p>
          <span className='shrink-0 text-xs text-muted-foreground'>
            {moment.utc(e.start_at).format('DD MMM')}
            {utcDay(e.start_at) !== utcDay(e.end_at) &&
              ` – ${moment.utc(e.end_at).format('DD MMM')}`}
          </span>
        </div>
        <div className='flex flex-wrap gap-1'>
          <Badge variant='outline' className='font-normal capitalize'>
            {e.kind}
          </Badge>
          <Badge variant='secondary' className='font-normal'>
            {isCommonScope(e)
              ? 'All institutions'
              : `${e.scope_institution_ids?.length ?? 0} institution(s)`}
          </Badge>
          {e.kind === 'holiday' && e.blocks_attendance && (
            <Badge
              variant='outline'
              className='border-amber-300 font-normal text-amber-700 dark:border-amber-800 dark:text-amber-400'
            >
              Blocks attendance
            </Badge>
          )}
          {!e.is_active && (
            <Badge variant='secondary' className='font-normal'>
              Inactive
            </Badge>
          )}
        </div>
      </button>
    ),
    [onViewDetails]
  );

  /**
   * allSelectedIds carries ids across pages, so a selection made over several
   * pages deletes correctly — resolved through `byId` rather than using
   * `selectedRows`, which only holds the current page.
   */
  const renderToolbarContent = useCallback(
    ({
      allSelectedIds,
      totalSelectedCount,
      resetSelection,
    }: {
      selectedRows: CalendarEntry[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => {
      if (!canManage || totalSelectedCount === 0) return null;

      return (
        <div className='flex items-center gap-2'>
          <span className='hidden text-sm text-muted-foreground sm:inline'>
            {totalSelectedCount} selected
          </span>
          <Button
            size='sm'
            variant='destructive'
            className='h-8'
            onClick={() => {
              const picked = allSelectedIds
                .map((id) => byId.get(String(id)))
                .filter(Boolean) as CalendarEntry[];
              onBulkDelete(picked, resetSelection);
            }}
          >
            <Trash2 className='mr-2 h-3.5 w-3.5' />
            Delete {totalSelectedCount}
          </Button>
        </div>
      );
    },
    [byId, canManage, onBulkDelete]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as never}
      getColumns={() => columns as never}
      renderMobileRow={renderMobileRow as never}
      renderToolbarContent={renderToolbarContent as never}
      idField='id'
      config={{
        enableRowSelection: canManage,
        columnResizingTableId: 'calendar-holidays',
        searchPlaceholder: 'Search title or description…',
      }}
      exportConfig={{
        entityName: 'common-holidays-events',
        columnMapping: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, c.label])),
        columnWidths: EXPORT_COLUMNS.map((c) => ({ wch: c.width })),
        headers: EXPORT_COLUMNS.map((c) => c.key),
        pdf: {
          headers: PDF_COLUMNS,
          title: 'Common Holidays & Events',
          subtitle: filterSubtitle || undefined,
          orientation: 'landscape',
        },
        // Without this the sheet exports row[undefined] for every cell. Typed
        // against ExportableData because TData collapses to it once fetchDataFn
        // is cast — an interface has no implicit index signature.
        transformFunction: (row: ExportableData) => {
          const e = row as unknown as CalendarEntry;
          const common = isCommonScope(e);
          return {
            entry_title: e.title,
            entry_kind: e.kind,
            category_name: categories.find((c) => c.id === e.category_id)?.name ?? '',
            start_date: utcDay(e.start_at),
            end_date: utcDay(e.end_at),
            days: dayCount(e),
            scope_label: common ? 'All institutions' : 'Institution-specific',
            institutions: common
              ? 'All institutions'
              : (e.scope_institution_ids ?? [])
                  .map((id) => institutionNames.get(id) ?? id)
                  .join(', '),
            blocks: e.kind === 'holiday' ? (e.blocks_attendance ? 'Yes' : 'No') : '',
            entry_status: e.is_active ? 'Active' : 'Inactive',
            entry_description: e.description ?? '',
          };
        },
      }}
    />
  );
}
