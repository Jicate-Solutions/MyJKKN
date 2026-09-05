'use client';

/**
 * Apply Leave — right-side drawer.
 *
 * Offers ONLY types whose request_category is 'leave' (Casual, Half Pay,
 * On-Duty, Vacation). Permission is hourly and lives on the Short Time Off
 * tab; Compensatory Off is an earned credit and lives on its own tab. Before
 * this split all six appeared in one dropdown.
 *
 * The filter is on request_category, not on a hardcoded list of codes — each
 * of the 11 organizations maintains its own catalog.
 */

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus } from 'lucide-react';

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useApplyLeave } from '@/hooks/hr/use-leave';
import { useLeavePeriodUsage } from '@/hooks/hr/use-hr-leave-types';
import { useMyApplications } from '@/hooks/hr/use-leave';
import { Progress } from '@/components/ui/progress';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { useClosedAttendanceMonths } from '@/hooks/hr/use-attendance-records';
import { closedMonthsInRange, describeClosedMonths } from '@/types/hr-attendance';
import { getErrorMessage } from '@/lib/utils';
import { formatDays } from './format';
import { LeaveDocumentUpload } from './leave-document-upload';
import { leaveDocumentRequirement } from '@/lib/hr/leave-document-rule';
import { LIMIT_PERIOD_LABELS } from '@/types/hr-leave-types';
import type { HRLeaveApplicationWithType, LeaveDocument, LeaveDurationType } from '@/types/hr';
import { toast } from 'sonner';

const DURATIONS: Array<{ value: LeaveDurationType; label: string; days: number }> = [
  { value: 'full', label: 'Full day', days: 1 },
  { value: 'first_half', label: 'First half (AM)', days: 0.5 },
  { value: 'second_half', label: 'Second half (PM)', days: 0.5 },
];

/** Consumed share of the entitlement, clamped — an over-drawn type is still 100%. */
function pct(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={strong ? 'text-base font-semibold' : 'text-sm font-medium'}>{value}</p>
    </div>
  );
}

