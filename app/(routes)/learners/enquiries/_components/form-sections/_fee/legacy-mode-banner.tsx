'use client';

// ============================================================================
// legacy-mode-banner.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 12 — Banner shown at the top of the Finance tab when the
// loaded learner has `legacy_fee_mode = true`. Single CTA: "Migrate to fee
// structure", admin-gated, opens AdoptStructureDialog.
//
// Plan 6 / Task 2 (2026-05-05) — gated additionally on the institution's
// `use_fee_structures` flag. The banner now appears only when BOTH
// (a) the lead is in legacy mode AND (b) the institution flag is ON.
// Rationale: admins shouldn't be tempted to migrate individual leads
// while the institution-wide flag is still off.
// ----------------------------------------------------------------------------
// Spec §9.2 + §12.1  · Plan: 2026-05-05-admission-fees-plan-06 Task 2
// ============================================================================

import { useEffect, useState } from 'react';
import { ArrowRightLeft, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

import { AdoptStructureDialog } from './adopt-structure-dialog';

interface LegacyFeeItem {
  category_id?: string;
  category_name?: string;
  amount?: number;
}

interface Props {
  learnerId: string;
  institutionId?: string;
  dims: Partial<FeeStructureMatrixDimensions>;
  legacyFeeItems: LegacyFeeItem[];
  onAdopted?: () => void;
}

export function LegacyModeBanner({
  learnerId,
  institutionId,
  dims,
  legacyFeeItems,
  onAdopted,
}: Props) {
  const { canPerformAll, isSuperAdmin } = usePermissions();
  // Use manage_adjustments as the admin gate per Plan retrospective; super admin always.
  const canMigrate =
    isSuperAdmin || canPerformAll('admission_fees', ['manage_adjustments']);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Plan 6 Task 2: gate visibility on the institution's use_fee_structures flag.
  // We start as null (= "unknown") so we don't flash the banner before the check
  // resolves. If institutionId is missing, we keep the banner hidden.
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!institutionId) {
      setFlagEnabled(false);
      return;
    }
    AdmissionSettingsService.isFeeStructuresEnabled(institutionId)
      .then((enabled) => {
        if (!cancelled) setFlagEnabled(enabled);
      })
      .catch((err) => {
        // Soft-fail: keep banner hidden if the flag check errored.
        console.error('[legacy-mode-banner] isFeeStructuresEnabled:', err);
        if (!cancelled) setFlagEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Don't render until we've resolved the flag, and only render when ON.
  if (flagEnabled !== true) return null;

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
