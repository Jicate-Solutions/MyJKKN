'use client';

// ============================================================================
// legacy-mode-banner.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 12 — Banner shown at the top of the Finance tab when the
// loaded learner has `legacy_fee_mode = true`. Single CTA: "Migrate to fee
// structure", admin-gated, opens AdoptStructureDialog.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 12
// ============================================================================

import { useState } from 'react';
import { ArrowRightLeft, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

import { AdoptStructureDialog } from './adopt-structure-dialog';

interface LegacyFeeItem {
  category_id?: string;
  category_name?: string;
  amount?: number;
}

interface Props {
  learnerId: string;
  dims: Partial<FeeStructureMatrixDimensions>;
  legacyFeeItems: LegacyFeeItem[];
  onAdopted?: () => void;
}

export function LegacyModeBanner({
  learnerId,
  dims,
  legacyFeeItems,
  onAdopted,
}: Props) {
  const { canPerformAll, isSuperAdmin } = usePermissions();
  // Use manage_adjustments as the admin gate per Plan retrospective; super admin always.
  const canMigrate =
    isSuperAdmin || canPerformAll('admission_fees', ['manage_adjustments']);

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This lead uses legacy manual fee entry. Migrate to the matrix-derived
          fee structure to enable adjustments and resolved totals.
        </span>
      </div>
      {canMigrate && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <ArrowRightLeft className="mr-1 h-4 w-4" />
            Migrate to fee structure
          </Button>
          <AdoptStructureDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            learnerId={learnerId}
            dims={dims}
            legacyFeeItems={legacyFeeItems}
            onAdopted={onAdopted}
          />
        </>
      )}
    </div>
  );
}
