'use client';
// ============================================================================
// REFERENCE DETAILS DIALOG
// ============================================================================
// Edits the reference/referral attribution of ONE existing learner.
//
// Deliberately narrow: it renders the shared ReferralPicker and saves through
// LearnerReferenceService, which touches exactly six columns. It does NOT go
// through the shared EnquiryForm — that form writes ~60 mapped columns and is
// also rendered by /learners/my-profile in student view, so putting referral
// attribution on it would let learners edit the input to the commission ledger.
// ============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ReferralPicker, type ReferralValue } from '@/components/admission/referral-picker';
import { LearnerReferenceService } from '@/lib/services/admission/learner-reference-service';

interface ReferenceDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string;
  learnerName?: string | null;
  /** Seeds the referrer hierarchy filter to the learner's own institution. */
  institutionId?: string | null;
  initial: ReferralValue & { reference_contact?: string | null };
  onSaved: () => void;
}

export function ReferenceDetailsDialog({
  open,
  onOpenChange,
  learnerId,
  learnerName,
  institutionId,
  initial,
  onSaved,
}: ReferenceDetailsDialogProps) {
  const [value, setValue] = useState<ReferralValue>({
    referral_type: initial.referral_type ?? null,
    referred_by_id: initial.referred_by_id ?? null,
    referred_by_name: initial.referred_by_name ?? null,
  });
  const [contact, setContact] = useState<string>(initial.reference_contact ?? '');
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the dialog opens so a cancelled edit never leaks into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setValue({
      referral_type: initial.referral_type ?? null,
      referred_by_id: initial.referred_by_id ?? null,
      referred_by_name: initial.referred_by_name ?? null,
    });
    setContact(initial.reference_contact ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, learnerId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await LearnerReferenceService.update(learnerId, {
        ...value,
        reference_contact: contact,
      });
      toast.success('Reference details updated');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update reference details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit reference details</DialogTitle>
          <DialogDescription>
            {learnerName ? `${learnerName} — only ` : 'Only '}
            the reference fields are saved; no other profile data is touched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <ReferralPicker
            value={value}
            onChange={setValue}
            defaultInstitutionId={institutionId ?? undefined}
            disabled={saving}
          />

          <div className="space-y-1.5">
            <Label htmlFor="reference-contact">
              Reference contact <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="reference-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Phone number of the referrer"
              inputMode="numeric"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save reference'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
