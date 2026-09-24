'use client';

/**
 * HR — Attendance › Import › delete an imported biometric month.
 * Created: 2026-08-20.
 *
 * Re-importing a month overwrites cleanly, but it cannot UNDO one: the upsert
 * is keyed on (employee_id, work_date), so rows the next file does not mention
 * — a file loaded against the wrong machine, a month imported before the shift
 * timings existed — survive every subsequent import. This is that undo.
 *
 * SUPER ADMIN ONLY, gated on isSuperAdmin rather than on a permission key.
 * canAccess short-circuits true for super admins, so a key would ALSO admit any
 * role holding it — the opposite of the intent. No new key is declared, which
 * also keeps the permissions-audit gate out of it. All three RPCs check
 * is_super_admin() themselves, so hiding this panel is a convenience, not the
 * security boundary.
 *
 * The confirm demands the institution code be typed. The realistic mistake here
 * is not "meant to keep it", it is "deleted the wrong college" — six machines
 * all show a July 2026 row — and typing the code is the friction that forces
 * reading the row you are actually on.
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
// Still used by the confirm dialog, where the institution code is typed out.
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBiometricImportBatches, useBiometricPurgePreview, usePurgeBiometricImport,
} from '@/hooks/hr/use-biometric-import-purge';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';
import { biometricMonthLabel, type BiometricImportBatch } from '@/types/hr-biometric';
import {
  biometricBatchRowId, getBiometricBatchColumns, type BiometricBatchRow,
} from './biometric-batch-columns';

const VERDICT_ORDER = ['PRESENT', 'HALF_DAY', 'ABSENT', 'WEEKLY_OFF'];

const EXPORT_CONFIG = {
  entityName: 'imported-biometric-months',
  columnMapping: {
    machine_name: 'Machine institution',
    machine_code: 'Machine code',
    month_start: 'Month',
    record_count: 'Day records',
    staff_count: 'Team members',
    staff_institution_count: 'Colleges touched',
    exception_count: 'Exceptions',
    open_exception_count: 'Open exceptions',
    reconciled_count: 'Reconciled days',
    regularization_count: 'Regularizations',
    last_imported_at: 'Last imported',
  },
  columnWidths: [
    { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
  ],
  headers: [
    'machine_name', 'machine_code', 'month_start', 'record_count', 'staff_count',
    'staff_institution_count', 'exception_count', 'open_exception_count',
    'reconciled_count', 'regularization_count', 'last_imported_at',
  ],
};

/**
 * Six machines x every month imported, so the list grows by six rows a month and
 * every row looks alike apart from two words. Filtering is not a nicety here —
 * picking the wrong row is the failure mode this whole panel is built around.
 */
type BatchFlag = 'any' | 'open_exceptions' | 'multi_college' | 'human_work';

