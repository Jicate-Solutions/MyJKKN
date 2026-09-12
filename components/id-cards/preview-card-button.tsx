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

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { IdCardPreviewDialog } from './id-card-preview-dialog';

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
      />
    </>
  );
}
