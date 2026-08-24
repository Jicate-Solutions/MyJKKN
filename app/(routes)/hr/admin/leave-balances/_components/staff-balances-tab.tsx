'use client';

/**
 * Staff-wise leave balances for one institution.
 *
 * The two tabs next door stop at the institution aggregate, which is the right
 * altitude for provisioning but useless for "what does this person actually
 * have left". This is the drill-down: one row per staff member, one column per
 * day-denominated leave type.
 *
 * Three things worth knowing about the shape:
 *
 *  * The COLUMN SET is per-institution, not global. Main Office runs two active
 *    day-types, most colleges four, Matric and Nattraja one. A fixed column set
 *    would render empty columns that read as missing data.
 *  * Only request_category='leave' types appear. Compensatory Off is
 *    credit-backed and Permission is minute-backed; hr_trig_update_leave_balance
 *    skips both, so their `used` never moves and a days column for them would
 *    show a permanently full balance that means nothing.
 *  * The institution list comes from useLeaveBalanceAnalytics — the same RPC
 *    the other two tabs read — so the three tabs cannot disagree about which
 *    institutions exist or what state they are in.
 *
 * Filtering is entirely client-side and lives in staff-balance-filters.ts. The
 * largest institution is 152 active staff and they are all already fetched, so
 * a server round-trip per facet would buy nothing — and in-memory rows are what
 * let every option carry a count that agrees with the table.
 */

import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Building2, Download, Pencil } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  useLeaveBalanceAnalytics,
  useStaffLeaveBalances,
} from '@/hooks/hr/use-hr-leave-types';
import type { HRStaffBalanceCell } from '@/types/hr-leave-staff-balances';

