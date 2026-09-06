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
 *
 * THE FORM IS BOUNDED BY THE SHIFT (2026-08-21). Picking the date resolves that
 * day's window through fn_shift_window and:
 *   - clamps both inputs to the chosen half of the shift, since time off
 *     outside the shift is time that was never owed;
 *   - refuses a slot that overlaps a request already live for that date.
 * The second is ALSO enforced by hr_trig_sto_enforce_limits. This copy exists to
 * say so while choosing rather than after Submit, and is not the enforcement
 * point.
 *
 * THE SHIFT IS SHOWN AS TWO SESSIONS (2026-08-25). fn_shift_window has always
 * returned all four boundaries, but the form rendered only the outer envelope --
 * "Shift 09:00-16:30" -- so staff had no way to see where the first half ended
 * and the second began, and guessed at the times to enter. Both are picked
 * explicitly now:
 *   - each session card carries its own timings, so the window is read off the
 *     form rather than recalled;
 *   - the picked session, not the envelope, bounds and seeds the inputs;
 *   - the first half OPENS AT ITS GRACE DEADLINE (first_half_start + grace).
 *     Those minutes are already free, so a permission spanning them would spend
 *     allowance on time nobody was going to be marked late for. 09:05 is offered
 *     and 09:04 is refused, on the card and in the picker alike;
 *   - a time outside the half is clamped back into it as it is picked, by
 *     clampToSession. The min/max attributes alone only narrow the spinner —
 *     browsers still accept a value typed or pasted past them — so outsideShift
 *     survives as the backstop rather than as the thing doing the work;
 *   - duration chips are built from the type's own min/max, so one click cannot
 *     compose a request hr_trig_sto_enforce_limits would then refuse.
 * The halves OVERLAP at JKKN (09:00-13:00 against 12:30-16:30) and the DB CHECK
 * permits that deliberately. A time inside the overlap is therefore valid under
 * either session; the picker chooses which bound applies, it does not partition
 * the day, and the form says so rather than letting it read as a typo.
 */

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Timer } from 'lucide-react';

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useApplyLeave, useMyRequestsOnDate } from '@/hooks/hr/use-leave';
import { LeaveDocumentUpload } from './leave-document-upload';
import { leaveDocumentRequirement } from '@/lib/hr/leave-document-rule';
import type { LeaveDocument } from '@/types/hr';
import { useShiftWindow } from '@/hooks/hr/use-shift-timings';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { useClosedAttendanceMonths } from '@/hooks/hr/use-attendance-records';
import { closedMonthsInRange, describeClosedMonths } from '@/types/hr-attendance';
import { useStoUsage } from '@/hooks/hr/use-hr-leave-types';
import { formatMinutes, STO_LIMIT_PERIOD_LABELS } from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { formatHours } from './format';
import { toast } from 'sonner';

/** Minutes since midnight, or null when unparseable. Accepts HH:MM and HH:MM:SS. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes since midnight back to the `HH:MM` an <input type="time"> expects. */
function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Minutes since midnight as a 12-hour label: 545 -> "9:05 AM", 795 -> "1:15 PM".
 *
 * DISPLAY ONLY. toHHMM stays the machine format -- it feeds the min/max
 * attributes and the value of <input type="time">, both of which are specified
 * as 24-hour HH:MM regardless of what the browser paints on top. Every
 * human-readable time in this form goes through here instead, because the
 * inputs render as 12-hour under an en-IN/en-US locale and the session cards
 * were printing 24-hour beside them -- one form quoting the same shift in two
 * clocks, which is what made 13:15 look like a different time from 1:15 PM.
 */