export function BiometricPurgePanel() {
  const { isSuperAdmin } = usePermissions();
  const { data: batches, isLoading, error } = useBiometricImportBatches(isSuperAdmin);
  const purge = usePurgeBiometricImport();

  const [target, setTarget] = useState<BiometricImportBatch | null>(null);
  const [typed, setTyped] = useState('');

  // Search moved into the DataTable's own toolbar; these three have no column
  // to hang off (the flag is derived from four counts) so they stay local.
  const [institution, setInstitution] = useState('any');
  const [month, setMonth] = useState('any');
  const [flag, setFlag] = useState<BatchFlag>('any');

  const rows = useMemo(() => batches ?? [], [batches]);

  const institutionOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of rows) {
      m.set(b.machine_institution_id, b.machine_name ?? b.machine_code ?? 'Unknown institution');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Newest first, matching the RPC's own ordering so the dropdown reads like the table.
  const monthOptions = useMemo(
    () => [...new Set(rows.map((b) => b.month_start))].sort().reverse(),
    [rows],
  );

  /**
   * THE TABLE READS THE HOOK, NOT THE RPC.
   *
   * fn_biometric_import_batches returns every month in one call — six machines
   * times the months imported, so tens of rows, not thousands — and letting
   * DataTable fetch it itself would put a second copy outside React Query,
   * where invalidating the batches key could not reach it. That is precisely
   * what has to work: finishing an import invalidates this key and the table
   * must follow without a reload.
   *
   * So the fetch function is pure and in-memory over the hook's data, and
   * because DataTable lists fetchDataFn in its own fetch dependencies
   * (data-table.tsx:631), a new identity here re-runs it. The useCallback deps
   * are therefore the refresh trigger: new batches, or a changed filter.
   */
  const fetchDataFn = useCallback(
    async ({ page, limit, search: q, sort_by, sort_order }: DataFetchParams):
      Promise<DataFetchResult<BiometricBatchRow>> => {
      const needle = (q ?? '').trim().toLowerCase();

      const matched = rows.filter((b) => {
        if (institution !== 'any' && b.machine_institution_id !== institution) return false;
        if (month !== 'any' && b.month_start !== month) return false;
        if (flag === 'open_exceptions' && b.open_exception_count === 0) return false;
        if (flag === 'multi_college' && b.staff_institution_count <= 1) return false;
        if (flag === 'human_work' && b.reconciled_count === 0 && b.regularization_count === 0) return false;
        if (needle && !`${b.machine_name ?? ''} ${b.machine_code ?? ''}`.toLowerCase().includes(needle)) return false;
        return true;
      });

      if (sort_by) {
        const dir = sort_order === 'desc' ? -1 : 1;
        // sort_by is whatever column id the table hands back, so the row is
        // indexed dynamically; BiometricImportBatch has no index signature.
        matched.sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[sort_by];
          const bv = (b as unknown as Record<string, unknown>)[sort_by];
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        });
      }

      const start = Math.max(0, (page - 1) * limit);
      return {
        success: true,
        data: matched
          .slice(start, start + limit)
          .map((b) => ({ ...b, id: biometricBatchRowId(b) })),
        pagination: {
          page,
          limit,
          total_pages: Math.max(1, Math.ceil(matched.length / limit)),
          total_items: matched.length,
        },
      };
    },
    [rows, institution, month, flag],
  );

  const getColumns = useCallback(
    () => getBiometricBatchColumns((row) => { setTarget(row); setTyped(''); }),
    [],
  );

  const filtersOn = institution !== 'any' || month !== 'any' || flag !== 'any';

  const resetFilters = () => {
    setInstitution('any');
    setMonth('any');
    setFlag('any');
  };

  const {
    data: preview, isLoading: previewLoading, error: previewError,
  } = useBiometricPurgePreview(
    target?.machine_institution_id ?? null,
    target?.month_start ?? null,
    Boolean(target),
  );

  const expected = (target?.machine_code || target?.machine_name || '').trim();
  const canConfirm =
    !purge.isPending && !previewLoading && !previewError &&
    typed.trim().toUpperCase() === expected.toUpperCase() && expected !== '';

  const statusRows = useMemo(() => {
    if (!preview?.by_status) return [] as Array<[string, number]>;
    const entries = Object.entries(preview.by_status);
    entries.sort((a, b) => VERDICT_ORDER.indexOf(a[0]) - VERDICT_ORDER.indexOf(b[0]));
    return entries;
  }, [preview]);

  if (!isSuperAdmin) return null;

  const close = () => { setTarget(null); setTyped(''); };

  const confirm = async () => {
    if (!target) return;
    try {
      const receipt = await purge.mutateAsync({
        machineInstitutionId: target.machine_institution_id,
        monthStart: target.month_start,
      });
      toast.success(
        `Deleted ${receipt.deleted.records.toLocaleString('en-IN')} day record(s) for ${receipt.machine_name} — ${receipt.month_label}`,
      );
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base font-semibold">Delete an imported month</CardTitle>
          </div>
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            Super admin only
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A month is listed against the <strong>machine</strong> that produced the file, not the
          team member&rsquo;s own college — one machine routinely records people from several. Use
          this to undo a file loaded against the wrong machine, or a month imported before the shift
          timings were configured. Deleting cannot be undone; re-import the file to restore it.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            Nothing has been imported yet.
          </p>
        ) : (
          <DataTable<BiometricBatchRow, unknown>
            getColumns={getColumns}
            fetchDataFn={fetchDataFn}
            idField="id"
            // Deliberately no row selection: the typed-code confirm exists to
            // force reading ONE row, and a tick box would hand back the bulk
            // delete that friction is there to prevent.
            config={{
              enableRowSelection: false,
              enableClickRowSelect: false,
              enableDateFilter: false,
              enableToolbar: true,
              enableSearch: true,
              enablePagination: true,
              enableColumnVisibility: true,
              enableColumnResizing: true,
              enableUrlState: true,
              enableExport: true,
            }}
            exportConfig={EXPORT_CONFIG}
            pageSizeOptions={[10, 25, 50]}
            // The three selects live outside the table's own state, so the
            // table must go back to page 1 when they change — otherwise a
            // narrower filter leaves the offset past the end of the result.
            pageResetKey={`${institution}|${month}|${flag}`}
            renderToolbarContent={() => (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={institution} onValueChange={setInstitution}>
                  <SelectTrigger className="h-8 w-[190px]" aria-label="Filter by machine institution">
                    <SelectValue placeholder="All institutions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All institutions</SelectItem>
                    {institutionOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="h-8 w-[150px]" aria-label="Filter by month">
                    <SelectValue placeholder="All months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All months</SelectItem>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m}>{biometricMonthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={flag} onValueChange={(v) => setFlag(v as BatchFlag)}>
                  <SelectTrigger className="h-8 w-[220px]" aria-label="Filter by what needs attention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Anything</SelectItem>
                    <SelectItem value="open_exceptions">Has unresolved exceptions</SelectItem>
                    <SelectItem value="multi_college">Touches more than one college</SelectItem>
                    <SelectItem value="human_work">Holds manual corrections</SelectItem>
                  </SelectContent>
                </Select>

                {filtersOn && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                    <X className="mr-1 h-3.5 w-3.5" />
                    Reset filters
                  </Button>
                )}
              </div>
            )}
          />
        )}
      </CardContent>

      <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open) close(); }}>
        <AlertDialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {target ? biometricMonthLabel(target.month_start) : ''} for{' '}
              {target?.machine_name ?? ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the attendance those punches produced. Re-importing the same
              file is the only way back.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {previewLoading && <Skeleton className="h-32 w-full" />}

          {previewError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{getErrorMessage(previewError)}</AlertDescription>
            </Alert>
          )}

          {preview && !previewLoading && (
            <div className="space-y-3">
              <div className="rounded-md border">
                <Line label="Day records deleted" value={preview.records} strong />
                <Line label="Team members affected" value={preview.staff} />
                {preview.staff_institutions > 1 && (
                  <Line
                    label="Colleges affected"
                    value={preview.staff_institutions}
                    note="this machine records team members from more than one"
                    warn
                  />
                )}
                {statusRows.map(([code, n]) => (
                  <Line key={code} label={`— ${code.replace('_', ' ').toLowerCase()}`} value={n} muted />
                ))}
                <Line label="Import exceptions deleted" value={preview.exceptions} />
              </div>

              {(preview.reconciled_records > 0 || preview.regularizations_unlinked > 0) && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-1">
                    {preview.reconciled_records > 0 && (
                      <p>
                        {preview.reconciled_records} day(s) were manually reconciled by HR. That
                        correction is discarded with the row.
                      </p>
                    )}
                    {preview.regularizations_unlinked > 0 && (
                      <p>
                        {preview.regularizations_unlinked} team member regularization request(s) point at
                        these days. The requests are <strong>kept</strong> and simply unlinked — a
                        re-import re-anchors them.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <label htmlFor="purge-confirm" className="text-sm font-medium">
                  Type <span className="font-mono">{expected}</span> to confirm
                </label>
                <Input
                  id="purge-confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={expected}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={close}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirm(); }}
              disabled={!canConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purge.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete this month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Line({
  label, value, strong, muted, warn, note,
}: {
  label: string; value: number; strong?: boolean; muted?: boolean; warn?: boolean; note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b px-3 py-1.5 last:border-b-0">
      <span className={`text-sm ${muted ? 'text-muted-foreground' : ''} ${warn ? 'text-amber-700' : ''}`}>
        {label}
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className={`tabular-nums ${strong ? 'text-base font-semibold' : 'text-sm'} ${warn ? 'text-amber-700' : ''}`}>
        {value.toLocaleString('en-IN')}
      </span>
    </div>
  );
}
