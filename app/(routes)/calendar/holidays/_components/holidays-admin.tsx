'use client';

/**
 * Common Holidays & Events — admin surface over calendar_entries.
 *
 * This table drives the `global_entries` chip on /calendar and, through
 * `blocks_attendance`, decides which days suppress attendance marking. It is
 * therefore a screen where a row you cannot see is a real operational problem,
 * not a cosmetic one — and until this rewrite it hid rows: the service capped a
 * page at 50, the page rendered no pager, and 9 of the 59 live entries could
 * not be reached or edited at all. The TRUNCATION BANNER below is what stops
 * that class of bug from ever being silent again; if it appears, this page
 * needs server-side filtering, not a larger cap.
 *
 * The whole set is fetched once and filtered in the browser so the faceted
 * filter counts and the table read the same array (holiday-filters.tsx owns the
 * predicate they share).
 */

import { useCallback, useMemo, useState } from 'react';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useCalendarEntries,
  useCalendarCategories,
  useCreateCalendarEntry,
  useUpdateCalendarEntry,
  useDeleteCalendarEntry,
} from '@/hooks/calendar/use-calendar';
import { getErrorMessage } from '@/lib/utils';
import type { CalendarEntry } from '@/types/calendar';

import {
  EMPTY_HOLIDAY_FILTERS,
  HolidayAdvancedFilters,
  type HolidayFilterState,
} from './holiday-filters';
import {
  EMPTY_HOLIDAY_FORM,
  HolidayEntryDialog,
  entryToForm,
  formToPayload,
  type HolidayFormState,
} from './holiday-entry-dialog';
import { HolidayDetailDialog } from './holiday-detail-dialog';
import { HolidaysDataTable } from './holidays-data-table';

/** What the confirmation dialog is about to destroy. */
interface PendingDelete {
  entries: CalendarEntry[];
  onDone?: () => void;
}

