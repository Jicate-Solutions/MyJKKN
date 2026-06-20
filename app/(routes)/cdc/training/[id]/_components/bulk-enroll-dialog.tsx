'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAddCdcEnrollment } from '@/hooks/cdc/use-cdc-training';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import type { CdcTrainingEnrollment } from '@/types/cdc/training';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programmeId: string;
  // Current enrollments on the page — used to skip learners already enrolled
  // so the bulk insert never produces duplicate rows.
  existingEnrollments: CdcTrainingEnrollment[];
}

// Picker labels are built server-side as "First Last (REGISTER_NO)".
// Pull the register number out of the trailing parentheses so a pasted
// roll/register number can be matched against it case-insensitively.
function registerNumberFromLabel(label: string): string {
  const match = label.match(/\(([^)]*)\)\s*$/);
  return (match ? match[1] : '').trim().toLowerCase();
}

export function BulkEnrollDialog({ open, onOpenChange, programmeId, existingEnrollments }: Props) {
  const addMutation = useAddCdcEnrollment();
  const { data: learnerOptions, isLoading: learnersLoading } = useLearnersForPicker();
  const [raw, setRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState<string[]>([]);

  // register-number -> learner id, built from the picker options.
  const byRegisterNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of learnerOptions ?? []) {
      const reg = registerNumberFromLabel(opt.label);
      if (reg) map.set(reg, opt.value);
    }
    return map;
  }, [learnerOptions]);

  const alreadyEnrolledIds = useMemo(
    () => new Set(existingEnrollments.map((e) => e.learner_id)),
    [existingEnrollments],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // One register number per line; drop blanks and de-dupe within the paste.
    const lines = Array.from(
      new Set(
        raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    );
    if (lines.length === 0) return;

    const toEnroll: string[] = []; // learner ids
    const skipped: string[] = [];  // lines for already-enrolled learners
    const missing: string[] = [];  // lines with no matching learner

    for (const line of lines) {
      const learnerId = byRegisterNumber.get(line.toLowerCase());
      if (!learnerId) {
        missing.push(line);
      } else if (alreadyEnrolledIds.has(learnerId)) {
        skipped.push(line);
      } else {
        toEnroll.push(learnerId);
      }
    }

    setSubmitting(true);
    let enrolled = 0;
    let failed = 0;

    // Reuse the single-enroll mutation per learner. mutateAsync still runs the
    // hook's onSuccess (per-row "Learner enrolled" toast + query invalidation),
    // which also refreshes the page list when we're done.
    const results = await Promise.allSettled(
      toEnroll.map((learnerId) =>
        addMutation.mutateAsync({ programme_id: programmeId, learner_id: learnerId }),
      ),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') enrolled += 1;
      else failed += 1;
    }

    setSubmitting(false);
    setNotFound(missing);

    const parts = [`Enrolled ${enrolled}`];
    if (skipped.length) parts.push(`skipped ${skipped.length} (already enrolled)`);
    if (missing.length) parts.push(`${missing.length} not found`);
    if (failed) parts.push(`${failed} failed`);
    const summary = parts.join(', ');
    if (enrolled > 0 && failed === 0) toast.success(summary);
    else if (enrolled === 0 && (skipped.length || missing.length) && failed === 0) toast.info(summary);
    else toast.warning(summary);

    // Keep the dialog open if there are unmatched lines so the user can see
    // and correct them; otherwise close and reset.
    if (missing.length === 0) {
      setRaw('');
      onOpenChange(false);
    }
  }

  function handleClose() {
    setRaw('');
    setNotFound([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Add Learners</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk_rolls">Register / Roll numbers</Label>
            <Textarea
              id="bulk_rolls"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'One per line, e.g.\n21CS001\n21CS002\n21CS003'}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Paste one register number per line. Learners already enrolled are skipped.
            </p>
          </div>

          {notFound.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">
                {notFound.length} not found — no matching learner:
              </p>
              <ul className="mt-1 list-disc pl-5 text-amber-700 max-h-32 overflow-y-auto">
                {notFound.map((line) => (
                  <li key={line} className="font-mono text-xs">{line}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose}>Close</Button>
            <Button type="submit" disabled={submitting || learnersLoading || raw.trim().length === 0}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