import { AdjustBalanceDialog, type AdjustTarget } from './adjust-balance-dialog';
import { FLAG_META, cellFlags, cellTone, rowNeedsAttention } from './balance-flags';
import { StaffBalanceFilterBar } from './staff-balance-filter-bar';
import {
  EMPTY_FILTERS,
  FILTER_LABELS,
  findBlockingFilters,
  matchesStaffBalanceFilters,
  type StaffBalanceFilterKey,
  type StaffBalanceFilters,
} from './staff-balance-filters';

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function StaffBalancesTab({ year }: { year: string | null }) {
  // Institution list: same source as the Analytics and Generate tabs.
  const { data: analytics, isLoading: instLoading } = useLeaveBalanceAnalytics(year);
  const institutions = useMemo(
    () => analytics?.institutions ?? [],
    [analytics?.institutions]
  );

  const [orgId, setOrgId] = useState<string | null>(null);
  const [filters, setFilters] = useState<StaffBalanceFilters>(EMPTY_FILTERS);
  /**
   * Which filter the user touched most recently. Used only to order the
   * blocking-filter suggestion below: the filter just picked is what they
   * meant, so the one worth suggesting they clear is the OTHER one.
   */
  const [lastChanged, setLastChanged] = useState<StaffBalanceFilterKey | null>(null);
  const [target, setTarget] = useState<AdjustTarget | null>(null);

  const { data, isLoading, isError, error } = useStaffLeaveBalances(orgId, year);

  const types = useMemo(() => data?.leave_types ?? [], [data?.leave_types]);
  const allRows = useMemo(() => data?.staff ?? [], [data?.staff]);

  const handleFilterChange = useCallback(
    (patch: Partial<StaffBalanceFilters>, key: StaffBalanceFilterKey) => {
      setFilters((prev) => ({ ...prev, ...patch }));
      setLastChanged(key);
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setLastChanged(null);
  }, []);

  /**
   * Switching institution resets the filters rather than carrying them over: a
   * department or category id from Dental matches nothing in Main Office, so
   * keeping them would land the operator on an empty table with no visible
   * cause. Done in the handler, not an effect — a setState-in-effect reset is
   * both a lint error here and a frame of wrong data.
   */
  const handleInstitutionChange = useCallback(
    (next: string) => {
      setOrgId(next);
      resetFilters();
    },
    [resetFilters]
  );

  const rows = useMemo(
    () => allRows.filter((s) => matchesStaffBalanceFilters(s, filters)),
    [allRows, filters]
  );

  // Named only when the filters produce nothing, so the empty state can say
  // which filter to clear instead of leaving the operator to guess.
  const blockingFilters = useMemo(
    () =>
      rows.length === 0 && allRows.length > 0
        ? findBlockingFilters(allRows, filters, lastChanged)
        : [],
    [rows.length, allRows, filters, lastChanged]
  );

  const exportXlsx = () => {
    if (!data) return;
    // Exports what the table SHOWS. Exporting the unfiltered set while the
    // screen displays a narrowed one is the classic way an "audit" spreadsheet
    // ends up disagreeing with the screen it was taken from.
    const sheet = rows.map((s) => {
      const row: Record<string, string | number> = {
        'Employee ID': s.staff_code ?? '',
        Name: s.name,
        Designation: s.designation ?? '',
        Department: s.department ?? '',
        Category: s.category_name ?? '',
        Teaching: s.is_teaching === null ? '' : s.is_teaching ? 'Teaching' : 'Non-Teaching',
        Role: s.role_name ?? '',
      };
      for (const t of data.leave_types) {
        const c = s.balances[t.id];
        row[`${t.name} — Entitled`] = c ? c.entitled : '';
        row[`${t.name} — Used`] = c ? c.used : '';
        row[`${t.name} — Available`] = c ? c.available : '';
      }
      row['Needs attention'] = rowNeedsAttention(s.flags) ? 'Yes' : '';
      return row;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Leave Balances');
    const slug = data.institution_name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
    // The suffix is the receipt: a filtered export is a subset, and the file
    // name is the only place that survives being emailed on.
    const suffix = rows.length === allRows.length ? '' : '_filtered';
    XLSX.writeFile(
      wb,
      `leave-balances_${slug}_${data.year_name ?? 'year'}${suffix}.xlsx`
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <Label className="text-xs text-muted-foreground">Institution</Label>
          <Select value={orgId ?? ''} onValueChange={handleInstitutionChange}>
            <SelectTrigger className="mt-1">
              <SelectValue
                placeholder={instLoading ? 'Loading…' : 'Select an institution'}
              />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.org_id} value={i.org_id}>
                  {i.institution_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {orgId && (
          <Button
            variant="outline"
            size="sm"
            onClick={exportXlsx}
            disabled={rows.length === 0}
            className="mb-1"
          >
            <Download className="mr-2 h-4 w-4" />
            Export{rows.length !== allRows.length && allRows.length > 0
              ? ` (${rows.length})`
              : ''}
          </Button>
        )}
      </div>

      {orgId && allRows.length > 0 && (
        <StaffBalanceFilterBar
          rows={allRows}
          filters={filters}
          onChange={handleFilterChange}
          onReset={resetFilters}
        />
      )}

      {/* ── Body ─────────────────────────────────────────────────── */}
      {!orgId ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="Pick an institution"
          body="Balances are shown one institution at a time — each runs its own set of leave types, so the columns differ."
        />
      ) : isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load balances</AlertTitle>
          {/* Supabase errors are plain objects, not Error instances. */}
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : types.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          title="No day-based leave types"
          body={`${data?.institution_name ?? 'This institution'} has no active leave type that draws on a day entitlement, so there is nothing to show. Compensatory Off and Permission are tracked separately — they are credit- and minute-backed.`}
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {data?.institution_name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {rows.length} of {allRows.length} team members
              </span>
            </CardTitle>
            <CardDescription>
              Each cell reads <strong>available / entitled</strong>, with days used
              underneath. {data?.year_name ? `Year ${data.year_name}.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Department</TableHead>
                    {types.map((t) => (
                      <TableHead key={t.id} className="text-right whitespace-nowrap">
                        {t.name}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({num(t.default_days)}d)
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={types.length + 5}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        {blockingFilters.length > 0 ? (
                          <>
                            No team member matches all the active filters. Clearing{' '}
                            <strong>{FILTER_LABELS[blockingFilters[0]]}</strong>
                            {blockingFilters.length > 1 && (
                              <>
                                {' '}
                                (or {FILTER_LABELS[blockingFilters[1]]})
                              </>
                            )}{' '}
                            would bring rows back.
                          </>
                        ) : (
                          'No team member matches all the active filters.'
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((s) => (
                      <TableRow key={s.employee_id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {s.staff_code ?? '—'}
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.designation ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.department ?? '—'}
                        </TableCell>
                        {types.map((t) => (
                          <BalanceCell
                            key={t.id}
                            cell={s.balances[t.id]}
                            onAdjust={() => {
                              const c = s.balances[t.id];
                              if (c) setTarget({ staff: s, leaveType: t, cell: c });
                            }}
                          />
                        ))}
                        <TableCell>
                          {/* Row-level entry point. Which cell it opens is
                              chosen in the dialog when several are flagged. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={`Adjust ${s.name}'s balances`}
                            onClick={() => {
                              const t = types[0];
                              const c = s.balances[t.id];
                              if (c) setTarget({ staff: s, leaveType: t, cell: c });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data?.hr_academic_year_id && (
        <AdjustBalanceDialog
          open={target !== null}
          onOpenChange={(v) => !v && setTarget(null)}
          target={target}
          hrAcademicYearId={data.hr_academic_year_id}
          yearName={data.year_name}
        />
      )}
    </div>
  );
}

/* ────────────────────────── pieces ────────────────────────── */

function BalanceCell({
  cell, onAdjust,
}: {
  cell: HRStaffBalanceCell | undefined;
  onAdjust: () => void;
}) {
  if (!cell) {
    return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  }

  const flags = cellFlags(cell);
  const tone = cellTone(flags);

  return (
    <TableCell
      className="cursor-pointer text-right tabular-nums hover:bg-muted/50"
      onClick={onAdjust}
      title={
        [
          `Entitled ${cell.entitled} · Carried ${cell.carried} · Used ${cell.used}`,
          `Entitlement source: ${cell.source}`,
          ...flags.map((f) => `${FLAG_META[f].label}: ${FLAG_META[f].hint}`),
          'Click to adjust',
        ].join('\n')
      }
    >
      <div className={cn('font-medium', tone)}>
        {num(cell.available)}
        <span className="text-muted-foreground"> / {num(cell.entitled)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {cell.used > 0 ? `${num(cell.used)} used` : '—'}
      </div>
    </TableCell>
  );
}

function EmptyState({
  icon, title, body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-10 text-center">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
