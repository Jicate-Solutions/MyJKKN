'use client';

// Month-by-month leave ledger for one (staff, leave type, year).
//
// Shared by three surfaces — the admin Adjust dialog, the Staff Balances row
// expander, and the staff member's own leave page — deliberately as ONE
// component. The whole point of the feature is that HR and the staff member
// stop seeing different numbers for the same person; three copies of this table
// would reintroduce exactly that.
//
// TWO COLUMN GROUPS, AND THEY MEAN DIFFERENT THINGS:
//
//   "In this month"      — what the calendar did: days credited, the balance
//                          carried in, leave actually taken, balance carried
//                          out. Reads like a passbook.
//   "This month's day"   — where THAT month's credit ended up, wherever it was
//                          eventually spent. June can show "taken 0" and still
//                          show its day consumed by a request dated in July.
//
// Interleaving them would make June look self-contradictory. They are drawn as
// separate groups with a divider, and the header says which is which.
//
// EDITING is opt-in via `editable` and passed only by the admin Adjust dialog.
// It is additionally gated on hr.leave.policies.write, mirroring the RPC — the
// control is hidden rather than shown and refused.

import { Fragment, useState } from 'react';
import { AlertCircle, Info, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import {
  useLeaveMonthlyLedger,
  useSetLeaveMonthEntry,
} from '@/hooks/hr/use-hr-leave-types';
import { useAuth } from '@/hooks/use-auth';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import type {
  HRLeaveLedgerDraw,
  HRLeaveMonthEntryMode,
  HRLeaveMonthlyLedgerRow,
} from '@/types/hr-leave-staff-balances';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a date-only string without going through Date.
 *
 * `new Date('2026-06-01')` parses as UTC midnight and then renders in the
 * viewer's zone, so west-of-UTC users see May. Every date the ledger returns is
 * a plain calendar date with no time component, so splitting the string is both
 * correct and cheaper than pulling in a date library for it.
 */
function fmtMonth(iso: string): string {
  return MONTHS_FULL[Number(iso.split('-')[1]) - 1];
}

/**
 * The academic year the whole table covers, e.g. "1 June 2026 - 31 May 2027".
 *
 * Derived from the first and last rows rather than taken as a prop: the RPC
 * already tiles exactly the year's months, so the rows ARE the span and the two
 * cannot drift apart.
 *
 * Day count comes from Date(y, m, 0) with NUMERIC arguments -- constructing a
 * date from numbers is local-time and safe. Parsing 'YYYY-MM-DD' as a string is
 * what shifts west-of-UTC viewers back a day, which is why fmtMonth splits
 * instead.
 */
function fmtYearSpan(first: string, last: string): string {
  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  const lastDay = new Date(ly, lm, 0).getDate();
  return `1 ${MONTHS_FULL[fm - 1]} ${fy} – ${lastDay} ${MONTHS_FULL[lm - 1]} ${ly}`;
}

function fmtDay(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** Trailing zeros make a 12-row table hard to scan; 0.5 still has to show. */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}

function drawLabel(d: HRLeaveLedgerDraw): string {
  if (d.status === 'opening_adjustment') return `Unexplained (${num(d.days)})`;
  if (d.status === 'manual') return `Recorded by admin (${num(d.days)})`;
  const when = d.start_date === d.end_date
    ? fmtDay(d.start_date)
    : `${fmtDay(d.start_date)}–${fmtDay(d.end_date)}`;
  const tail = d.status === 'approved' ? '' : ' · awaiting approval';
  return `${when} (${num(d.days)})${tail}`;
}

interface Props {
  staffId: string | null;
  leaveTypeId: string | null;
  hrAcademicYearId: string | null;
  leaveTypeName: string;
  /** Admin surfaces only. Still gated on hr.leave.policies.write below. */
  editable?: boolean;
}

export function LeaveMonthlyLedger({
  staffId, leaveTypeId, hrAcademicYearId, leaveTypeName, editable = false,
}: Props) {
  const { data, isLoading, error } = useLeaveMonthlyLedger(
    staffId, leaveTypeId, hrAcademicYearId
  );
  // Super admin ONLY, matching hr_leave_month_entry_set and
  // hr_leave_balance_adjust. Gate on isSuperAdmin rather than a permission key:
  // these levers were moved off hr.leave.policies.write precisely because that
  // key reaches further than it appears to (user_roles and Director handovers
  // both grant it), so re-deriving access from a key would silently reopen it.
  // Mirrors the SERVER's check exactly. public.is_super_admin() reads ONLY
  // profiles.is_super_admin -- it does NOT accept role = 'super_admin', unlike
  // the `is_super_admin === true || role === 'super_admin'` pattern used
  // elsewhere in this app. The two agree in the data today (15 profiles each,
  // no divergence), but widening here would offer controls the RPC then refuses.
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;
  const [editing, setEditing] = useState<string | null>(null);

  const canEdit = editable && isSuperAdmin;

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    );
  }

  if (error) {
    // Supabase errors are plain objects, not Error instances — instanceof would
    // fall through and print "Unknown error" for every RLS denial.
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  const rows = (data ?? []) as HRLeaveMonthlyLedgerRow[];

  if (rows.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          {leaveTypeName} is not granted month by month, so it has no monthly
          split. Only day-based leave that accrues monthly builds a ledger.
        </AlertDescription>
      </Alert>
    );
  }

  const todayKey = new Date().toISOString().slice(0, 7);
  const adjustment = rows[0]?.opening_adjustment ?? 0;
  const cols = canEdit ? 8 : 7;

  return (
    <div className="space-y-3">
      {adjustment > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>{num(adjustment)} day(s)</strong> are counted as used with no
            leave request behind them — a balance carried in from the legacy HR
            system, or a correction made here. They are drawn from the earliest
            months.
            {canEdit && ' Use Reclassify on a month to say where they really belong.'}
          </AlertDescription>
        </Alert>
      )}

      {/* The year is stated once, here. Repeating it per row as "Jun 26" read
          as a day of the month -- June 26th -- which is the opposite of what a
          column of months should say. */}
      <p className="text-xs text-muted-foreground">
        Academic year <strong>{fmtYearSpan(rows[0].month_start, rows[rows.length - 1].month_start)}</strong>
        {' '}· each month’s credit is available from the 1st of that month.
      </p>

      {/* Wide content scrolls inside its own container; the page body never
          scrolls sideways. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[104px]" />
              <TableHead colSpan={4} className="text-center text-xs font-medium">
                In this month
              </TableHead>
              <TableHead colSpan={canEdit ? 3 : 2} className="border-l text-center text-xs font-medium">
                Where this month&apos;s credit went
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Accrued</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Taken</TableHead>
              <TableHead className="text-right">Closing</TableHead>
              <TableHead className="border-l text-right">Used</TableHead>
              <TableHead>Drawn by</TableHead>
              {canEdit && <TableHead className="w-[40px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const future = r.month_start.slice(0, 7) > todayKey;
              const current = r.month_start.slice(0, 7) === todayKey;
              return (
                <Fragment key={r.month_start}>
                  <TableRow
                    className={[
                      future ? 'text-muted-foreground' : '',
                      current ? 'bg-muted/40' : '',
                    ].join(' ')}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {fmtMonth(r.month_start)}
                      {current && <span className="ml-1 text-[10px] uppercase">now</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(r.accrued_days)}
                      {/* A future month has not been earned yet. Saying so stops
                          the year-end total reading as spendable today. */}
                      {future && <span className="ml-1 text-[10px]">proj.</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.opening_days)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.taken_in_month > 0 ? num(r.taken_in_month) : '—'}
                      {r.pending_in_month > 0 && (
                        <span className="ml-1 text-[10px] text-amber-600">
                          +{num(r.pending_in_month)}
                        </span>
                      )}
                      {/* An overridden month is admin-set outright: the figure
                          REPLACES its approved requests rather than adding to
                          them, so it is flagged rather than itemised. */}
                      {r.is_overridden && (
                        <span
                          className="ml-1 text-[10px] text-blue-600"
                          title={`Set by an admin. Approved requests in this month come to ${num(r.applications_days)} day(s).`}
                        >
                          set
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        r.closing_days < 0 ? 'text-destructive' : ''
                      }`}
                    >
                      {num(r.closing_days)}
                    </TableCell>
                    <TableCell className="border-l text-right tabular-nums">
                      {r.consumed_days + r.reserved_days > 0
                        ? num(r.consumed_days + r.reserved_days)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.drawn_by.length === 0 ? (
                        <span className="text-muted-foreground">
                          {future ? '' : 'carried forward'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.drawn_by.map((d, i) => (
                            <Badge
                              key={`${d.id ?? 'adj'}-${i}`}
                              variant={d.status === 'approved' ? 'secondary' : 'outline'}
                              className="font-normal"
                            >
                              {drawLabel(d)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={`Set the days taken in ${fmtMonth(r.month_start)}`}
                          onClick={() =>
                            setEditing((prev) =>
                              prev === r.month_start ? null : r.month_start
                            )
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {canEdit && editing === r.month_start && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={cols} className="bg-muted/30 p-4">
                        {/* Keyed on the month so switching rows remounts with
                            fresh state rather than carrying the last month's
                            input across. */}
                        <MonthEntryEditor
                          key={r.month_start}
                          row={r}
                          staffId={staffId as string}
                          leaveTypeId={leaveTypeId as string}
                          hrAcademicYearId={hrAcademicYearId as string}
                          adjustment={adjustment}
                          onDone={() => setEditing(null)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>Closing</strong> is what carries into the next month — an unused
        month is not lost, it simply stays in the balance. <strong>Drawn by</strong>{' '}
        shows which requests spent that month&apos;s day, oldest month first, so a
        June day taken in September appears on the June row. A negative closing
        means more was spent by that month than had accrued by then.
      </p>
    </div>
  );
}

/**
 * Set the TOTAL days taken in one month.
 *
 * This edits the month, not a "manual extra". Whatever number is typed becomes
 * the month's figure, overriding approved requests dated in it — which is why
 * `applications_days` is shown: the admin must see what they are overriding
 * rather than discover later that three approved half-days stopped counting.
 *
 * The mode choice is the whole risk surface, so it is two labelled buttons with
 * their consequence spelled out rather than a dropdown: `add` moves the year
 * total, `reclassify` does not. Choosing wrong over- or under-counts, and
 * neither shows up as an error.
 */
function MonthEntryEditor({
  row, staffId, leaveTypeId, hrAcademicYearId, adjustment, onDone,
}: {
  row: HRLeaveMonthlyLedgerRow;
  staffId: string;
  leaveTypeId: string;
  hrAcademicYearId: string;
  adjustment: number;
  onDone: () => void;
}) {
  const mutation = useSetLeaveMonthEntry();
  // Seeded with what the month currently reads, so leaving it untouched and
  // pressing Save is a no-op rather than silently zeroing the month.
  const [total, setTotal] = useState(String(row.taken_in_month));
  const [mode, setMode] = useState<'add' | 'reclassify'>(
    adjustment > 0 ? 'reclassify' : 'add'
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = mutation.isPending;
  const value = Number(total);
  const invalid = total.trim() === '' || Number.isNaN(value) || value < 0;
  const delta = invalid ? 0 : value - row.taken_in_month;

  const run = (payloadMode: HRLeaveMonthEntryMode, days: number | null) => {
    setError(null);
    if (payloadMode !== 'clear' && invalid) {
      setError('Enter a number of days that is zero or more.');
      return;
    }
    if (reason.trim() === '') {
      setError('A reason is required — it is what makes this adjustment auditable.');
      return;
    }
    mutation.mutate(
      {
        employee_id: staffId,
        leave_type_id: leaveTypeId,
        hr_academic_year_id: hrAcademicYearId,
        month_start: row.month_start,
        days,
        mode: payloadMode,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(
            payloadMode === 'clear'
              ? `${fmtMonth(row.month_start)} is back to what its leave requests say.`
              : `${fmtMonth(row.month_start)} set to ${num(days ?? 0)} day(s).`
          );
          onDone();
        },
        // The reclassify cap arrives as a 23514 whose message names the days
        // still available — far more useful than a generic failure.
        onError: (err) => setError(getErrorMessage(err)),
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <Label htmlFor="me-total" className="text-xs">
            Total days in {fmtMonth(row.month_start)}
          </Label>
          <Input
            id="me-total"
            type="number"
            min={0}
            step={0.5}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="mt-1 h-8"
            disabled={busy}
          />
        </div>
        <div className="flex-1 min-w-[280px]">
          <Label className="text-xs">How should the year total change?</Label>
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'add' ? 'default' : 'outline'}
              onClick={() => setMode('add')}
              disabled={busy}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'reclassify' ? 'default' : 'outline'}
              onClick={() => setMode('reclassify')}
              disabled={busy || adjustment <= 0}
              title={
                adjustment <= 0
                  ? 'Nothing unexplained left to reclassify — every used day is already accounted for'
                  : undefined
              }
            >
              Reclassify
            </Button>
          </div>
        </div>
      </div>

      {/* What is being overridden. Silence here is how an admin discovers a
          month later that approved requests stopped counting. */}
      {row.applications_days > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>{num(row.applications_days)} day(s)</strong> in this month come
            from approved leave requests. Saving a different total overrides them —
            the requests stay on record but stop counting toward the balance.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        {mode === 'add' ? (
          <>
            <strong>Add</strong> — the year total moves by{' '}
            <strong>{delta >= 0 ? '+' : ''}{num(delta)}</strong> day(s), so this
            person&apos;s available balance changes by the same amount.
          </>
        ) : (
          <>
            <strong>Reclassify</strong> — the year total does not move; these days
            are already counted and only sat in the wrong month. At most{' '}
            <strong>{num(adjustment)}</strong> more day(s) can be reclassified.
          </>
        )}
      </p>

      <div>
        <Label htmlFor="me-reason" className="text-xs">Reason</Label>
        <Textarea
          id="me-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. CL taken 14 Aug, recorded on the paper register only"
          className="mt-1"
          rows={2}
          disabled={busy}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {/* Only meaningful once an override exists; clearing hands the month
            back to its own leave requests. */}
        {row.is_overridden && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => run('clear', null)}
            disabled={busy || reason.trim() === ''}
          >
            Remove override
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => run(mode, value)}
          disabled={busy || reason.trim() === ''}
        >
          {busy ? 'Saving…' : 'Save month total'}
        </Button>
      </div>
    </div>
  );
}
