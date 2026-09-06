'use client';

// Reissue a participant's sign-in details.
//
// Two states, like the approval dialog: a CONFIRM step and a RESULT step. The
// confirm step exists because this is destructive in a way that is easy to miss
// — the participant's current password stops working the moment it runs, so
// somebody mid-course who already signed in gets locked out until they are
// given the new one. That must be stated before the click, not after.
//
// The result never auto-closes and the password is shown once. It is not stored
// anywhere and cannot be fetched again; only another reset would produce a new
// one.

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, KeyRound, Loader2, Mail } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResendCourseCredentials } from '@/hooks/courses/use-course-applications';
import type { CourseApplication, CourseCredentialsResult } from '@/types/courses';

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

export function ResendCredentialsDialog({
  application,
  onClose,
}: {
  application: CourseApplication | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<CourseCredentialsResult | null>(null);
  const [touched, setTouched] = useState(false);

  const resend = useResendCourseCredentials();

  // Prefill once per application rather than in an effect — setState-in-effect
  // cascades a render, and this makes the reset explicit.
  if (application && !touched) {
    setTouched(true);
    setEmail(application.applicant_email ?? '');
    setResult(null);
  }

  const close = () => {
    setTouched(false);
    onClose();
  };

  const enrollmentId = application?.enrollment?.id ?? null;

  const submit = () => {
    if (!enrollmentId) return;
    resend.mutate(
      { enrollmentId, email: email.trim() || null },
      { onSuccess: setResult },
    );
  };

  return (
    <Dialog open={Boolean(application)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                New sign-in details
              </DialogTitle>
              <DialogDescription>
                Shown once. The password is not stored and cannot be retrieved again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <CopyRow label="JKKN ID" value={result.jkkn_id} />
              <CopyRow label="New password" value={result.tempPassword} />

              {result.emailSent ? (
                <div className="flex gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                  <p className="text-emerald-900 dark:text-emerald-200">
                    Emailed to {result.email}.
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-amber-900 dark:text-amber-200">
                    {result.emailError
                      ? `No email was sent — ${result.emailError}. `
                      : `${result.emailSkipReason ?? 'No email was sent'}. `}
                    Pass these on yourself before closing this dialog.
                  </p>
                </div>
              )}
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
              <DialogTitle>Resend sign-in details</DialogTitle>
              <DialogDescription>
                For {application?.applicant_name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-amber-900 dark:text-amber-200">
                  This issues a <strong>new password</strong>. Any password they already
                  have will stop working immediately.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="resend-email">Email address (optional)</Label>
                <Input
                  id="resend-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Leave blank to read the password out instead"
                />
                <p className="text-xs text-muted-foreground">
                  If given, it is emailed and saved for next time. Either way the
                  password is shown here once.
                </p>
              </div>

              {/* Cannot happen from the panel, which only offers this on an
                  approved row — but the type allows it, so say something useful
                  rather than failing silently on click. */}
              {!enrollmentId && (
                <p className="text-sm text-destructive">
                  This application has no enrollment, so there is no participant to
                  issue details for.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={resend.isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={submit} disabled={!enrollmentId || resend.isPending}>
                {resend.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset &amp; send
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
