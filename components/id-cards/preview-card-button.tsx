'use client';

// ============================================================================
// PreviewCardButton — "Preview ID Card" for a single learner.
// Created: 2026-09-05.
//
// Opens IdCardPreviewDialog for one learner: renders the card (front + back
// when the template has one) exactly as the printer receives it, flags any
// blank field in red, and offers "Print ID Card" (A4, browser print) only
// once the preview is complete. Sits next to the existing PrintCardButton,
// which still queues to the Evolis card printer untouched.
//
// Same visibility rule as PrintCardButton: hidden without id_cards.jobs.manage
// and hidden while permissions load.
// ============================================================================

import { useState } from 'react';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { IdCardPreviewDialog } from './id-card-preview-dialog';
import {
  enqueuePrintJob,
  fetchIdCardTemplates,
  resolveProfileIdForLearner
} from '@/lib/services/id-cards/print-jobs-client';
import { resolveLearnerInstitutions } from '@/lib/services/id-cards/card-preview-client';
import { pickTemplateForInstitution } from '@/lib/services/id-cards/institution-template';

interface PreviewCardButtonProps {
  /** learners_profiles.id */
  learnerId: string;
  personName: string;
  rollNumber?: string | null;
}

export function PreviewCardButton({ learnerId, personName, rollNumber }: PreviewCardButtonProps) {
  const { isSuperAdmin, canAccess, isLoading: permissionsLoading } = usePermissions();
  const canManageJobs =
    !permissionsLoading && (isSuperAdmin || canAccess('id_cards.jobs', 'manage'));
  const [open, setOpen] = useState(false);

  // "Queue to card printer" inside the preview — the only print action on the
  // learner profile (the separate Print ID Card button was removed 2026-09-23).
  // Same selection as everywhere else: the learner's institution's active
  // learner template.
  const queueToPrinter = async () => {
    try {
      const [profileId, institutions, templates] = await Promise.all([
        resolveProfileIdForLearner(learnerId),
        resolveLearnerInstitutions([learnerId]),
        fetchIdCardTemplates()
      ]);
      if (!profileId) {
        toast.error('No account yet — the ID card becomes printable once the learner account is activated.');
        return;
      }
      const choice = pickTemplateForInstitution(
        templates,
        institutions.get(learnerId)?.institutionId ?? null,
        null,
        { audience: 'learner' }
      );
      if (!choice) {
        toast.error('No active ID-card template for this learner’s institution.');
        return;
      }
      const outcome = await enqueuePrintJob(profileId, choice.template.id);
      if (outcome.status === 'queued') toast.success(`ID card for ${personName} queued for printing`);
      else if (outcome.status === 'already_queued') toast('Already in the print queue');
      else toast.error(outcome.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not queue the card');
    }
  };

  if (!canManageJobs) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Eye className="mr-2 h-4 w-4" />
        Preview ID Card
      </Button>
      <IdCardPreviewDialog
        open={open}
        onOpenChange={setOpen}
        learners={[{ learnerId, name: personName, rollNumber: rollNumber ?? null }]}
        title="Preview ID Card"
        onSendToPrinter={() => {
          setOpen(false);
          void queueToPrinter();
        }}
      />
    </>
  );
}
