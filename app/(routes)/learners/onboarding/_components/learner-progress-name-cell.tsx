'use client';
/**
 * Learner cell for the Awaiting Payment tab: clicking the name opens the
 * View Progress dialog (the fee position is what that tab is about) instead of
 * the profile edit form the other tabs link to.
 */

import { useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import type { OnboardingProfileRow } from '@/types/learner-onboarding';
import { PaymentProgressDialog } from './payment-progress-dialog';

export function LearnerProgressNameCell({ learner }: { learner: OnboardingProfileRow }) {
  const [open, setOpen] = useState(false);
  const { isSuperAdmin, canAccess } = usePermissions();
  const canViewBills = isSuperAdmin || canAccess('billing.schedule', 'view');
  const name = `${learner.first_name} ${learner.last_name || ''}`.trim();

  return (
    <div className="space-y-0.5 whitespace-normal break-words">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-medium text-primary hover:underline"
        title="View fee progress"
      >
        {name}
      </button>
      <div className="font-mono text-xs text-muted-foreground">
        {learner.roll_number || <span className="italic">No roll no.</span>}
      </div>
      {learner.payment && (
        <PaymentProgressDialog
          learner={learner}
          open={open}
          onOpenChange={setOpen}
          canViewBills={canViewBills}
        />
      )}
    </div>
  );
}
