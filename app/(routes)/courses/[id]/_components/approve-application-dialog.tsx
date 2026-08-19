'use client';

// Approving a course application — the surface where a person is created.
//
// Two states in one dialog, deliberately not two dialogs: the FORM (email +
// package + note) and, after it succeeds, the RESULT. The result carries the
// JKKN ID and a one-time password that exists nowhere else — the route never
// stores it and cannot reissue it — so it must not be shown in a toast that
// disappears, and the dialog must not close itself. The admin dismisses it once
// they have copied the credentials.

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, BadgeCheck, Copy, IndianRupee, Loader2, ReceiptText,
} from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCoursePackages } from '@/hooks/courses/use-course-packages';
import { useApproveCourseApplication } from '@/hooks/courses/use-course-applications';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import type { CourseApplication, CourseApprovalResult } from '@/types/courses';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** One copyable credential line. */
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.target.select()} className="font-mono" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success(`${label} copied`);
            } catch {
              toast.error('Could not copy — select the value and copy it manually');
            }
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ApproveApplicationDialog({
  application,
  courseEventId,
  onClose,
}: {
  application: CourseApplication | null;
  courseEventId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [packageId, setPackageId] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<CourseApprovalResult | null>(null);
  const [touched, setTouched] = useState(false);

  const approve = useApproveCourseApplication();
  const { data: packages, isLoading: packagesLoading } = useCoursePackages(
    application ? courseEventId : '',
  );

  // Only a package that can actually price an enrollment. The RPC refuses an
  // inactive one and one with no instalment schedule, so offering either here
  // would be inviting an error the admin cannot act on from this dialog.
  const selectable = (packages ?? []).filter((p) => p.is_active);

  // Prefill once per application rather than in an effect: setState-in-effect
  // cascades a render, and `touched` makes the reset explicit and traceable.
  if (application && !touched) {
    setTouched(true);
    setEmail(application.applicant_email ?? '');
    setPackageId(application.package_id ?? '');
    setNote('');
    setResult(null);
  }

  const close = () => {
    setTouched(false);
    onClose();
  };

  const chosen = selectable.find((p) => p.id === packageId) ?? null;
  const chosenInstallments = chosen?.installments?.length ?? 0;
  const chosenNotOnSale =
    chosen != null && !isWindowOpen(chosen.sale_opens_at, chosen.sale_closes_at);

  const submit = () => {
    if (!application) return;
    approve.mutate(
      {
        applicationId: application.id,
        email: email.trim(),
        packageId: packageId || null,
        decisionNote: note.trim() || null,
      },
      { onSuccess: setResult },
    );
  };

  const emailMissing = !application?.applicant_email;
  const canSubmit =
    Boolean(email.trim()) && Boolean(packageId) && chosenInstallments > 0 && !approve.isPending;

  return (
    <Dialog open={Boolean(application)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-emerald-600" />
                {application?.applicant_name} is enrolled
              </DialogTitle>
              <DialogDescription>
                {result.reusedExistingIdentity
                  ? 'This person already had a JKKN ID from an earlier course, so it has been reused — one person keeps one number for life.'
                  : 'Pass these on to the participant. The password is shown once and cannot be retrieved again.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <CopyRow label="JKKN ID" value={result.jkkn_id} />
              <CopyRow label="Login email" value={result.email} />
              {result.tempPassword ? (
                <CopyRow label="Temporary password" value={result.tempPassword} />
              ) : (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No new password was issued — this person already had a login, and
                  resetting it would lock them out of their existing account.
                </p>
              )}

              <div className="space-y-1 rounded-md border p-3 text-sm">
                <p className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-muted-foreground" />
                  {result.package_name} · {inr.format(Number(result.total_payable ?? 0))}
                </p>
                <p className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-muted-foreground" />
                  {result.bill_count} instalment bill{result.bill_count === 1 ? '' : 's'} raised
                </p>
                <p className="text-xs text-muted-foreground">
                  Enrollment {result.enrollment_no}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Approve {application?.applicant_name}</DialogTitle>
              <DialogDescription>
                This creates a JKKN ID and a login, enrolls them, and raises the
                instalment bills. It cannot be undone by rejecting afterwards.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="approve-email">Email address *</Label>
                <Input
                  id="approve-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
                {emailMissing && (
                  <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This application did not collect an email. One is required to
                    create the login.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="approve-package">Package *</Label>
                <Select value={packageId} onValueChange={setPackageId}>
                  <SelectTrigger id="approve-package">
                    <SelectValue
                      placeholder={packagesLoading ? 'Loading…' : 'Choose the tier to enroll onto'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectable.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {inr.format(Number(p.total_amount ?? 0))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!application?.package_id && (
                  <p className="text-xs text-muted-foreground">
                    The applicant did not choose one, so pick the tier they belong on.
                  </p>
                )}

                {/* The RPC refuses this outright, so say it before the click
                    rather than surfacing a raised exception afterwards. */}
                {chosen && chosenInstallments === 0 && (
                  <p className="flex gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    This package has no instalment schedule, so no bills can be
                    raised. Add its instalments on the Packages tab first.
                  </p>
                )}

                {/* Not a blocker: enrolling somebody onto a tier that is no
                    longer publicly on sale is a legitimate admin override. */}
                {chosenNotOnSale && chosenInstallments > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This package is outside its sale window, so it is not offered
                    publicly. Enrolling someone onto it here is still allowed.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="approve-note">Note (optional)</Label>
                <Textarea
                  id="approve-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Recorded against the decision"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={approve.isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={submit} disabled={!canSubmit}>
                {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve &amp; issue JKKN ID
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
