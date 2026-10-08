'use client';

/**
 * Claim worked holidays / week-offs as compensatory off credits — one or
 * several individual days per submission (2026-10-05). Each day becomes its own
 * credit with its own expiry and its own approval; location, notes and proof
 * are shared by all of them.
 *
 * This is the earning path that works today. The attendance-driven path is
 * defined in the schema but dormant — hr_attendance_records and
 * hr_public_holidays are both empty, so nothing would be detected to credit.
 * (hr_shift_templates was removed 2026-08-06; shift config is now
 * hr_shift_timings, which is populated but not yet wired to attendance.)
 *
 * Policy: 1 full day earned per day worked, expiring one calendar month later
 * (90 days until 2026-09-11). Both are enforced in the database (credit_days
 * default, expiry trigger) rather than here, so a claim raised through any
 * client obeys them.
 */

import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { AlertCircle, CalendarPlus } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LeaveDocumentUpload } from './leave-document-upload';
import { ClaimDaysList } from './claim-days-list';
import { useClaimWorkedDays, useCompOffBalance } from '@/hooks/hr/use-comp-off';
import { useDaysOccupancy } from '@/hooks/hr/use-day-occupancy';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { useClosedAttendanceMonths } from '@/hooks/hr/use-attendance-records';
import { closedMonthsInRange } from '@/types/hr-attendance';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveDocument } from '@/types/hr';
import {
  COMP_OFF_WORK_LOCATION_LABELS,
  MAX_CLAIM_DAYS,
  claimDayProblem,
  priorClaimStatus,
  type CompOffWorkLocation,
} from '@/types/hr-comp-off';

const toIso = (d: Date) => format(d, 'yyyy-MM-dd');

