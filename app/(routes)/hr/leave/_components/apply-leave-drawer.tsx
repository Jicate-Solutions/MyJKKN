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

import { useMemo, useState } from 'react';
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
import { getErrorMessage } from '@/lib/utils';
import { formatDays } from './format';
import { LIMIT_PERIOD_LABELS } from '@/types/hr-leave-types';
import type { HRLeaveApplicationWithType, LeaveDurationType } from '@/types/hr';

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

  const available = selected
    ? selected.entitled + selected.carried_forward - selected.used
    : null;

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

  const reset = () => {
    setLeaveTypeId(''); setStartDate(''); setEndDate('');
    setDurationType('full'); setReason(''); setIsEmergency(false); setError(null);
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!leaveTypeId && !!startDate &&
    !!endDate && !!reason.trim() && !overBalance && !overContinuous &&
    !overPeriod && !periodWindowBroken && !clash &&
    requestedDays > 0 && !mutation.isPending;

  const submit = async () => {
    setError(null);
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
        documents: [],
        applied_by: '', // server fills from the authenticated user
        department_id: null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
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
                      const avail = b.entitled + b.carried_forward - b.used;
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

                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <Figure label="Entitled" value={formatDays(selected.entitled)} />
                      <Figure label="Carried" value={formatDays(selected.carried_forward)} />
                      <Figure label="Used" value={formatDays(selected.used)} />
                      <Figure label="Available" value={formatDays(available)} strong />
                    </div>
                    <Progress
                      className="mt-2 h-1.5"
                      value={pct(selected.used, selected.entitled + selected.carried_forward)}
                    />

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
            {mutation.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
