'use client';

// Foundation — Enrol a learner into a cohort.
//
// This is the first write path this module has ever had for its roster. Until
// now fp_students / fp_enrollments / fp_cohorts were referenced ONLY by reads
// anywhere in the codebase, so the only rows in production were three [PILOT]
// fixtures put there by hand — which is why every roster renders empty.
//
// WHY THERE IS NO "PICK AN EXISTING LEARNER" CONTROL HERE
// Foundation coaches children at feeder and partner schools. They are not JKKN
// learners, so there is no `learners_profiles` row to point at and no login to
// attach — `fp_students.profile_id` and `.learner_profile_id` are nullable for
// exactly that reason, and `full_name` is a plain text column because this
// table IS the roster of record for those children.
//
// The cohort's resource person runs their sessions
// (/api/foundation/practice/facilitate), so a learner created here can sit a
// paper immediately without ever holding an account.
//
// Linking a platform identity — needed only for the SELF-SERVE path, where
// /api/foundation/practice matches on `profile_id = auth.uid()` — is
// deliberately NOT in this dialog. It is a different question (which account?)
// with a different answer per audience, and guessing it here would risk writing
// the wrong id space into a column. Kept as a follow-up.

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAddLearnerToCohort } from '@/hooks/foundation/use-foundation';
import type { FoundationCohort } from '@/lib/services/foundation/foundation-service';

interface EnrollLearnerDialogProps {
  cohort: FoundationCohort;
}

export function EnrollLearnerDialog({ cohort }: EnrollLearnerDialogProps) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [consent, setConsent] = useState(false);

  const addLearner = useAddLearnerToCohort();
  const trimmedName = fullName.trim();
  const canSubmit = trimmedName.length > 0 && !addLearner.isPending;

  function reset() {
    setFullName('');
    setGrade('');
    setConsent(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await addLearner.mutateAsync({
        cohort_id: cohort.id,
        full_name: trimmedName,
        grade: grade.trim() || null,
        // Inherited from the cohort so a learner is never orphaned from the
        // school and institution their cohort belongs to.
        school_id: cohort.school_id ?? null,
        institution_id: cohort.institution_id ?? null,
        // Recorded as the moment it was ticked. Left NULL when it was not —
        // "pending" is a real and reportable state, not a missing value.
        parental_consent_at: consent ? new Date().toISOString() : null,
      });
      toast.success(`${trimmedName} enrolled`);
      reset();
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not enrol this learner');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Enrol learner
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enrol a learner</DialogTitle>
          <DialogDescription>
            Adds the learner to this cohort. They do not need an account on this
            platform — the cohort&apos;s resource person runs their sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="fp-learner-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fp-learner-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="As it appears on the school register"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fp-learner-grade">Grade</Label>
            <Input
              id="fp-learner-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. 8, 10, 12"
              autoComplete="off"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
            <Checkbox
              id="fp-learner-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label
                htmlFor="fp-learner-consent"
                className="cursor-pointer font-medium"
              >
                Parental consent is on file
              </Label>
              <p className="text-xs text-muted-foreground">
                Leave this unticked if it has not been collected yet. The roster
                shows it as pending rather than pretending it exists.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={addLearner.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {addLearner.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Enrol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
