'use client';

/**
 * Claim a worked holiday / week-off as a compensatory off credit.
 *
 * This is the earning path that works today. The attendance-driven path is
 * defined in the schema but dormant — hr_attendance_records and
 * hr_public_holidays are both empty, so nothing would be detected to credit.
 * (hr_shift_templates was removed 2026-08-06; shift config is now
 * hr_shift_timings, which is populated but not yet wired to attendance.)
 *
 * Policy: 1 full day earned per day worked, expiring 90 days later. Both are
 * enforced in the database (credit_days default, expiry trigger) rather than
 * here, so a claim raised through any client obeys them.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, CalendarPlus } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useClaimWorkedDay } from '@/hooks/hr/use-comp-off';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { getErrorMessage } from '@/lib/utils';

export function ClaimWorkedDayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useTimeOffContext();
  const mutation = useClaimWorkedDay();

  const [workedDate, setWorkedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inFuture = !!workedDate && new Date(`${workedDate}T00:00:00`) > new Date();

  // Shown so the claimant knows the deadline before submitting, using the same
  // +90 rule the database applies.
  const expiry = useMemo(() => {
    if (!workedDate) return null;
    const d = new Date(`${workedDate}T00:00:00`);
    d.setDate(d.getDate() + 90);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      label: d.toLocaleDateString('en-GB'),
      daysLeft: Math.round((d.getTime() - today.getTime()) / 86_400_000),
    };
  }, [workedDate]);

  // The credit expires 90 days after the day worked, so a date older than that
  // would be inserted already dead — visible in the ledger, never spendable.
  // hr_comp_off_set_expiry refuses it too; this only saves the round trip and
  // names the deadline, which the raw database message cannot do as kindly.
  const tooOld = !inFuture && !!expiry && expiry.daysLeft < 0;

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && !!workedDate && !inFuture && !tooOld &&
    !mutation.isPending;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        worked_date: workedDate,
        notes: notes.trim() || null,
      });
      setWorkedDate(''); setNotes('');
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setError(null); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Claim a worked day
          </DialogTitle>
          <DialogDescription>
            Claim a holiday or week-off you worked. Your approver confirms it, and the
            credit becomes available to book as compensatory off.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="cwd">Worked Date <span className="text-destructive">*</span></Label>
            <Input id="cwd" type="date" className="mt-1" value={workedDate}
              onChange={(e) => setWorkedDate(e.target.value)} />
            {inFuture ? (
              <p className="mt-1 text-xs text-destructive">
                You cannot claim a day you have not worked yet.
              </p>
            ) : tooOld ? (
              <p className="mt-1 text-xs text-destructive">
                Too late to claim — a credit for this day expired on{' '}
                <strong>{expiry?.label}</strong>. Compensatory off must be claimed
                within 90 days of the day worked.
              </p>
            ) : expiry ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Earns <strong>1 day</strong>, usable until <strong>{expiry.label}</strong>
                {expiry.daysLeft <= 14 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {' '}— only {expiry.daysLeft} day(s) left to use it, so get it
                    approved quickly.
                  </span>
                )}
                .
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                One full day is earned per day worked, usable for 90 days.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="cwdNotes">Notes</Label>
            <Textarea id="cwdNotes" className="mt-1" rows={2} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you work on? Helps your approver confirm." />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {mutation.isPending ? 'Submitting…' : 'Submit claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