export function ClaimWorkedDayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useTimeOffContext();
  const mutation = useClaimWorkedDays();

  /** ISO dates, kept sorted. */
  const [workedDates, setWorkedDates] = useState<string[]>([]);
  // Where the day was worked — required, and outside campus names the place.
  // CompOffService and the table's CHECKs enforce the same pairing.
  const [workLocation, setWorkLocation] = useState<CompOffWorkLocation | ''>('');
  const [workPlace, setWorkPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Picked but NOT uploaded — files go to Drive on Submit, same pattern as
  // the leave and short-time-off drawers (see leave-document-upload.tsx).
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Drive results keyed by the File itself, so a retried Submit re-uses them. */
  const uploadedRef = useRef<WeakMap<File, LeaveDocument>>(new WeakMap());

  const today = toIso(new Date());

  // trg_hcoc_block_locked_period refuses a claim whose worked day sits in a
  // closed month. Said per day while the days are being picked.
  const closedMonths = useClosedAttendanceMonths(ctx.institutionId || undefined);

  /** Category excluded from HR — trg_hcoc_block_non_hr_staff refuses the claim. */
  const notInHr = !ctx.isLoading && ctx.hasEmployeeRecord && !ctx.hrIncluded;

  // Only one request may exist per day, and a worked-day claim competes with
  // leave and permissions for it — trg_hcoc_day_occupancy refuses a clash.
  // Same predicate the trigger uses, asked per day so the clash is named.
  const clashes = useDaysOccupancy(ctx.employeeId, workedDates);

  // A day already claimed — pending, approved, used or rejected — cannot be
  // claimed again; only a withdrawn claim frees it. Same cache as the ledger.
  const { data: balance } = useCompOffBalance(ctx.employeeId || undefined);
  const priorClaims = useMemo(() => priorClaimStatus(balance?.credits ?? []), [balance]);

  // Every refusal the database would raise for a day, named against that day.
  // The insert is all-or-nothing, so one red day must block Submit.
  const dayRows = useMemo(
    () =>
      workedDates.map((date) => ({
        date,
        problem: claimDayProblem(date, today, {
          closedMonth: closedMonthsInRange(date, date, closedMonths).length > 0,
          clash: clashes[date] ?? null,
          priorClaim: priorClaims.get(date) ?? null,
        }),
      })),
    [workedDates, today, closedMonths, clashes, priorClaims]
  );
  const blockedDays = dayRows.filter((r) => r.problem).length;
  const occupancyPending = workedDates.some((d) => clashes[d] === undefined);

  const locationDone =
    workLocation === 'inside_campus' ||
    (workLocation === 'outside_campus' && workPlace.trim() !== '');

  const canSubmit =
    !!ctx.employeeId && !!ctx.hrOrgId && workedDates.length > 0 &&
    workedDates.length <= MAX_CLAIM_DAYS && blockedDays === 0 && !occupancyPending &&
    locationDone && !notInHr && !mutation.isPending && !uploading &&
    // Proof of the worked day is required — CompOffService.claimWorkedDays
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
      fd.append('start_date', workedDates[0]);
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
        worked_dates: workedDates,
        notes: notes.trim() || null,
        documents,
        work_location: workLocation || null,
        work_place: workLocation === 'outside_campus' ? workPlace.trim() : null,
      });
      setWorkedDates([]); setNotes('');
      setWorkLocation(''); setWorkPlace('');
      setDocumentFiles([]); setUploadError(null);
      uploadedRef.current = new WeakMap();
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setError(null); onOpenChange(v); }}>
      {/* The base DialogContent has no height cap. The location question made
          this form tall enough to run off a laptop screen, taking Submit with
          it. Nothing in here portals a popover, so scrolling the root is safe. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Claim worked days
          </DialogTitle>
          <DialogDescription>
            Claim the holidays or week-offs you worked — pick one day or several. Your
            approver confirms each day, and each becomes a credit you can book as
            compensatory off within one month of the day worked.
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
            <Label>Worked days <span className="text-destructive">*</span></Label>
            <div className="mt-1 flex justify-center rounded-md border">
              <Calendar
                mode="multiple"
                selected={workedDates.map((d) => new Date(`${d}T00:00:00`))}
                onSelect={(days) =>
                  setWorkedDates((days ?? []).map(toIso).sort().slice(0, MAX_CLAIM_DAYS))
                }
                disabled={{ after: new Date() }}
                defaultMonth={new Date()}
              />
            </div>
            <div className="mt-2 space-y-2">
              <ClaimDaysList
                rows={dayRows}
                today={today}
                onRemove={(d) => setWorkedDates((cur) => cur.filter((x) => x !== d))}
              />
              {workedDates.length > 0 && (
                <p className={blockedDays > 0 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                  {blockedDays > 0
                    ? `Remove the ${blockedDays} day(s) marked in red to submit.`
                    : <>Earns <strong>{workedDates.length} day(s)</strong> — each usable for one month from the day worked.</>}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label id="cwdLocationLabel">
              Where did you work? <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              aria-labelledby="cwdLocationLabel"
              className="mt-2 flex flex-wrap gap-x-6 gap-y-2"
              value={workLocation}
              onValueChange={(v) => setWorkLocation(v as CompOffWorkLocation)}
            >
              {(['inside_campus', 'outside_campus'] as const).map((loc) => (
                <div key={loc} className="flex items-center gap-2">
                  <RadioGroupItem value={loc} id={`cwd-${loc}`} />
                  <Label htmlFor={`cwd-${loc}`} className="font-normal">
                    {COMP_OFF_WORK_LOCATION_LABELS[loc]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {workLocation === 'outside_campus' && (
              <div className="mt-3">
                <Label htmlFor="cwdPlace">
                  Place of work <span className="text-destructive">*</span>
                </Label>
                <Input id="cwdPlace" className="mt-1" maxLength={200} value={workPlace}
                  onChange={(e) => setWorkPlace(e.target.value)}
                  placeholder="e.g. Chennai – NAAC visit" />
              </div>
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
