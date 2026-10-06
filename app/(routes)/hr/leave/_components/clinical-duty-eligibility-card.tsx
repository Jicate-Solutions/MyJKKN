'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useMyClinicalEligibilities,
  useMyClinicalToday,
  useRequestClinicalEligibility,
} from '@/hooks/hr/use-clinical-duty';

const MIN_REASON = 10;

/**
 * Clinical duty eligibility, requested from the Eligibility tab — not from My
 * Attendance, which only shows the punch card once HR has approved.
 */
export function ClinicalDutyEligibilityCard({
  employeeId,
  institutionId,
}: {
  employeeId: string;
  institutionId: string | null;
}) {
  const { data: today, isLoading: todayLoading } = useMyClinicalToday(employeeId);
  const { data: requests, isLoading: reqLoading } = useMyClinicalEligibilities(employeeId);
  const request = useRequestClinicalEligibility();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const last = requests?.[0];
  const pending = requests?.some((r) => r.status === 'pending');
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  const submit = () => {
    if (tooShort || !institutionId) return;
    request.mutate(
      { employeeId, institutionId, reason: trimmed },
      { onSuccess: () => { setOpen(false); setReason(''); } },
    );
  };

  const message = today?.eligible
    ? 'You are approved for clinical duty — punch IN and OUT from My Attendance at your duty site.'
    : pending
      ? 'Your request is awaiting HR approval.'
      : last?.status === 'rejected'
        ? `Your request was rejected${last.decision_note ? ` — ${last.decision_note}` : ''}.`
        : last?.status === 'revoked'
          ? 'Your clinical duty eligibility was withdrawn. You can request it again.'
          : 'Staff on clinical duty mark attendance from the app with their location. HR must approve you first.';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="h-5 w-5 text-primary" />
          Clinical duty attendance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayLoading || reqLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">{message}</p>
            {today?.eligible && <Badge variant="secondary">Approved</Badge>}
            {pending && <Badge variant="secondary">Pending</Badge>}
            {!today?.eligible && !pending && institutionId && (
              <Button size="sm" onClick={() => setOpen(true)}>
                {last ? 'Request again' : 'Request eligibility'}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request clinical duty eligibility</DialogTitle>
            <DialogDescription>
              HR reviews the request. Once approved, you can punch in and out from My Attendance
              at your duty site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clinical-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="clinical-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Where and why you work off campus…"
            />
            {reason.length > 0 && tooShort && (
              <p className="text-sm text-red-500">Enter at least {MIN_REASON} characters.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={tooShort || request.isPending}>
              {request.isPending ? 'Sending…' : 'Send request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
