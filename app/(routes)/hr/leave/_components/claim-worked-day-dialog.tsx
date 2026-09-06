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

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LeaveDocumentUpload } from './leave-document-upload';
import { useClaimWorkedDay } from '@/hooks/hr/use-comp-off';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { useClosedAttendanceMonths } from '@/hooks/hr/use-attendance-records';
import { closedMonthsInRange, describeClosedMonths } from '@/types/hr-attendance';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveDocument } from '@/types/hr';

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
  // Picked but NOT uploaded — files go to Drive on Submit, same pattern as
  // the leave and short-time-off drawers (see leave-document-upload.tsx).
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Drive results keyed by the File itself, so a retried Submit re-uses them. */
  const uploadedRef = useRef<WeakMap<File, LeaveDocument>>(new WeakMap());

  const inFuture = !!workedDate && new Date(`${workedDate}T00:00:00`) > new Date();

  // trg_hcoc_block_locked_period refuses a claim whose worked day sits in a
  // closed month. Say so while the date is being picked.
  const closedMonths = useClosedAttendanceMonths(ctx.institutionId || undefined);
  const closedHit = closedMonthsInRange(workedDate, workedDate, closedMonths);

  /** Category excluded from HR — trg_hcoc_block_non_hr_staff refuses the claim. */
  const notInHr = !ctx.isLoading && ctx.hasEmployeeRecord && !ctx.hrIncluded;

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
    closedHit.length === 0 && !notInHr && !mutation.isPending && !uploading &&
    // Proof of the worked day is required — CompOffService.claimWorkedDay
    // enforces the same rule; this only spares the round trip.
    documentFiles.length > 0;

  /** Upload every picked file, skipping any this Submit already uploaded. */
  const uploadDocuments = async (): Promise<LeaveDocument[]> => {
    const out: LeaveDocument[] = [];
    for (const file of documentFiles) {
      const cached = uploadedRef.current.get(file);
      if (cached) { out.push(cached); continue; }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('employee_id', ctx.employeeId);
      fd.append('start_date', workedDate);
      // No leave type exists for a worked-day claim; the route files it under
      // COMPOFF instead of a type code.
      fd.append('purpose', 'comp_off_claim');

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

    // Files go to Drive BEFORE the claim row exists — worst case is an
    // orphaned Drive file, never a required document missing from the claim.
    let documents: LeaveDocument[] = [];
    if (documentFiles.length > 0) {
      setUploading(true);
      try {
        documents = await uploadDocuments();
      } catch (err) {
        const message = getErrorMessage(err);
        setUploadError(message);
        return;
      } finally {
        setUploading(false);
      }
    }

    try {
      await mutation.mutateAsync({
        hr_organization_id: ctx.hrOrgId,
        employee_id: ctx.employeeId,
        worked_date: workedDate,
        notes: notes.trim() || null,
        documents,
      });
      setWorkedDate(''); setNotes('');
      setDocumentFiles([]); setUploadError(null);
      uploadedRef.current = new WeakMap();
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
          {notInHr && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your employment category is not managed in HR, so compensatory off
                cannot be claimed here. Contact HR if you believe this is an error.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="cwd">Worked Date <span className="text-destructive">*</span></Label>
            <Input id="cwd" type="date" className="mt-1" value={workedDate}
              onChange={(e) => setWorkedDate(e.target.value)} />
            {inFuture ? (
              <p className="mt-1 text-xs text-destructive">
                You cannot claim a day you have not worked yet.
              </p>
            ) : closedHit.length > 0 ? (
              <p className="mt-1 text-xs text-destructive">
                Attendance for {describeClosedMonths(closedHit)} is closed, so a worked day in
                that month can no longer be claimed. Ask HR to reopen the month.
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

          <LeaveDocumentUpload
            files={documentFiles}
            onChange={setDocumentFiles}
            required
            reason="Attach proof of the worked day — a duty order, roster or event notice. Your approver confirms the claim against it."
            uploading={uploading}
            error={uploadError}
          />

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
            {uploading ? 'Uploading…' : mutation.isPending ? 'Submitting…' : 'Submit claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
