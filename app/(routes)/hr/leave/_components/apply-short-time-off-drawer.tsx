'use client';

/**
 * Apply Short Time Off — hourly in-day requests (Permission).
 *
 * Offers only types whose request_category is 'short_time_off'. Submits with
 * duration_type='hourly' plus start_time/end_time, which hr_leave_applications
 * already supports — no new table is involved.
 *
 * Times are sent as plain HH:MM strings to a `time without time zone` column.
 * Deliberately not composed into a Date and serialised: that round-trip pushes
 * the value through the local offset and lands 5h30m out in IST.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Timer } from 'lucide-react';

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useApplyLeave } from '@/hooks/hr/use-leave';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { useStoUsage } from '@/hooks/hr/use-hr-leave-types';
import { formatMinutes, STO_LIMIT_PERIOD_LABELS } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { formatHours } from './format';

/** Minutes since midnight, or null when unparseable. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function ApplyShortTimeOffDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useTimeOffContext();
  const mutation = useApplyLeave();

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = ctx.balancesFor('short_time_off');

  // Only one short-time-off type exists per org today (Permission), so
  // preselect it rather than making the user open a single-item dropdown.
  // Derived rather than pushed into state by an effect: an effect would fire
  // after the options load and trigger a cascading render.
  const effectiveTypeId =
    leaveTypeId || (options.length === 1 ? options[0].leave_type_id : '');

  const selected = options.find((b) => b.leave_type_id === effectiveTypeId);

  // Limits resolve server-side: an assignment can override the type's whole
  // block, and duplicating that precedence here would drift from the trigger
  // that actually enforces it.
  // The DB computes the window from the REQUEST date, not today. Passing the
  // selected date keeps the remaining figure shown here identical to the one
  // enforcement will use — a future-dated request falls in a later period.
  const { data: usage } = useStoUsage(
    ctx.employeeId || undefined,
    effectiveTypeId || undefined,
    ctx.hrAcademicYearId || null,
    date || undefined
  );
  const limited = !!usage && usage.limit_mode !== 'none' && !usage.window_unresolved;
  // The database refuses these outright; saying nothing would leave the user
  // guessing why Submit fails.
  const windowUnresolved = !!usage?.window_unresolved;
  // Distinguish "loaded, and there is no limit" from "still loading" —
  // otherwise a genuinely limited type flashes "No usage limit configured"
  // before the query resolves.
  const usageResolved = usage !== undefined;

  const totalHours = useMemo(() => {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    if (s === null || e === null || e <= s) return null;
    return (e - s) / 60;
  }, [startTime, endTime]);

  const invalidWindow =
    !!startTime && !!endTime && totalHours === null;

  const requestMinutes = totalHours === null ? null : Math.round(totalHours * 60);

  // Mirrors hr_trig_sto_enforce_limits so the form refuses what the database
  // would refuse, with the same numbers, before a round trip.
  const limitError = (() => {
    if (windowUnresolved) {
      return 'The leave period for this date cannot be determined. Contact HR.';
    }
    if (!limited || !usage || requestMinutes === null) return null;
    if (usage.min_minutes && requestMinutes < usage.min_minutes) {
      return `Minimum is ${formatMinutes(usage.min_minutes)} per request.`;
    }
    if (usage.max_minutes && requestMinutes > usage.max_minutes) {
      return `Maximum is ${formatMinutes(usage.max_minutes)} per request.`;
    }
    if (usage.limit_mode === 'request_count' && (usage.requests_left ?? 0) <= 0) {
      return `You have used all ${usage.max_requests} request(s) for this period.`;
    }
    if (
      usage.limit_mode === 'total_duration' &&
      requestMinutes > (usage.minutes_left ?? 0)
    ) {
      return `Only ${formatMinutes(usage.minutes_left)} left for this period.`;
    }
    return null;
  })();

  // A type classified short_time_off but left allow_hourly=false would be
  // rejected by the service AFTER submit. Catch it here instead.
  const notHourly = !!selected && !selected.allow_hourly;

  const reset = () => {
    setLeaveTypeId(''); setDate(''); setStartTime(''); setEndTime('');
    setReason(''); setError(null);
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!effectiveTypeId && !!date &&
    !!startTime && !!endTime && totalHours !== null && !!reason.trim() &&
    !notHourly && !limitError && !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: effectiveTypeId,
        hr_academic_year_id: ctx.hrAcademicYearId || null,
        // An hourly request is same-day by definition.
        start_date: date,
        end_date: date,
        duration_type: 'hourly',
        start_time: startTime,
        end_time: endTime,
        reason,
        is_emergency: false,
        documents: [],
        applied_by: '',
        department_id: null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setError(null); onOpenChange(v); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            Apply Short Time Off
          </SheetTitle>
          <SheetDescription>
            {ctx.employeeName}
            {ctx.employeeCode ? ` · ${ctx.employeeCode}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!ctx.isLoading && options.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No hourly time-off type is configured for you this academic year. Please
                contact HR.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div>
                <Label htmlFor="stoType">Request For <span className="text-destructive">*</span></Label>
                <Select value={effectiveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger id="stoType" className="mt-1">
                    <SelectValue placeholder={ctx.isLoading ? 'Loading…' : 'Select a request type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((b) => (
                      <SelectItem key={b.leave_type_id} value={b.leave_type_id}>
                        {b.leave_type_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {limited && usage ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {usage.limit_mode === 'request_count' ? (
                      <>
                        <strong>{usage.requests_left}</strong> of {usage.max_requests} request(s)
                        left {STO_LIMIT_PERIOD_LABELS[usage.limit_period ?? 'month'].toLowerCase()}
                      </>
                    ) : (
                      <>
                        <strong>{formatMinutes(usage.minutes_left)}</strong> of{' '}
                        {formatMinutes(usage.total_minutes)} left{' '}
                        {STO_LIMIT_PERIOD_LABELS[usage.limit_period ?? 'month'].toLowerCase()}
                      </>
                    )}
                    {usage.period_start && usage.period_end && (
                      <span className="block">
                        Period {new Date(`${usage.period_start}T00:00:00`).toLocaleDateString('en-GB')} –{' '}
                        {new Date(`${usage.period_end}T00:00:00`).toLocaleDateString('en-GB')}
                      </span>
                    )}
                  </p>
                ) : windowUnresolved ? (
                  // Distinct from "no limit": the database refuses these, so
                  // saying "unlimited" here is the lie the window check exists
                  // to stop telling.
                  <p className="mt-1.5 text-xs text-destructive">
                    The leave period for this date cannot be determined.
                  </p>
                ) : usageResolved ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    No usage limit configured for this type.
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="stoDate">Date <span className="text-destructive">*</span></Label>
                <Input id="stoDate" type="date" className="mt-1" value={date}
                  onChange={(e) => setDate(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Short time off is a same-day request.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="stoStart">Start Time <span className="text-destructive">*</span></Label>
                  <Input id="stoStart" type="time" className="mt-1" value={startTime}
                    onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="stoEnd">End Time <span className="text-destructive">*</span></Label>
                  <Input id="stoEnd" type="time" className="mt-1" value={endTime}
                    onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                Total Hours{' '}
                <strong>{totalHours !== null ? formatHours(totalHours) : '—'}</strong>
              </div>

              {notHourly && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selected?.leave_type_name} is not configured for hourly requests.
                    Ask HR to enable hourly duration on this leave type.
                  </AlertDescription>
                </Alert>
              )}

              {invalidWindow && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>End time must be after start time.</AlertDescription>
                </Alert>
              )}

              {limitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{limitError}</AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="stoReason">Reason <span className="text-destructive">*</span></Label>
                <Textarea id="stoReason" className="mt-1" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the reason for this request" />
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
