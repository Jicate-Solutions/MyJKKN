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
import { getErrorMessage } from '@/lib/utils';

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

  const totalHours = useMemo(() => {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    if (s === null || e === null || e <= s) return null;
    return (e - s) / 60;
  }, [startTime, endTime]);

  const invalidWindow =
    !!startTime && !!endTime && totalHours === null;

  const available = selected
    ? selected.entitled + selected.carried_forward - selected.used
    : null;

  const reset = () => {
    setLeaveTypeId(''); setDate(''); setStartTime(''); setEndTime('');
    setReason(''); setError(null);
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!effectiveTypeId && !!date &&
    !!startTime && !!endTime && totalHours !== null && !!reason.trim() &&
    !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: effectiveTypeId,
        academic_year_id: ctx.academicYearId || null,
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
                {available !== null && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {available.toFixed(1)} remaining this year
                  </p>
                )}
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
                <strong>{totalHours !== null ? totalHours.toFixed(2) : '—'}</strong>
              </div>

              {invalidWindow && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>End time must be after start time.</AlertDescription>
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
