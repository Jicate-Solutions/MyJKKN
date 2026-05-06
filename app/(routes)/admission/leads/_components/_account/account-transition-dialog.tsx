'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { AccountFeeSummaryPanel } from './account-fee-summary-panel';
import { DocumentsChecklist } from './documents-checklist';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
import { AccountTransitionService } from '@/lib/services/admission/account-transition-service';
import type {
  AccountTransitionDocumentEntry,
  AccountTransitionResult,
} from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string;
  institutionId: string;
  onSuccess?: (result: AccountTransitionResult) => void;
}

export function AccountTransitionDialog(props: Props) {
  const { open, onOpenChange, learnerId, institutionId, onSuccess } = props;
  const [requiredDocs, setRequiredDocs] = useState<string[]>([]);
  const [docs, setDocs] = useState<AccountTransitionDocumentEntry[]>([]);
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    AdmissionSettingsService.getByInstitution(institutionId)
      .then((s) => {
        if (cancelled) return;
        setRequiredDocs(s?.required_documents_for_account_transition ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setRequiredDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, institutionId]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const result = await AccountTransitionService.transitionToAccount({
        learner_id: learnerId,
        required_documents: requiredDocs,
        received_documents: docs,
      });
      toast.success(
        `Moved to Account; ${result.bills_generated} bill${
          result.bills_generated !== 1 ? 's' : ''
        } generated`,
      );
      onSuccess?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Move to Account stage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <section>
            <h4 className="mb-2 text-sm font-medium">Fee summary</h4>
            <AccountFeeSummaryPanel learnerId={learnerId} />
          </section>
          <section>
            <h4 className="mb-2 text-sm font-medium">Documents checklist</h4>
            {requiredDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents required for this institution.
              </p>
            ) : (
              <DocumentsChecklist
                requiredDocTypes={requiredDocs}
                onChange={setDocs}
                onValidityChange={setValid}
              />
            )}
          </section>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || (requiredDocs.length > 0 && !valid)}
          >
            {submitting ? 'Submitting…' : 'Confirm — Move to Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
