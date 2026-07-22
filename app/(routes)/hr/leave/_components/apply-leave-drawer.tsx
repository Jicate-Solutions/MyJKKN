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
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveDurationType } from '@/types/hr';

const DURATIONS: Array<{ value: LeaveDurationType; label: string; days: number }> = [
  { value: 'full', label: 'Full day', days: 1 },
  { value: 'first_half', label: 'First half (AM)', days: 0.5 },
  { value: 'second_half', label: 'Second half (PM)', days: 0.5 },
];

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

  // Half-day is only offered where the type allows it; a half-day request
  // against a full-day-only type is rejected downstream. Not memoized — it is
  // a ternary over a module constant, and wrapping it in useMemo defeats the
  // React Compiler rather than helping.
  const durationOptions = selected?.allow_half_day ? DURATIONS : DURATIONS.slice(0, 1);

  // Derived, not synced. Switching to a full-day-only type must not leave a
  // stale 'first_half' in state; computing the effective value avoids a
  // setState-inside-effect and the cascading render it causes.
  const effectiveDuration: LeaveDurationType =
    selected?.allow_half_day ? durationType : 'full';

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

  const reset = () => {
    setLeaveTypeId(''); setStartDate(''); setEndDate('');
    setDurationType('full'); setReason(''); setIsEmergency(false); setError(null);
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!leaveTypeId && !!startDate &&
    !!endDate && !!reason.trim() && !overBalance && !overContinuous &&
    requestedDays > 0 && !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: leaveTypeId,
        academic_year_id: ctx.academicYearId || null,
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
                No academic year covers today for your institution, so leave cannot be
                submitted. Please contact HR.
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
                            {avail.toFixed(1)} day(s) available
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selected && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Entitled {selected.entitled} · used {selected.used} · carried{' '}
                    {selected.carried_forward}
                    {selected.max_continuous_days != null && (
                      <> · max {selected.max_continuous_days} day(s) at a time</>
                    )}
                  </p>
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
              </div>

              {requestedDays > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  Requesting <strong>{requestedDays.toFixed(1)}</strong> day(s)
                  {available !== null && <> of {available.toFixed(1)} available</>}
                </div>
              )}

              {overBalance && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Requested {requestedDays.toFixed(1)} day(s) exceeds your available{' '}
                    {available?.toFixed(1)}.
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
