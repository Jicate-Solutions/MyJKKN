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
 *  * TWO column groups, in two currencies. Day types (request_category='leave')
 *    read available/entitled with days used underneath. Short Time Off types
 *    read remaining/allowance in MINUTES for the current period, because that
 *    is the budget the database actually enforces: hr_trig_update_leave_balance
 *    skips the category entirely, so `used` on hr_leave_balances never moves
 *    and a days column for STO would show a permanently full bar meaning
 *    nothing. Compensatory Off has no column at all — it is credit-backed and
 *    its ledger is hr_comp_off_credits, not this table.
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
import { formatMinutes } from '@/types/hr-leave-types';
import type {
  HRStaffBalanceCell,
  HRStaffBalanceStoCell,
  HRStaffBalanceStoType,
} from '@/types/hr-leave-staff-balances';

import { AdjustBalanceDialog, type AdjustTarget } from './adjust-balance-dialog';
import {
  FLAG_META,
  cellFlags,
  cellTone,
  rowNeedsAttention,
  stoCellTone,
} from './balance-flags';
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
  const stoTypes = useMemo(() => data?.sto_types ?? [], [data?.sto_types]);
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
      // Minutes as raw integers rather than the "1h 30m" the table renders: a
      // spreadsheet column has to be summable, and the period is its own column.
      //
      // The column SHAPE is chosen from the TYPE, never from the cell. Cells
      // carry a per-person limit_mode (an hr_leave_type_assignments row can
      // override it for one staff member), and branching on that would emit a
      // different key set for different rows of the same export —
      // XLSX.json_to_sheet unions the keys it is given, so the sheet would grow
      // two half-populated column groups for one leave type.
      for (const t of data.sto_types) {
        const c = s.sto?.[t.id];
        const byRequests = t.limit_mode === 'request_count';
        const unit = byRequests ? '' : ' (min)';
        const usable = !!c && c.limit_mode !== 'none' && !c.window_unresolved;

        row[`${t.name} — Allowance${unit}`] = usable
          ? ((byRequests ? c.max_requests : c.total_minutes) ?? '')
          : 'No limit';
        row[`${t.name} — Used${unit}`] = c
          ? (byRequests ? c.requests_used : c.minutes_used)
          : '';
        row[`${t.name} — Remaining${unit}`] = usable
          ? ((byRequests ? c.requests_left : c.minutes_left) ?? '')
          : '';
        row[`${t.name} — Period`] =
          c?.period_start && c?.period_end ? `${c.period_start} → ${c.period_end}` : '';
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
      ) : types.length === 0 && stoTypes.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          title="No leave types configured"
          body={`${data?.institution_name ?? 'This institution'} has no active leave or short-time-off type, so there is nothing to show. Compensatory Off is tracked separately — it is credit-backed and draws on hr_comp_off_credits, not on a balance.`}
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
              Leave cells read <strong>available / entitled</strong> in days, with days
              used underneath. {data?.year_name ? `Year ${data.year_name}.` : ''}
              {stoTypes.length > 0 && (
                <>
                  {' '}
                  Short Time Off cells read <strong>remaining / allowance</strong> in
                  time for the current period — pending requests are already counted,
                  because the database treats them as committed.
                </>
              )}
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
                    {stoTypes.map((t, i) => (
                      <TableHead
                        key={t.id}
                        className={cn(
                          'text-right whitespace-nowrap',
                          // One border marks where days stop and minutes start.
                          // Without it the two currencies read as one row of
                          // comparable numbers, which is the misreading this
                          // whole column group exists to prevent.
                          i === 0 && 'border-l'
                        )}
                      >
                        {t.name}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({stoAllowanceLabel(t)})
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
                        colSpan={types.length + stoTypes.length + 5}
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
                        {stoTypes.map((t, i) => (
                          <StoCell
                            key={t.id}
                            cell={s.sto?.[t.id]}
                            typeName={t.name}
                            first={i === 0}
                          />
                        ))}
                        <TableCell>
                          {/* Row-level entry point. Which cell it opens is
                              chosen in the dialog when several are flagged.
                              Disabled with no day types: the dialog adjusts a
                              day entitlement, and an STO budget has none to
                              adjust — its minutes are derived from the
                              applications themselves. Reachable now that the
                              table renders for an STO-only institution. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={types.length === 0}
                            title={
                              types.length === 0
                                ? 'Nothing to adjust — this institution runs no day-based leave type'
                                : `Adjust ${s.name}'s balances`
                            }
                            onClick={() => {
                              const t = types[0];
                              if (!t) return;
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

/**
 * Header suffix for an STO column: the TYPE's own allowance, the counterpart to
 * "(12d)" on a day column. Per-person figures can differ — an
 * hr_leave_type_assignments row overrides the whole limit block for one staff
 * member or department — so the number in the cell is the one that binds.
 */
function stoAllowanceLabel(t: HRStaffBalanceStoType): string {
  if (t.limit_mode === 'total_duration') {
    return `${formatMinutes(t.total_minutes)}/${t.limit_period ?? 'month'}`;
  }
  if (t.limit_mode === 'request_count') {
    return `${t.max_requests ?? 0}×/${t.limit_period ?? 'month'}`;
  }
  return 'no limit';
}

/**
 * One Short Time Off cell — remaining / allowance for the period, with the
 * amount already committed underneath.
 *
 * Not clickable, unlike BalanceCell. There is nothing to adjust: STO consumption
 * is derived from hr_leave_applications on every read, not stored on a row an
 * admin could correct. Changing the figure means changing the requests.
 */
function StoCell({
  cell, typeName, first,
}: {
  cell: HRStaffBalanceStoCell | undefined;
  typeName: string;
  first: boolean;
}) {
  const edge = first ? 'border-l' : '';

  if (!cell) {
    return (
      <TableCell className={cn('text-right text-muted-foreground', edge)}>—</TableCell>
    );
  }

  // Reported separately from limit_mode 'none' on purpose: the database refuses
  // every submission in this state, so "no limit" would be the opposite of the
  // truth.
  if (cell.window_unresolved) {
    return (
      <TableCell
        className={cn('text-right text-amber-600 dark:text-amber-400', edge)}
        title={`The ${cell.limit_period ?? 'period'} window for ${typeName} could not be resolved, so every request is refused. Check the HR academic year covers today.`}
      >
        <div className="font-medium">Period?</div>
        <div className="text-xs">unresolved</div>
      </TableCell>
    );
  }

  if (cell.limit_mode === 'none') {
    return (
      <TableCell
        className={cn('text-right text-muted-foreground', edge)}
        title={`${typeName} carries no per-period limit. ${cell.requests_used} request(s), ${formatMinutes(cell.minutes_used)} so far this ${cell.limit_period ?? 'period'}.`}
      >
        <div>No limit</div>
        <div className="text-xs">
          {cell.requests_used > 0 ? `${cell.requests_used} taken` : '—'}
        </div>
      </TableCell>
    );
  }

  const byRequests = cell.limit_mode === 'request_count';
  const left = byRequests ? cell.requests_left : cell.minutes_left;
  const total = byRequests ? cell.max_requests : cell.total_minutes;
  const used = byRequests ? cell.requests_used : cell.minutes_used;
  const fmt = (n: number | null | undefined) =>
    byRequests ? String(n ?? 0) : formatMinutes(n ?? 0);

  return (
    <TableCell
      className={cn('text-right tabular-nums', edge)}
      title={[
        `${typeName} — ${cell.period_start} to ${cell.period_end}`,
        byRequests
          ? `${cell.requests_used} of ${cell.max_requests ?? 0} request(s) committed`
          : `${formatMinutes(cell.minutes_used)} of ${formatMinutes(cell.total_minutes)} committed`,
        'Pending requests count — the database treats them as spent.',
        cell.min_minutes || cell.max_minutes
          ? `Per request: ${formatMinutes(cell.min_minutes)} to ${formatMinutes(cell.max_minutes)}`
          : null,
        cell.source && cell.source !== 'type'
          ? `Limits come from a ${cell.source} assignment, not the leave type.`
          : null,
        cell.exhausted ? FLAG_META.sto_exhausted.hint : null,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <div className={cn('font-medium', stoCellTone(cell))}>
        {fmt(left)}
        <span className="text-muted-foreground"> / {fmt(total)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {used > 0 ? `${fmt(used)} used` : '—'}
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
