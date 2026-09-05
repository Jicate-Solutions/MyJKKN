'use client';

/**
 * Apply Compensatory Off — book a day against an earned credit.
 *
 * The worked date is NOT captured here. Earning and spending are separate acts
 * now that hr_comp_off_credits exists: you claim a worked day (which an
 * approver confirms into a credit), then book time off against the credits you
 * hold. Phase 1 carried the worked date in `reason` because there was nowhere
 * else to put it; that carrier is gone.
 *
 * Approval consumes a credit FIFO by expiry, and the database refuses an
 * approval with no credit behind it — so this form blocks submission when the
 * available balance is zero rather than letting it fail at the approver.
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
import { useCompOffBalance } from '@/hooks/hr/use-comp-off';
import { formatDays } from './format';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [compOffDate, setCompOffDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = ctx.balancesFor('compensatory_off');
  const { data: balance } = useCompOffBalance(ctx.employeeId || undefined);
  const available = balance?.available ?? 0;
  const pending = balance?.pending ?? 0;
  const expired = balance?.expired ?? 0;

  // Derived rather than synced by an effect — see apply-short-time-off-drawer.
  const effectiveTypeId =
    leaveTypeId || (options.length === 1 ? options[0].leave_type_id : '');

  const reset = () => {
    setLeaveTypeId(''); setCompOffDate('');
    setReason(''); setError(null);
  };

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!effectiveTypeId &&
    !!compOffDate && !!reason.trim() && available > 0 && !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        leave_type_id: effectiveTypeId,
        hr_academic_year_id: ctx.hrAcademicYearId || null,
        start_date: compOffDate,
        end_date: compOffDate,
        // Whole days only: credits are earned one full day per day worked,
        // and a half-day booking would strand the remainder of a credit.
        // The consume trigger rejects fractional total_days outright.
        duration_type: 'full',
        start_time: null,
        end_time: null,
        reason: reason.trim(),
        is_emergency: false,
        documents: [],
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
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <strong className="tabular-nums">{available}</strong> credit(s) available
                <span className="block text-xs text-muted-foreground">
                  Approval spends the credit closest to expiry first.
                </span>
              </div>

              {available <= 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    You have no available credits, so this request could not be approved.
                    {/* The bare "0" was the whole complaint: credits were visible on
                        the Balance tab while this said zero, with nothing joining the
                        two. Pending and expired are the only two ways that happens,
                        so name whichever applies. */}
                    {pending > 0 && (
                      <> <strong>{formatDays(pending)}</strong> claim(s) are still
                      awaiting your approver — a credit only becomes bookable once
                      approved.</>
                    )}
                    {expired > 0 && (
                      <> <strong>{formatDays(expired)}</strong> credit(s) have passed
                      their 90-day expiry and can no longer be used.</>
                    )}
                    {pending <= 0 && expired <= 0 && <> Claim a worked day first.</>}
                  </AlertDescription>
                </Alert>
              )}

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
                <Label htmlFor="compOffDate">
                  Compensatory Off Date <span className="text-destructive">*</span>
                </Label>
                <Input id="compOffDate" type="date" className="mt-1" value={compOffDate}
                  onChange={(e) => setCompOffDate(e.target.value)} />
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