export function ApplyLeaveDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useTimeOffContext();
  const mutation = useApplyLeave();

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationType, setDurationType] = useState<LeaveDurationType>('full');
  const [reason, setReason] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Picked but NOT uploaded — see LeaveDocumentUpload for why the upload
  // waits for Submit.
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * Drive results keyed by the File object itself, so a Submit that uploads
   * fine and then fails at /applications re-uses the file it already put in
   * Drive instead of duplicating it on the retry. A WeakMap because the key
   * IS the File — once the user removes it, the entry goes with it.
   */
  const uploadedRef = useRef<WeakMap<File, LeaveDocument>>(new WeakMap());

  const options = ctx.balancesFor('leave');
  const selected = options.find((b) => b.leave_type_id === leaveTypeId);

  const isSingleDay = !!startDate && startDate === endDate;

  // Half-day is offered only where the type allows it AND the request covers a
  // single date. Not memoized — a ternary over a module constant, and wrapping
  // it in useMemo defeats the React Compiler rather than helping.
  const durationOptions =
    selected?.allow_half_day && isSingleDay ? DURATIONS : DURATIONS.slice(0, 1);

  // Derived, not synced: computing the effective value avoids a
  // setState-inside-effect and the cascading render it causes.
  //
  // The isSingleDay term matters for correctness, not just UI. Applying the 0.5
  // factor across a range made a 5-day first_half request count as 2.5 days,
  // which then passed the balance and max_continuous_days checks it should
  // have failed.
  const effectiveDuration: LeaveDurationType =
    selected?.allow_half_day && isSingleDay ? durationType : 'full';

  /**
   * READ from the view, not recomputed.
   *
   * This was `entitled + carried_forward - used`, which cannot see a request
   * awaiting approval -- so the drawer offered 12 days while the database, which
   * does count them, refused. The view's `available` nets off pending and caps
   * at what has actually accrued.
   */
  const available = selected ? selected.available : null;

  // Inclusive day span, adjusted for a half-day request.
  const requestedDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    if (e < s) return 0;
    const span = Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
    return effectiveDuration === 'full' ? span : span * 0.5;
  }, [startDate, endDate, effectiveDuration]);

  const overBalance = available !== null && requestedDays > available;
  /**
   * Advance notice, checked here as well as on the server.
   *
   * It was server-only, so the whole form could be filled in and the rule only
   * surfaced as a 400 on Submit — which is how "You gave -38" reached a user.
   * Mirrors LeaveService.applyLeave exactly, including the is_emergency bypass:
   * a difference between the two would either block a request the server would
   * take, or promise one it will refuse.
   */
  const noticeDays = useMemo(() => {
    if (!startDate) return null;
    const today = new Date().toISOString().split('T')[0];
    return Math.floor(
      (new Date(startDate).getTime() - new Date(today).getTime()) / 86_400_000
    );
  }, [startDate]);

  const requiredNotice = selected?.min_advance_notice_days ?? 0;
  const shortNotice =
    !isEmergency && requiredNotice > 0 && noticeDays !== null && noticeDays < requiredNotice;

  const overContinuous =
    selected?.max_continuous_days != null && requestedDays > selected.max_continuous_days;

  // The per-period throttle ("2 Casual Leave days a month") sits alongside the
  // annual entitlement, so a request can be well inside the balance and still be
  // refused. Keyed on startDate, not today: trg_hla_leave_period_cap resolves the
  // window from the request's start_date, and a readout for a different month
  // would show a figure that is not the one enforced.
  const { data: periodUsage } = useLeavePeriodUsage(
    ctx.employeeId || undefined,
    leaveTypeId || undefined,
    ctx.hrAcademicYearId || null,
    startDate || undefined
  );

  const periodCapped = !!periodUsage?.limited && !periodUsage.window_unresolved;
  const periodWindowBroken = !!periodUsage?.limited && !!periodUsage.window_unresolved;
  const overPeriod = periodCapped && requestedDays > Number(periodUsage?.days_left ?? 0);

  // A month HR has closed refuses the request at the database
  // (trg_hla_block_locked_period). Catching it here means the user is told
  // before filling the form and — the reason this exists — before waiting on a
  // document upload that a 400 then throws away.
  const closedMonths = useClosedAttendanceMonths(ctx.institutionId || undefined);
  const closedHit = closedMonthsInRange(startDate, endDate, closedMonths);

  // An employment category excluded from HR cannot raise anything —
  // trg_hla_block_non_hr_staff refuses the insert. Say it before the form is
  // filled in rather than after.
  const notInHr = !ctx.isLoading && ctx.hasEmployeeRecord && !ctx.hrIncluded;

  /**
   * A live request already covering these dates. hr_trig_leave_enforce_no_overlap
   * refuses it outright — this says so while the dates are being picked instead
   * of after Submit.
   *
   * Reads the caller's own list, which the applications route caps at 50. Fine
   * for one person's requests, and the trigger is the enforcement point either
   * way, so a miss here costs a round trip and not a double booking.
   */
  const { data: mine } = useMyApplications(ctx.employeeId || undefined);
  const clash = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return null;
    // The route embeds hr_leave_types; the hook's return type predates that.
    const list = (mine?.data ?? []) as HRLeaveApplicationWithType[];
    return list.find((a) => {
      if ((a.hr_leave_types?.request_category ?? 'leave') !== 'leave') return false;
      if (!['pending', 'approved', 'escalated'].includes(a.status)) return false;
      return a.start_date <= endDate && startDate <= a.end_date;
    }) ?? null;
  }, [mine, startDate, endDate]);

  // Does THIS request need a certificate? Shared with the server so the drawer
  // and LeaveService.createApplication cannot disagree about the answer.
  const docRule = leaveDocumentRequirement(
    selected
      ? {
          requires_documents: selected.requires_documents,
          document_required_after_days: selected.document_required_after_days,
        }
      : null,
    requestedDays,
    isEmergency,
  );

  const reset = () => {
    setLeaveTypeId(''); setStartDate(''); setEndDate('');
    setDurationType('full'); setReason(''); setIsEmergency(false); setError(null);
    setDocumentFiles([]); setUploadError(null); setUploading(false);
    uploadedRef.current = new WeakMap();
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!leaveTypeId && !!startDate &&
    !!endDate && !!reason.trim() && !overBalance && !overContinuous && !shortNotice &&
    !overPeriod && !periodWindowBroken && !clash && closedHit.length === 0 && !notInHr &&
    requestedDays > 0 && !mutation.isPending && !uploading &&
    // A type that demands a certificate must not be submittable without one.
    // The server enforces the same rule; this only spares the round trip.
    (!docRule.required || documentFiles.length > 0);

  /**
   * Upload every picked file, skipping any this Submit already uploaded.
   * Sequential, not Promise.all: three 5 MB files racing on a phone connection
   * is how you get a timeout, and the count is capped at three anyway.
   */
  const uploadDocuments = async (): Promise<LeaveDocument[]> => {
    const out: LeaveDocument[] = [];
    for (const file of documentFiles) {
      const cached = uploadedRef.current.get(file);
      if (cached) { out.push(cached); continue; }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('employee_id', ctx.employeeId);
      fd.append('leave_type_id', leaveTypeId);
      fd.append('start_date', startDate);

      const res = await fetch('/api/hr/leave/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Could not upload "${file.name}".`);
      }
      const doc = (await res.json()) as LeaveDocument;
      uploadedRef.current.set(file, doc);
      out.push(doc);
    }
    return out;
  };

  const submit = async () => {
    setError(null);
    setUploadError(null);

    // Files go to Drive BEFORE the application row exists. The worst case is an
    // orphaned Drive file; the alternative — create the row, then attach — can
    // leave a required document missing on exactly the requests that need one.
    let documents: LeaveDocument[] = [];
    if (documentFiles.length > 0) {
      setUploading(true);
      try {
        documents = await uploadDocuments();
      } catch (err) {
        const message = getErrorMessage(err);
        setUploadError(message);
        toast.error(message);
        return;
      } finally {
        setUploading(false);
      }
    }

    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: leaveTypeId,
        hr_academic_year_id: ctx.hrAcademicYearId || null,
        start_date: startDate,
        end_date: endDate,
        duration_type: effectiveDuration,
        start_time: null,
        end_time: null,
        reason,
        is_emergency: isEmergency,
        documents,
        applied_by: '', // server fills from the authenticated user
        department_id: null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      // Toast AS WELL as the inline alert. The alert sits at the bottom of a
      // scrollable sheet while Submit lives in the fixed footer, so a long
      // form can push it out of view entirely — which is how a failed submit
      // looked like nothing happening at all.
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setError(null); onOpenChange(v); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Apply Leave
          </SheetTitle>
          <SheetDescription>
            {ctx.employeeName}
            {ctx.employeeCode ? ` · ${ctx.employeeCode}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {ctx.missingAcademicYear && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No HR academic year covers today, so leave cannot be submitted.
                Please contact HR.
              </AlertDescription>
            </Alert>
          )}

          {!ctx.isLoading && options.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No leave balance is configured for you this academic year. Please contact HR
                to set up your entitlements.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div>
                <Label htmlFor="leaveType">Leave Type <span className="text-destructive">*</span></Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger id="leaveType" className="mt-1">
                    <SelectValue placeholder={ctx.isLoading ? 'Loading…' : 'Select a leave type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((b) => {
                      // Same figure the card below and the server use.
                      const avail = b.available;
                      return (
                        <SelectItem key={b.leave_type_id} value={b.leave_type_id}>
                          {b.leave_type_name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatDays(avail)} day(s) available
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {/* The entitlement used to be one muted line here and was easy
                    to miss. It decides whether the request can be submitted at
                    all, so it gets a card — matching the short-time-off drawer. */}
                {selected && (
                  <div className="mt-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Your balance · this academic year
                      </span>
                      {selected.max_continuous_days != null && (
                        <span className="text-[11px] text-muted-foreground">
                          max {selected.max_continuous_days} day(s) at a time
                        </span>
                      )}
                    </div>

                    {/* Pending is named rather than silently deducted: "10
                        available" is baffling to someone who believes they have
                        12, when the two missing days are ones they filed
                        themselves an hour ago. Shown only when there are any, so
                        the common case keeps four columns. */}
                    <div
                      className={`mt-2 grid gap-2 text-center ${
                        selected.pending > 0 ? 'grid-cols-5' : 'grid-cols-4'
                      }`}
                    >
                      <Figure label="Entitled" value={formatDays(selected.entitled)} />
                      <Figure label="Carried" value={formatDays(selected.carried_forward)} />
                      <Figure label="Used" value={formatDays(selected.used)} />
                      {selected.pending > 0 && (
                        <Figure label="Pending" value={formatDays(selected.pending)} />
                      )}
                      <Figure label="Available" value={formatDays(available)} strong />
                    </div>
                    <Progress
                      className="mt-2 h-1.5"
                      value={pct(
                        selected.used + selected.pending,
                        selected.accrued + selected.carried_forward
                      )}
                    />
                    {selected.pending > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDays(selected.pending)} day(s) are held by requests awaiting
                        approval and cannot be applied for again.
                      </p>
                    )}
                    {selected.accrued < selected.entitled && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDays(selected.accrued)} of {formatDays(selected.entitled)} day(s)
                        have accrued so far this year; the rest accrue month by month.
                      </p>
                    )}

                    {/* The per-period throttle sits ALONGSIDE the entitlement: a
                        request can be well inside the balance and still refused. */}
                    {periodCapped && (
                      <div className="mt-2 border-t pt-2">
                        <p className="text-xs text-muted-foreground">
                          Also capped at{' '}
                          <strong>{formatDays(periodUsage?.max_days)}</strong> day(s){' '}
                          {LIMIT_PERIOD_LABELS[periodUsage!.limit_period ?? 'month'].toLowerCase()} —{' '}
                          <strong>{formatDays(periodUsage?.days_left)}</strong> left
                          {periodUsage?.period_start && periodUsage?.period_end && (
                            <>
                              {' '}({new Date(`${periodUsage.period_start}T00:00:00`).toLocaleDateString('en-GB')} –{' '}
                              {new Date(`${periodUsage.period_end}T00:00:00`).toLocaleDateString('en-GB')})
                            </>
                          )}
                        </p>
                        {/* The balance card above already names its pending
                            hold; this figure has the same one folded in and
                            said nothing, so the two read as disagreeing.
                            hr_leave_period_usage counts 'pending' and
                            'escalated' beside 'approved', exactly as the cap
                            trigger does. */}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Requests awaiting approval are already counted here,
                          and released if rejected, cancelled or withdrawn.
                        </p>
                      </div>
                    )}

                    {requestedDays > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        This request is <strong>{formatDays(requestedDays)}</strong> day(s) —{' '}
                        {overBalance ? (
                          <span className="text-destructive">
                            {formatDays(requestedDays - (available ?? 0))} more than you have.
                          </span>
                        ) : (
                          <>
                            <strong>{formatDays((available ?? 0) - requestedDays)}</strong> would
                            remain.
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="from">Start Date <span className="text-destructive">*</span></Label>
                  <Input id="from" type="date" className="mt-1" value={startDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartDate(v);
                      // Same-day default, and never leave end before start.
                      if (!endDate || endDate < v) setEndDate(v);
                    }} />
                </div>
                <div>
                  <Label htmlFor="to">End Date <span className="text-destructive">*</span></Label>
                  <Input id="to" type="date" className="mt-1" value={endDate} min={startDate}
                    onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              {notInHr && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your employment category is not managed in HR, so leave cannot be
                    applied for here. Contact HR if you believe this is an error.
                  </AlertDescription>
                </Alert>
              )}

              {closedHit.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Attendance for {describeClosedMonths(closedHit)}{' '}
                    {closedHit.length > 1 ? 'are' : 'is'} closed, so leave covering{' '}
                    {closedHit.length > 1 ? 'those months' : 'that month'} can no longer be
                    applied for. Choose a date in an open month, or ask HR to reopen the month.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="duration">Duration</Label>
                <Select value={effectiveDuration} onValueChange={(v) => setDurationType(v as LeaveDurationType)}>
                  <SelectTrigger id="duration" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && !selected.allow_half_day && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.leave_type_name} is full-day only.
                  </p>
                )}
                {selected?.allow_half_day && !isSingleDay && startDate && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Half-day applies to a single date only.
                  </p>
                )}
              </div>

              {requestedDays > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  Requesting <strong>{formatDays(requestedDays)}</strong> day(s)
                  {available !== null && <> of {formatDays(available)} available</>}
                </div>
              )}

              {overBalance && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Requested {formatDays(requestedDays)} day(s) exceeds your available{' '}
                    {formatDays(available)}.
                  </AlertDescription>
                </Alert>
              )}
              {clash && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You already have a {clash.hr_leave_types?.leave_type_name ?? 'leave'} request
                    from {new Date(`${clash.start_date}T00:00:00`).toLocaleDateString('en-GB')} to{' '}
                    {new Date(`${clash.end_date}T00:00:00`).toLocaleDateString('en-GB')} ({clash.status}).
                    Pick different dates, or cancel that request first.
                  </AlertDescription>
                </Alert>
              )}

              {shortNotice && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {noticeDays! < 0 ? (
                      <>
                        {selected?.leave_type_name} cannot be applied for a past date —{' '}
                        {startDate} was {Math.abs(noticeDays!)} day(s) ago.
                      </>
                    ) : (
                      <>
                        {selected?.leave_type_name} needs {requiredNotice} day(s) advance
                        notice; {startDate} is only {noticeDays} day(s) away.
                      </>
                    )}{' '}
                    Tick <strong>Emergency leave</strong> below if it could not have been
                    filed in time.
                  </AlertDescription>
                </Alert>
              )}

              {overContinuous && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selected?.leave_type_name} allows at most{' '}
                    {selected?.max_continuous_days} consecutive day(s).
                  </AlertDescription>
                </Alert>
              )}
              {overPeriod && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Only {formatDays(periodUsage?.days_left)} day(s) of{' '}
                    {selected?.leave_type_name} left for{' '}
                    {periodUsage?.period_start} to {periodUsage?.period_end}
                    {' '}(limit {formatDays(periodUsage?.max_days)} day(s)).
                  </AlertDescription>
                </Alert>
              )}
              {periodWindowBroken && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The {periodUsage?.limit_period ?? 'period'} limit for{' '}
                    {selected?.leave_type_name} cannot be resolved for this date, so the
                    request would be rejected. Please contact HR.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="reason">Reason <span className="text-destructive">*</span></Label>
                <Textarea id="reason" className="mt-1" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the reason for your leave" />
              </div>

              {(docRule.required || docRule.optional) && (
                <LeaveDocumentUpload
                  files={documentFiles}
                  onChange={setDocumentFiles}
                  required={docRule.required}
                  reason={docRule.reason}
                  uploading={uploading}
                  error={uploadError}
                />
              )}

              <div className="flex items-start gap-2">
                <Checkbox id="emergency" checked={isEmergency}
                  onCheckedChange={(v) => setIsEmergency(v === true)} />
                <Label htmlFor="emergency" className="cursor-pointer text-sm font-normal leading-snug">
                  Emergency leave
                  <span className="block text-xs text-muted-foreground">
                    Bypasses advance notice; supporting documents required within 48h.
                  </span>
                </Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {uploading ? 'Uploading…' : mutation.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
