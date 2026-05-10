'use client';

// ============================================================================
// feature-flag-card.tsx
// ----------------------------------------------------------------------------
// Plan 6 / Task 4 — Per-institution `use_fee_structures` toggle. Soft-warn
// AlertDialog when an admin flips the flag ON for an institution that has
// zero admission_fee_structures configured (= guaranteed no-match empty
// state for net-new enquiries until structures are seeded).
// ----------------------------------------------------------------------------
// Spec §12.1  · Plan: 2026-05-05-admission-fees-plan-06 Task 4
// ============================================================================

import { useEffect, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import toast from 'react-hot-toast';

import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';

interface Props {
  institutionId: string;
}

export function FeatureFlagCard({ institutionId }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [structureCount, setStructureCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    AdmissionSettingsService.getByInstitution(institutionId)
      .then((s) => {
        if (!cancelled) setEnabled(s?.use_fee_structures ?? false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[feature-flag-card] getByInstitution:', err);
          setEnabled(false);
        }
      });
    AdmissionSettingsService.getFeeStructureCountForInstitution(institutionId)
      .then((n) => {
        if (!cancelled) setStructureCount(n);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[feature-flag-card] getFeeStructureCountForInstitution:', err);
          setStructureCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  const handleToggle = (next: boolean) => {
    // Soft-warn only when flipping ON without structures
    if (next && structureCount === 0) {
      setConfirming(true);
      return;
    }
    void commit(next);
  };

  const commit = async (next: boolean) => {
    setSaving(true);
    try {
      await AdmissionSettingsService.setUseFeeStructures(institutionId, next);
      setEnabled(next);
      toast.success(next ? 'Fee structures enabled' : 'Fee structures disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update flag');
    } finally {
      setSaving(false);
    }
  };

  if (enabled === null) {
    return (
      <div className="rounded border p-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="rounded border p-4 space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium">Use Fee Structures</div>
          <div className="text-sm text-muted-foreground">
            Enable matrix-driven fee resolution for net-new enquiries in this
            institution.
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving || !institutionId}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {structureCount} fee structure{structureCount !== 1 ? 's' : ''} configured.
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enable with zero structures configured?
            </AlertDialogTitle>
            <AlertDialogDescription>
              No fee structures exist for this institution yet. Enabling now
              means new enquiries will hit the no-match empty state until you
              configure structures via{' '}
              <code>/admission/settings/fees-structure</code>. Continue anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void commit(true);
                setConfirming(false);
              }}
            >
              Enable anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