export function HolidaysAdmin() {
  const { toast } = useToast();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('calendar.holidays', 'manage');

  const { data: list, isLoading } = useCalendarEntries();
  const { data: categories = [] } = useCalendarCategories();
  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  const create = useCreateCalendarEntry();
  const update = useUpdateCalendarEntry();
  const remove = useDeleteCalendarEntry();

  const [filters, setFilters] = useState<HolidayFilterState>(EMPTY_HOLIDAY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog is fully controlled, so the draft lives here — see the note in
  // holiday-entry-dialog.tsx on why it is not derived inside the dialog.
  const [form, setForm] = useState<HolidayFormState>(EMPTY_HOLIDAY_FORM);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  /**
   * The detail panel tracks an ID, not a row snapshot, and re-resolves against
   * the live list. A captured object would keep showing the old title after an
   * edit, and would survive its own row being deleted; this way the panel
   * refreshes with the cache and closes itself if the entry goes away.
   */
  const [viewingId, setViewingId] = useState<string | null>(null);

  const entries = useMemo(() => list?.data ?? [], [list]);
  const totalCount = list?.totalCount ?? 0;
  const truncated = totalCount > entries.length;

  // useInstitutionsWithAccess returns richer objects than the table needs; the
  // narrow shape keeps the filter panel and the columns from depending on it.
  const institutionOptions = useMemo(
    () => institutions.map((i) => ({ id: i.id, name: i.name })),
    [institutions]
  );

  const institutionNames = useMemo(
    () => new Map(institutionOptions.map((i) => [i.id, i.name])),
    [institutionOptions]
  );

  const viewing = useMemo(
    () => (viewingId ? entries.find((e) => e.id === viewingId) ?? null : null),
    [entries, viewingId]
  );

  const openCreate = useCallback(() => {
    setForm(EMPTY_HOLIDAY_FORM);
    setDialogOpen(true);
  }, []);

  const openView = useCallback((e: CalendarEntry) => setViewingId(e.id), []);

  const openEdit = useCallback((e: CalendarEntry) => {
    // Dismiss the detail panel first: Edit is reachable from inside it, and two
    // stacked dialogs trap focus in the one underneath.
    setViewingId(null);
    setForm(entryToForm(e));
    setDialogOpen(true);
  }, []);

  const save = useCallback(
    async (form: HolidayFormState) => {
      const payload = formToPayload(form);
      try {
        if (form.id) await update.mutateAsync({ id: form.id, updates: payload });
        else await create.mutateAsync(payload);
        toast({ title: form.id ? 'Entry updated' : 'Entry created' });
        setDialogOpen(false);
      } catch (err) {
        // Supabase errors are plain objects, so getErrorMessage — not
        // `err instanceof Error` — is what surfaces an RLS denial here.
        toast({
          title: 'Save failed',
          description: getErrorMessage(err),
          variant: 'destructive',
        });
      }
    },
    [create, update, toast]
  );

  const requestDelete = useCallback((e: CalendarEntry) => {
    setPendingDelete({ entries: [e] });
  }, []);

  const requestBulkDelete = useCallback((rows: CalendarEntry[], onDone: () => void) => {
    if (rows.length === 0) return;
    setPendingDelete({ entries: rows, onDone });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    // Sequential, and each result inspected: a partial failure has to be
    // reported as one, not swallowed into a blanket success toast.
    const failed: string[] = [];
    for (const e of pendingDelete.entries) {
      try {
        await remove.mutateAsync(e.id);
      } catch (err) {
        failed.push(`${e.title}: ${getErrorMessage(err)}`);
      }
    }
    setDeleting(false);
    const done = pendingDelete.entries.length - failed.length;
    setPendingDelete(null);
    pendingDelete.onDone?.();

    if (failed.length === 0) {
      toast({ title: done === 1 ? 'Entry deleted' : `${done} entries deleted` });
    } else {
      toast({
        title: `${failed.length} of ${pendingDelete.entries.length} could not be deleted`,
        description: failed.slice(0, 3).join(' · '),
        variant: 'destructive',
      });
    }
  }, [pendingDelete, remove, toast]);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-xl font-semibold'>Common Holidays &amp; Events</h1>
          <p className='text-sm text-muted-foreground'>
            {isLoading
              ? 'Loading…'
              : `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'} across the group`}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className='w-full shrink-0 sm:w-auto'>
            <Plus className='mr-2 h-4 w-4' />
            New entry
          </Button>
        )}
      </div>

      {truncated && (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            Showing {entries.length} of {totalCount} entries — the rest were cut off by the
            fetch cap. Filtering and counts on this page cover only the loaded rows. This
            screen needs server-side filtering before it can hold this many entries.
          </AlertDescription>
        </Alert>
      )}

      <HolidayAdvancedFilters
        rows={entries}
        value={filters}
        onChange={setFilters}
        categories={categories}
        institutions={institutionOptions}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />

      <HolidaysDataTable
        rows={entries}
        filters={filters}
        categories={categories}
        institutions={institutionOptions}
        canManage={canManage}
        onViewDetails={openView}
        onEdit={openEdit}
        onDelete={requestDelete}
        onBulkDelete={requestBulkDelete}
      />

      <HolidayDetailDialog
        entry={viewing}
        categories={categories}
        institutionNames={institutionNames}
        canManage={canManage}
        onClose={() => setViewingId(null)}
        onEdit={openEdit}
      />

      <HolidayEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        onFormChange={setForm}
        categories={categories}
        institutions={institutionOptions}
        saving={create.isPending || update.isPending}
        onSave={save}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.entries.length === 1
                ? 'Delete this entry?'
                : `Delete ${pendingDelete?.entries.length ?? 0} entries?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.entries.length === 1 ? (
                <>
                  &ldquo;{pendingDelete.entries[0].title}&rdquo; will be removed from the
                  calendar for everyone it applies to. This cannot be undone — to keep the
                  record but take it off the calendar, edit it and switch Active off instead.
                </>
              ) : (
                <>
                  These entries will be removed from the calendar for everyone they apply to.
                  This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // AlertDialogAction closes on click; the dialog has to stay up
                // while a multi-row delete runs, so the default is suppressed
                // and confirmDelete clears `pendingDelete` when it finishes.
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
