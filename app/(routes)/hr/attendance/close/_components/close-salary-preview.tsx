'use client';

// The salary register as it WILL be, shown before the month is frozen.
//
// Presentational on purpose: the page owns the query so it can re-run the
// projection at the moment of closing and refuse a confirmation that has gone
// stale. A panel that fetched its own data could only ever show figures, never
// guarantee they are the ones being closed on.
//
// The numbers are not an estimate. Day counts come from
// fn_hr_attendance_period_projection — the same SQL the close runs to populate
// hr_attendance_period_summaries — and the money from computeRegisterLine, the
// same pure function the issued register uses.

import { Fragment, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useRegularizationReasons,
  useRegularizeDay,
  useStaffAttendanceDays,
} from '@/hooks/hr/use-attendance-periods';
import { EXCLUSION_LABELS } from '@/lib/services/hr/payroll/salary-register-service';
import { getErrorMessage } from '@/lib/utils';
import type { SalaryClosePreview } from '@/types/hr-payroll';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

/** Trailing .0 on every day count makes a long table hard to scan. */
function days(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * A punch, as a local clock time.
 *
 * in_at/out_at are timestamptz, so toLocaleTimeString renders them in the
 * viewer's zone — correct here, unlike the date-only columns elsewhere in this
 * app which must never go through Date at all.
 */
function punch(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The punch pair, or an explicit statement that there was none.
 *
 * 272 of 286 absences in one institution-month have NO punch at all, so a bare
 * "— – —" reads as a broken column rather than as the finding it is: no punch
 * means the absence is probably genuine, whereas an absence WITH punches is a
 * shift or import fault and is the row actually worth correcting.
 */
function punchPair(inAt: string | null, outAt: string | null): string {
  if (!inAt && !outAt) return 'No punch';
  return `${punch(inAt)} – ${punch(outAt)}`;
}

/**
 * The nine statuses the evaluator produces. Anything outside this set is a day
 * it could not judge — the "unjudged" days the preview flags in red.
 */
const JUDGED_CODES = new Set([
  'PRESENT', 'REGULARIZED', 'HALF_DAY', 'ABSENT', 'WEEKLY_OFF',
  'HOLIDAY', 'LEAVE', 'ON_DUTY', 'on_clinical_posting',
]);

/**
 * Which days are worth offering a correction on.
 *
 * ABSENT only, plus anything the evaluator could not judge. A present, weekly
 * off, holiday, leave or on-duty day is already accounted for and costs nobody
 * pay, so listing it is noise in a table that exists to find the days that DO.
 * Unjudged days are included because they silently become unpaid — the preview
 * warns about them in red, and it would be contradictory to warn and then offer
 * no way to fix them.
 */
function isCorrectable(code: string): boolean {
  return code === 'ABSENT' || !JUDGED_CODES.has(code);
}

/**
 * What a day can be corrected to.
 *
 * The nine active status codes, all global (institution_id NULL). WEEKLY_OFF and
 * HOLIDAY are included because a day wrongly marked as working is exactly the
 * kind of error that inflates somebody's LOP.
 */
const STATUS_CODES = [
  'PRESENT', 'REGULARIZED', 'HALF_DAY', 'ABSENT', 'ON_DUTY',
  'LEAVE', 'WEEKLY_OFF', 'HOLIDAY', 'on_clinical_posting',
] as const;

interface Props {
  preview: SalaryClosePreview | undefined;
  isLoading: boolean;
  error: unknown;
  /** The fingerprint the operator ticked, or null. */
  verifiedFingerprint: string | null;
  onVerify: (fingerprint: string | null) => void;
  /** Super admin or HR Head. The RPC enforces it again server-side. */
  canRegularize: boolean;
}

export function CloseSalaryPreview({
  preview, isLoading, error, verifiedFingerprint, onVerify, canRegularize,
}: Props) {
  const [openStaff, setOpenStaff] = useState<string | null>(null);
  if (isLoading) {
    return (
      <div className='space-y-2 py-2'>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <Loader2 className='h-3 w-3 animate-spin' />
          Working out what each person will be paid…
        </div>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className='h-7 w-full' />)}
      </div>
    );
  }

  if (error) {
    // Supabase errors are plain objects, not Error instances.
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription className='text-xs'>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!preview) return null;

  const verified = verifiedFingerprint === preview.fingerprint;

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm'>
        <Figure label='On the roster' value={String(preview.roster_count)} />
        <Figure label='Will be paid' value={String(preview.payable.length)} />
        <Figure label='Not paid' value={String(preview.excluded.length)} />
        <Figure label='Total net pay' value={inr.format(preview.total_net_pay)} />
        <Figure label='Month standard' value={`${days(preview.period_basis)} days`} />
      </div>

      {/* Days the evaluator could not judge feed straight into pay. Naming them
          here is the difference between catching it now and finding it in a
          frozen register. */}
      {preview.unprocessed_days > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription className='text-xs'>
            <strong>{preview.unprocessed_days} day(s)</strong> could not be judged by the
            attendance evaluator and are counted as unpaid in the figures below. Fix
            those days before closing, or the pay will be wrong.
          </AlertDescription>
        </Alert>
      )}

      <div className='max-h-[40vh] overflow-auto rounded-md border'>
        <Table>
          <TableHeader className='sticky top-0 bg-background'>
            <TableRow>
              {canRegularize && <TableHead className='w-[36px]' />}
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className='text-right'>Working</TableHead>
              <TableHead className='text-right'>Paid</TableHead>
              <TableHead className='text-right'>Unpaid</TableHead>
              <TableHead className='text-right'>Gross</TableHead>
              <TableHead className='text-right'>Net pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.payable.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canRegularize ? 8 : 7} className='text-center text-sm text-muted-foreground'>
                  Nobody at this institution will be paid for this month.
                </TableCell>
              </TableRow>
            ) : (
              preview.payable.map((r) => (
                <Fragment key={r.staff_id}>
                <TableRow>
                  {canRegularize && (
                    <TableCell className='p-0 pl-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7'
                        title={`Correct a day for ${r.staff_name}`}
                        onClick={() =>
                          setOpenStaff((prev) => (prev === r.staff_id ? null : r.staff_id))
                        }
                      >
                        {openStaff === r.staff_id
                          ? <ChevronDown className='h-3.5 w-3.5' />
                          : <ChevronRight className='h-3.5 w-3.5' />}
                      </Button>
                    </TableCell>
                  )}
                  <TableCell className='whitespace-nowrap font-mono text-xs'>
                    {r.employee_code ?? '—'}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {r.staff_name}
                    {r.unprocessed_days > 0 && (
                      <Badge variant='destructive' className='ml-2 font-normal'>
                        {r.unprocessed_days} unjudged
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{days(r.working_days)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{days(r.paid_days)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${r.unpaid_days > 0 ? 'text-destructive' : ''}`}
                  >
                    {r.unpaid_days > 0 ? days(r.unpaid_days) : '—'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{inr.format(r.monthly_gross)}</TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>
                    {inr.format(r.net_pay)}
                  </TableCell>
                </TableRow>
                {canRegularize && openStaff === r.staff_id && (
                  <TableRow className='hover:bg-transparent'>
                    <TableCell colSpan={8} className='bg-muted/20 p-3'>
                      {/* Keyed on the staff member so switching rows remounts
                          with empty inputs instead of carrying the last
                          person's reason across. */}
                      <StaffDayEditor
                        key={r.staff_id}
                        staffId={r.staff_id}
                        staffName={r.staff_name}
                        year={preview.year}
                        month={preview.month}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Kept OUT of the table above. With 408 of 755 staff platform-wide having
          no salary recorded, mixing them in would bury the rows that need
          checking. */}
      {preview.excluded.length > 0 && (
        <details className='rounded-md border p-3'>
          <summary className='cursor-pointer text-sm font-medium'>
            {preview.excluded.length} will not be paid — see why
          </summary>
          <div className='mt-2 max-h-[24vh] overflow-auto'>
            <Table>
              <TableBody>
                {preview.excluded.map((r) => (
                  <TableRow key={r.staff_id}>
                    <TableCell className='whitespace-nowrap font-mono text-xs'>
                      {r.employee_code ?? '—'}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>{r.staff_name}</TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      {EXCLUSION_LABELS[r.reason]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}

      <Alert>
        <Info className='h-4 w-4' />
        <AlertDescription className='text-xs'>
          These are the figures the closed month will produce. They are computed from
          the same rules the close applies, so the issued register will match — provided
          nothing changes between now and closing.
        </AlertDescription>
      </Alert>

      <label className='flex items-start gap-2 rounded-md border p-3 text-sm'>
        <Checkbox
          checked={verified}
          onCheckedChange={(c) => onVerify(c ? preview.fingerprint : null)}
          className='mt-0.5'
        />
        <span>
          I have checked these figures and they are correct.
          <span className='block text-xs text-muted-foreground'>
            Required before the month can be closed. If the attendance changes after you
            tick this, the confirmation is dropped and you will be asked to check again.
          </span>
        </span>
      </label>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='font-medium tabular-nums'>{value}</p>
    </div>
  );
}

/**
 * Correct one of a staff member's days, from inside the close preview.
 *
 * This is the ONLY place a day can be regularized now: self-service was
 * withdrawn from the attendance log (migration 20260906200000 revoked
 * hr.attendance.regularize_self from all 76 roles that held it). Corrections
 * happen here because here is where you can see what a wrong day does to
 * somebody's pay before the month is frozen.
 *
 * No approval step — only a super admin or HR Head can reach it, and HR Head is
 * the approver. An approved hr_attendance_regularizations row is still written
 * server-side so the audit trail matches staff-raised corrections.
 */
function StaffDayEditor({
  staffId, staffName, year, month,
}: {
  staffId: string;
  staffName: string;
  year: number;
  month: number;
}) {
  const { data: dayRows, isLoading } = useStaffAttendanceDays(staffId, year, month);
  const mutation = useRegularizeDay();

  const { data: reasons } = useRegularizationReasons();

  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('PRESENT');
  const [reasonId, setReasonId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (date: string) => {
    setError(null);
    if (reasonId === '') {
      setError('Pick a reason — it is what makes this correction auditable.');
      return;
    }
    mutation.mutate(
      { staffId, date, statusCode: status, reasonCodeId: reasonId },
      {
        onSuccess: (res) => {
          toast.success(
            `${staffName}: ${date} changed from ${String(res.from ?? '?')} to ${String(res.to ?? status)}.`,
          );
          setEditing(null);
          setReasonId('');
        },
        // The RPC names the reason — closed month, excluded institution, wrong
        // status code — so it is surfaced verbatim.
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  };

  if (isLoading) {
    return (
      <div className='space-y-1'>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-6 w-full' />)}
      </div>
    );
  }

  // Only the days that cost somebody pay and might be wrong.
  const all = dayRows ?? [];
  const rows = all.filter((d) => isCorrectable(d.status_code));

  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        Showing the <strong>{rows.length}</strong> unpaid or unjudged day(s) of{' '}
        {all.length} in the month — present, weekly off, holiday, leave and on-duty
        days are left out because they already cost nothing. Correcting a day
        updates {staffName}&apos;s paid days and net pay above, and clears your
        verification so the new figures get checked.
      </p>

      {error && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription className='text-xs'>{error}</AlertDescription>
        </Alert>
      )}

      <div className='max-h-[30vh] overflow-auto rounded-md border bg-background'>
        <Table>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className='text-center text-xs text-muted-foreground'>
                  {all.length === 0
                    ? 'No attendance records for this month — nothing to correct.'
                    : 'No absent or unjudged days this month — nothing needs correcting.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((d) => (
                <TableRow key={d.record_id}>
                  <TableCell className='w-[110px] whitespace-nowrap font-mono text-xs'>
                    {d.work_date}
                  </TableCell>
                  <TableCell className='w-[130px]'>
                    <Badge variant='outline' className='font-normal'>{d.status_code}</Badge>
                  </TableCell>
                  {/* The punches are the evidence for the decision: an absent day
                      with no in/out is a genuine absence, one with both is
                      usually a shift or import problem. */}
                  <TableCell
                    className={`w-[140px] whitespace-nowrap text-xs tabular-nums ${
                      d.in_at || d.out_at ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                    }`}
                    title={
                      d.in_at || d.out_at
                        ? 'Marked absent despite a punch — usually a shift-timing or import fault.'
                        : 'No biometric punch on this day.'
                    }
                  >
                    {punchPair(d.in_at, d.out_at)}
                  </TableCell>
                  <TableCell>
                    {editing === d.work_date ? (
                      <div className='flex flex-wrap items-center gap-2'>
                        <Select value={status} onValueChange={setStatus}>
                          <SelectTrigger className='h-8 w-[170px]'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_CODES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Catalog, not free text: these ids are what make
                            "how often was the device offline" answerable. */}
                        <Select value={reasonId} onValueChange={setReasonId}>
                          <SelectTrigger className='h-8 min-w-[230px] flex-1'>
                            <SelectValue placeholder='Reason…' />
                          </SelectTrigger>
                          <SelectContent>
                            {(reasons ?? []).map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size='sm'
                          className='h-8'
                          disabled={mutation.isPending || reasonId === ''}
                          onClick={() => submit(d.work_date)}
                        >
                          {mutation.isPending ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='h-8'
                          disabled={mutation.isPending}
                          onClick={() => { setEditing(null); setError(null); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-7 text-xs'
                        onClick={() => {
                          setEditing(d.work_date);
                          setStatus(d.status_code || 'PRESENT');
                          setReasonId('');
                          setError(null);
                        }}
                      >
                        Correct this day
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