function to12h(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** A stored 'HH:MM[:SS]' rendered on the same 12-hour clock. */
const clock = (t: string | null | undefined) => {
  const mins = toMinutes(t);
  return mins === null ? '—' : to12h(mins);
};

/** Consumed share of the allowance, clamped — an over-drawn period is still 100%. */
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
  const [session, setSession] = useState<'first' | 'second'>('first');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Picked but NOT uploaded — files go to Drive on Submit, exactly as in
  // apply-leave-drawer.tsx (see that file and leave-document-upload.tsx).
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Drive results keyed by the File itself, so a retried Submit re-uses them. */
  const uploadedRef = useRef<WeakMap<File, LeaveDocument>>(new WeakMap());

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

  // ---- the shift window bounds the whole form ------------------------------
  const { data: shift, isLoading: shiftLoading } = useShiftWindow(
    ctx.employeeId || undefined,
    date || undefined,
  );

  // The envelope of the day. A working day may have ONE half (2026-09-04), so
  // open/close fall through to whichever half exists.
  const shiftOpen = toMinutes(shift?.first_half_start ?? shift?.second_half_start);
  const shiftClose = toMinutes(shift?.second_half_end ?? shift?.first_half_end);
  const graceDeadline =
    shiftOpen === null ? null : shiftOpen + (shift?.grace_minutes ?? 0);
  const nonWorkingDay = !!date && !!shift && shift.is_working_day === false;
  const noShift = !!date && !shiftLoading && !shift;

  // The two halves as pickable windows. Null when the day is not worked or a
  // boundary is missing -- a timing row can only be half-filled through direct
  // SQL, but the envelope still bounds a request correctly, so fall back to it
  // rather than blocking the form on a config it can survive.
  const sessions = useMemo(() => {
    if (!shift || shift.is_working_day === false) return null;
    const fs = toMinutes(shift.first_half_start);
    const fe = toMinutes(shift.first_half_end);
    const ss = toMinutes(shift.second_half_start);
    const se = toMinutes(shift.second_half_end);
    const hasFirst = fs !== null && fe !== null;
    const hasSecond = ss !== null && se !== null;
    // A working day may have ONE half (2026-09-04). Neither is a broken row.
    if (!hasFirst && !hasSecond) return null;
    const grace = shift.grace_minutes ?? 0;

    // The day's FIRST SESSION OPENS AT ITS GRACE DEADLINE, not at its raw
    // start. Those grace minutes are already free — nobody is marked late
    // inside them — so a permission covering 09:00-09:05 would spend allowance
    // on time that was never at risk. The card and the bounds both read this
    // one value, so what is displayed is exactly what is selectable: 09:05
    // offered, 09:04 refused. Math.min guards a grace longer than the half
    // itself, which the 0..240 range on grace_minutes permits. On a
    // second-half-only day the afternoon IS the first session — the same rule
    // evaluateDay applies.
    type Session = { key: 'first' | 'second'; label: string; start: number; end: number };
    const list: Session[] = [];
    if (hasFirst) {
      list.push({ key: 'first', label: 'First half', start: Math.min(fs + grace, fe), end: fe });
    }
    if (hasSecond) {
      list.push({
        key: 'second',
        label: hasFirst ? 'Second half' : 'Shift',
        start: hasFirst ? ss : Math.min(ss + grace, se),
        end: se,
      });
    }
    return {
      list,
      first: hasFirst ? list[0] : null,
      second: hasSecond ? list[list.length - 1] : null,
    };
  }, [shift]);

  // The picked session, or the day's only one when the picked half does not
  // exist on this date (the state defaults to 'first').
  const activeSession = sessions
    ? (sessions.list.find((s) => s.key === session) ?? sessions.list[0])
    : null;

  // What actually bounds the inputs: the picked half, or the whole shift when
  // the halves could not be resolved.
  const boundStart = activeSession ? activeSession.start : shiftOpen;
  const boundEnd = activeSession ? activeSession.end : shiftClose;

  // Seed Start Time at the top of the picked session, once per (date, session).
  // For the first half that is already its grace deadline — see `sessions` — so
  // no special case is needed here. Adjusting state during render rather than in
  // an effect: an effect would paint an empty field first and then overwrite
  // whatever the user typed in between.
  const seedAt = activeSession ? activeSession.start : graceDeadline;
  const seedKey = date ? `${date}|${activeSession?.key ?? 'shift'}` : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seedKey && seedAt !== null && !nonWorkingDay && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setStartTime(toHHMM(seedAt));
    setEndTime('');
  }
  if (!date && seededFor !== null) setSeededFor(null);

  // ---- clashes with what is already live on that date ----------------------
  const { data: sameDay } = useMyRequestsOnDate(ctx.employeeId || undefined, date || undefined);

  const clash = useMemo(() => {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    if (s === null || e === null || e <= s) return null;
    return (sameDay ?? []).find((a) => {
      if ((a.hr_leave_types?.request_category ?? 'leave') !== 'short_time_off') return false;
      if (!['pending', 'approved', 'escalated'].includes(a.status)) return false;
      const as = toMinutes(a.start_time);
      const ae = toMinutes(a.end_time);
      if (as === null || ae === null) return false;
      // Half-open: 09:00-09:30 then 09:30-10:00 are adjacent, not overlapping.
      return as < e && s < ae;
    }) ?? null;
  }, [sameDay, startTime, endTime]);

  const outsideShift = (() => {
    if (boundStart === null || boundEnd === null) return null;
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    // Name the half, not the shift -- "before the shift begins" is a confusing
    // thing to read at 09:30, when the bound actually crossed is the second half
    // starting at 12:30.
    const where = activeSession
      ? `the ${activeSession.label.toLowerCase()} (${to12h(boundStart)} – ${to12h(boundEnd)})`
      : 'the shift';
    if (s !== null && s < boundStart) return `Start time is before ${where} begins.`;
    if (e !== null && e > boundEnd) return `End time is after ${where} ends.`;
    if (s !== null && s >= boundEnd) return `Start time is after ${where} ends.`;
    return null;
  })();

  const totalHours = useMemo(() => {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    if (s === null || e === null || e <= s) return null;
    return (e - s) / 60;
  }, [startTime, endTime]);

  const invalidWindow =
    !!startTime && !!endTime && totalHours === null;

  const requestMinutes = totalHours === null ? null : Math.round(totalHours * 60);

  // Read off `usage` before the memo rather than inside its dependency array:
  // the React Compiler cannot verify an optional-chained dep and fails the
  // build rule react-hooks/preserve-manual-memoization on `usage?.min_minutes`.
  const minPerRequest = usage?.min_minutes ?? null;
  const maxPerRequest = usage?.max_minutes ?? null;

  // Two choices only, by request (2026-08-25): a permission is asked for in
  // half-hours or a full hour and nothing else, so a longer menu was clutter.
  // Still filtered rather than hardcoded — a type configured min 45 must not
  // offer a 30-minute chip hr_trig_sto_enforce_limits would then refuse, and a
  // session shorter than an hour must not offer one.
  const durationChoices = useMemo(() => {
    const sessionLength =
      boundStart === null || boundEnd === null ? null : boundEnd - boundStart;
    return [30, 60].filter((mins) => {
      if (minPerRequest && mins < minPerRequest) return false;
      if (maxPerRequest && mins > maxPerRequest) return false;
      if (sessionLength !== null && mins > sessionLength) return false;
      return true;
    });
  }, [minPerRequest, maxPerRequest, boundStart, boundEnd]);

  /**
   * Snap a picked time back into the session.
   *
   * `min`/`max` on <input type="time"> only narrow the spinner — every browser
   * still accepts a value typed, pasted or autofilled outside that range, which
   * is why `outsideShift` existed to catch it after the fact. Clamping here
   * refuses it at the point of selection instead: with the first half opening at
   * 09:05, picking 09:04 lands on 09:05 rather than on an error message.
   *
   * An empty string is passed through — that is the user clearing the field
   * mid-edit, not an out-of-range value.
   */
  const clampToSession = (value: string): string => {
    if (!value) return value;
    const mins = toMinutes(value);
    if (mins === null || boundStart === null || boundEnd === null) return value;
    return toHHMM(Math.min(Math.max(mins, boundStart), boundEnd));
  };

  /**
   * Set End from Start plus a duration. When that would run past the session,
   * slide Start back so the whole duration still fits, rather than producing a
   * request the bound check rejects on the very next render.
   */
  const applyDuration = (mins: number) => {
    if (boundStart === null || boundEnd === null) return;
    const current = toMinutes(startTime);
    if (current === null) return;
    const start = Math.max(boundStart, Math.min(current, boundEnd - mins));
    setStartTime(toHHMM(start));
    setEndTime(toHHMM(start + mins));
  };

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

  // Same closed-month refusal as the leave drawer — short time off shares
  // hr_leave_applications, so the identical trigger refuses it.
  const closedMonths = useClosedAttendanceMonths(ctx.institutionId || undefined);
  const closedHit = closedMonthsInRange(date, date, closedMonths);

  /** Category excluded from HR — the insert trigger would refuse this. */
  const notInHr = !ctx.isLoading && ctx.hasEmployeeRecord && !ctx.hrIncluded;

  // Does THIS request need a certificate? Same shared predicate the server
  // runs (LeaveService.applyLeave), so the drawer and the service cannot
  // disagree. totalDays = 1 mirrors the service's inclusive same-day count;
  // this drawer never files emergencies.
  const docRule = leaveDocumentRequirement(
    selected
      ? {
          requires_documents: selected.requires_documents,
          document_required_after_days: selected.document_required_after_days,
        }
      : null,
    1,
    false,
  );

  const reset = () => {
    setLeaveTypeId(''); setDate(''); setSession('first');
    setStartTime(''); setEndTime('');
    setReason(''); setError(null); setSeededFor(null);
    setDocumentFiles([]); setUploadError(null); setUploading(false);
    uploadedRef.current = new WeakMap();
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!effectiveTypeId && !!date &&
    !!startTime && !!endTime && totalHours !== null && !!reason.trim() &&
    !notHourly && !limitError && !mutation.isPending && !uploading &&
    !clash && !outsideShift && !nonWorkingDay && !noShift && closedHit.length === 0 &&
    !notInHr &&
    // A type that demands a document must not be submittable without one.
    // The server enforces the same rule; this only spares the round trip.
    (!docRule.required || documentFiles.length > 0);

  /** Upload every picked file, skipping any this Submit already uploaded. */
  const uploadDocuments = async (): Promise<LeaveDocument[]> => {
    const out: LeaveDocument[] = [];
    for (const file of documentFiles) {
      const cached = uploadedRef.current.get(file);
      if (cached) { out.push(cached); continue; }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('employee_id', ctx.employeeId);
      fd.append('leave_type_id', effectiveTypeId);
      fd.append('start_date', date);

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

    // Files go to Drive BEFORE the application row exists — same trade-off as
    // the leave drawer: worst case is an orphaned Drive file, never a required
    // document missing from the row that needed one.
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
        documents,
        applied_by: '',
        department_id: null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
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
                  // The allowance used to be one line of muted 12px text under
                  // the dropdown and was routinely missed. It is the single most
                  // useful number on this form — a request that exceeds it is
                  // refused by hr_trig_sto_enforce_limits — so it gets a card.
                  <div className="mt-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Your allowance ·{' '}
                        {STO_LIMIT_PERIOD_LABELS[usage.limit_period ?? 'month'].toLowerCase()}
                      </span>
                      {usage.period_start && usage.period_end && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(`${usage.period_start}T00:00:00`).toLocaleDateString('en-GB')} –{' '}
                          {new Date(`${usage.period_end}T00:00:00`).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>

                    {usage.limit_mode === 'request_count' ? (
                      <>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <Figure label="Allowed" value={`${usage.max_requests ?? 0}`} />
                          <Figure label="Used *" value={`${usage.requests_used ?? 0}`} />
                          <Figure label="Left" value={`${usage.requests_left ?? 0}`} strong />
                        </div>
                        <Progress
                          className="mt-2 h-1.5"
                          value={pct(usage.requests_used ?? 0, usage.max_requests ?? 0)}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">request(s)</p>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <Figure label="Allowance" value={formatMinutes(usage.total_minutes)} />
                          <Figure label="Used *" value={formatMinutes(usage.minutes_used ?? 0)} />
                          <Figure label="Remaining" value={formatMinutes(usage.minutes_left)} strong />
                        </div>
                        <Progress
                          className="mt-2 h-1.5"
                          value={pct(usage.minutes_used ?? 0, usage.total_minutes ?? 0)}
                        />
                      </>
                    )}

                    {/* WHY "Used" IS LARGER THAN WHAT HAS BEEN APPROVED. Both
                        hr_sto_usage and hr_trig_sto_enforce_limits count
                        'pending' and 'escalated' beside 'approved', so a
                        request still awaiting a decision is already spending
                        the allowance. Staff read the old unlabelled figure as
                        approved-only, applied again against hours that were
                        held, and met the limit as a Submit-time rejection. */}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      * Includes requests awaiting approval — they are held
                      against your allowance until decided, and released if
                      rejected, cancelled or withdrawn.
                    </p>

                    {/* What this particular request would leave behind. */}
                    {requestMinutes !== null && usage.limit_mode === 'total_duration' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        This request is <strong>{formatMinutes(requestMinutes)}</strong> —{' '}
                        {requestMinutes > (usage.minutes_left ?? 0) ? (
                          <span className="text-destructive">
                            {formatMinutes(requestMinutes - (usage.minutes_left ?? 0))} more than you have left.
                          </span>
                        ) : (
                          <>
                            <strong>{formatMinutes((usage.minutes_left ?? 0) - requestMinutes)}</strong>{' '}
                            would remain.
                          </>
                        )}
                      </p>
                    )}
                    {requestMinutes !== null && usage.limit_mode === 'request_count' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        This request is <strong>{formatMinutes(requestMinutes)}</strong>; it uses one
                        of your {usage.max_requests} request(s).
                      </p>
                    )}
                  </div>
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

              {/* The shift, as the two sessions it is actually worked in. This
                  is the answer to "which timing is the first half?" — read off
                  the card rather than remembered or guessed. */}
              {sessions && (
                <div>
                  <Label>Which part of your shift? <span className="text-destructive">*</span></Label>
                  <div className={`mt-1 grid gap-2 ${sessions.list.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {sessions.list.map((half) => {
                      const isActive = activeSession?.key === half.key;
                      return (
                        <button
                          key={half.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setSession(half.key)}
                          className={`rounded-md border p-3 text-left transition-colors ${
                            isActive
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          {/* The AM/PM badge that used to sit here is gone: the
                              times now carry their own period, and the badge was
                              wrong anyway on a first half running past noon. */}
                          <span className="block text-xs font-medium">{half.label}</span>
                          <span className="mt-0.5 block text-sm font-semibold tabular-nums">
                            {to12h(half.start)} – {to12h(half.end)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Someone reading two cards that both cover 12:30–13:00 will
                      otherwise take one of them for a typo. */}
                  {sessions.first && sessions.second && sessions.second.start < sessions.first.end && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      The halves overlap between {to12h(sessions.second.start)} and{' '}
                      {to12h(sessions.first.end)} — a time in that span can be booked under
                      either.
                    </p>
                  )}
                </div>
              )}

              {/* Only reachable when the halves could not be resolved; the cards
                  carry the timings in every other case. */}
              {shift && shift.is_working_day && !sessions && (
                <p className="text-xs text-muted-foreground">
                  Shift {clock(shift.first_half_start ?? shift.second_half_start)}–{clock(shift.second_half_end ?? shift.first_half_end)}
                  {shift.grace_minutes ? ` · ${shift.grace_minutes} min grace, so lateness counts from ${graceDeadline !== null ? to12h(graceDeadline) : '—'}` : ''}
                  . A request must sit inside the shift.
                </p>
              )}

              {/* Gated on usageResolved so the chips do not render the unfiltered
                  set for a frame and then visibly shrink to the allowed ones. */}
              {!!date && !nonWorkingDay && !noShift && usageResolved && durationChoices.length > 0 && (
                <div>
                  <Label>How long?</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {durationChoices.map((mins) => (
                      <Button
                        key={mins}
                        type="button"
                        size="sm"
                        variant={requestMinutes === mins ? 'default' : 'outline'}
                        onClick={() => applyDuration(mins)}
                      >
                        {formatMinutes(mins)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sets the end time from the start time. Either can still be adjusted below.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="stoStart">Start Time <span className="text-destructive">*</span></Label>
                  {/* min/max narrow the spinner; clampToSession is what actually
                      refuses a value outside the half, since a browser will
                      happily accept one typed or pasted past the attributes. */}
                  <Input id="stoStart" type="time" className="mt-1" value={startTime}
                    min={boundStart !== null ? toHHMM(boundStart) : undefined}
                    max={boundEnd !== null ? toHHMM(boundEnd) : undefined}
                    disabled={!date || nonWorkingDay || noShift}
                    onChange={(e) => setStartTime(clampToSession(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="stoEnd">End Time <span className="text-destructive">*</span></Label>
                  <Input id="stoEnd" type="time" className="mt-1" value={endTime}
                    min={startTime || (boundStart !== null ? toHHMM(boundStart) : undefined)}
                    max={boundEnd !== null ? toHHMM(boundEnd) : undefined}
                    disabled={!date || nonWorkingDay || noShift}
                    onChange={(e) => setEndTime(clampToSession(e.target.value))} />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span>
                    Total Hours{' '}
                    <strong>{totalHours !== null ? formatHours(totalHours) : '—'}</strong>
                  </span>
                  {activeSession && totalHours !== null && !outsideShift && (
                    <span className="text-xs text-muted-foreground">
                      within {activeSession.label.toLowerCase()} ({to12h(activeSession.start)}
                      {' – '}{to12h(activeSession.end)})
                    </span>
                  )}
                </div>
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

              {notInHr && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your employment category is not managed in HR, so short time off
                    cannot be applied for here. Contact HR if you believe this is an error.
                  </AlertDescription>
                </Alert>
              )}

              {closedHit.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Attendance for {describeClosedMonths(closedHit)} is closed, so short time off
                    can no longer be applied for on that date. Choose a date in an open month, or
                    ask HR to reopen the month.
                  </AlertDescription>
                </Alert>
              )}

              {nonWorkingDay && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    That date is not a working day for you, so there is no shift to take
                    time off from.
                  </AlertDescription>
                </Alert>
              )}

              {noShift && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No shift timing is configured for you on that date, so the allowed
                    hours cannot be determined. Contact HR.
                  </AlertDescription>
                </Alert>
              )}

              {outsideShift && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{outsideShift}</AlertDescription>
                </Alert>
              )}

              {clash && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You have already applied for {clock(clash.start_time)}–{clock(clash.end_time)} on
                    this date ({clash.hr_leave_types?.leave_type_name ?? 'a request'}, {clash.status}).
                    Choose a different time, or cancel that request first.
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

              {/* Only when the selected type asks for one — Permission stays a
                  two-field form; On Duty (Hourly) demands its proof of duty. */}
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
