'use client';

/**
 * Apply Compensatory Off — PHASE 1 (request only).
 *
 * SCOPE: there is no earned-credit ledger yet. The reference product models
 * comp off as credits with a worked date, an expiry date and earned/available/
 * expired totals; hr_leave_balances is a flat (entitled, used, carried_forward)
 * per academic year and cannot express per-credit expiry. That ledger
 * (hr_comp_off_credits) is Phase 2.
 *
 * Until then this submits an ordinary application against the comp_off type,
 * so requests can be raised and approved. Balance will read 0 because nothing
 * credits it — the tab says so rather than implying the feature is broken.
 *
 * The worked date is captured and prefixed into `reason`. An approver cannot
 * judge a comp-off request without knowing which day was worked, and there is
 * no column for it yet. This is a deliberate Phase-1 carrier: Phase 2 moves it
 * to hr_comp_off_credits.worked_date and backfills by parsing this prefix,
 * which is why the format is fixed rather than free text.
 */

import { useState } from 'react';
import { AlertCircle, CalendarCheck, Info } from 'lucide-react';

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
import type { LeaveDurationType } from '@/types/hr';

/** Fixed prefix — Phase 2 parses this to backfill worked_date. */
export const WORKED_ON_PREFIX = 'Worked on';

export function ApplyCompOffDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useTimeOffContext();
  const mutation = useApplyLeave();

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [workedDate, setWorkedDate] = useState('');
  const [compOffDate, setCompOffDate] = useState('');
  const [durationType, setDurationType] = useState<LeaveDurationType>('full');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = ctx.balancesFor('compensatory_off');

  // Derived rather than synced by an effect — see apply-short-time-off-drawer.
  const effectiveTypeId =
    leaveTypeId || (options.length === 1 ? options[0].leave_type_id : '');

  const reset = () => {
    setLeaveTypeId(''); setWorkedDate(''); setCompOffDate('');
    setDurationType('full'); setReason(''); setError(null);
  };

  const workedInFuture =
    !!workedDate && new Date(`${workedDate}T00:00:00`) > new Date();

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!effectiveTypeId && !!workedDate &&
    !!compOffDate && !!reason.trim() && !workedInFuture && !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: effectiveTypeId,
        academic_year_id: ctx.academicYearId || null,
        start_date: compOffDate,
        end_date: compOffDate,
        duration_type: durationType,
        start_time: null,
        end_time: null,
        reason: `${WORKED_ON_PREFIX} ${workedDate}. ${reason.trim()}`,
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
            <CalendarCheck className="h-5 w-5 text-primary" />
            Apply Compensatory Off
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
                No compensatory off type is configured for you this academic year. Please
                contact HR.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Automatic comp-off crediting from attendance is not enabled yet, so your
                  balance will show 0. Your request still reaches your approver with the
                  worked date recorded.
                </AlertDescription>
              </Alert>

              {options.length > 1 && (
                <div>
                  <Label htmlFor="coType">Type <span className="text-destructive">*</span></Label>
                  <Select value={effectiveTypeId} onValueChange={setLeaveTypeId}>
                    <SelectTrigger id="coType" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {options.map((b) => (
                        <SelectItem key={b.leave_type_id} value={b.leave_type_id}>
                          {b.leave_type_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="workedDate">
                  Worked Date <span className="text-destructive">*</span>
                </Label>
                <Input id="workedDate" type="date" className="mt-1" value={workedDate}
                  onChange={(e) => setWorkedDate(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">
                  The holiday or week-off you worked, which this time off compensates.
                </p>
                {workedInFuture && (
                  <p className="mt-1 text-xs text-destructive">
                    The worked date cannot be in the future.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="compOffDate">
                  Compensatory Off Date <span className="text-destructive">*</span>
                </Label>
                <Input id="compOffDate" type="date" className="mt-1" value={compOffDate}
                  onChange={(e) => setCompOffDate(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="coDuration">Duration</Label>
                <Select value={durationType} onValueChange={(v) => setDurationType(v as LeaveDurationType)}>
                  <SelectTrigger id="coDuration" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full day</SelectItem>
                    <SelectItem value="first_half">First half (AM)</SelectItem>
                    <SelectItem value="second_half">Second half (PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="coReason">Reason <span className="text-destructive">*</span></Label>
                <Textarea id="coReason" className="mt-1" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you requesting compensatory off?" />
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
