'use client';

// ============================================================================
// adopt-structure-dialog.tsx
// ----------------------------------------------------------------------------
// Migrate a legacy lead to the matrix-derived fee structure.
// Side-by-side preview: current legacy fee_items[] vs structure-derived rows
// from FeeStructureService.findByDimensions (using the lead's current FK dims).
//
// Confirm calls the atomic SECURITY DEFINER RPC
// admission_adopt_structure_for_lead(p_learner_id) which:
//   1. Permission-gates on admission_fees.manage_adjustments
//   2. Flips legacy_fee_mode = false
//   3. Resolves fee_items via admission_resolve_fee_items_for_lead
//   4. Raises if the 8-dim lookup finds no match (no silent empty adoption)
// All 3 happen in one transaction; any failure rolls back.
// Activity log is emitted from the caller's session after the RPC succeeds.
// ----------------------------------------------------------------------------
// Plan 3 Task 12 (initial) · Plan 6 Task 6 (atomic RPC refactor) · Spec §12.1
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import {
  logActivityForCurrentUser,
} from '@/lib/utils/activity-logger-client';
import { AdmissionFeesActivityTemplates } from '@/lib/utils/admission-fees-activity-templates';
import type {
  AdmissionFeeStructureWithItems,
  FeeStructureMatrixDimensions,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

interface LegacyFeeItem {
  category_id?: string;
  category_name?: string;
  amount?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerId: string;
  /** Lead's current matrix dimensions, used for the side-by-side preview. */
  dims: Partial<FeeStructureMatrixDimensions>;
  /** Lead's current legacy fee_items[] from learners_profiles.fee_items. */
  legacyFeeItems: LegacyFeeItem[];
  onAdopted?: () => void;
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(
    d.institution_id &&
    d.degree_id &&
    d.department_id &&
    d.programme_id &&
    d.quota_id &&
    d.community_category_id &&
    d.accommodation_type_id &&
    d.admission_year_id
  );
}

export function AdoptStructureDialog({
  open,
  onOpenChange,
  learnerId,
  dims,
  legacyFeeItems,
  onAdopted,
}: Props) {
  const [preview, setPreview] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      isFullDims(dims)
        ? FeeStructureService.findByDimensions(dims as FeeStructureMatrixDimensions)
        : Promise.resolve(null),
      BillingCategoryService.getActiveBillingCategories(),
    ])
      .then(([match, cats]) => {
        if (cancelled) return;
        setPreview(match);
        setCategories(cats);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[adopt-structure-dialog] preview load:', err);
        toast.error('Failed to load preview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, JSON.stringify(dims)]);

  const categoriesById = useMemo(() => {
    const map: Record<string, BillingCategory> = {};
    for (const cat of categories) map[cat.id] = cat;
    return map;
  }, [categories]);

  const legacyTotal = (legacyFeeItems ?? []).reduce(
    (sum, it) => sum + Number(it?.amount ?? 0),
    0,
  );
  const previewTotal = (preview?.items ?? []).reduce(
    (sum, it) => sum + Number(it.amount ?? 0),
    0,
  );

  const handleConfirm = async () => {
    if (!preview) {
      toast.error('No matching fee structure to adopt.');
      return;
    }
    try {
      setSubmitting(true);
      // Single atomic RPC: flip legacy_fee_mode + resolve fee_items.
      // Permission-gated server-side on admission_fees.manage_adjustments.
      // Raises on no-match so we never silently adopt an empty fee list.
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'admission_adopt_structure_for_lead' as any,
        { p_learner_id: learnerId },
      );
      if (error) throw error;

      const result = data as {
        success: boolean;
        learner_id: string;
        item_count: number;
        fee_items: { amount?: number }[];
      };
      const resolvedTotal = (result.fee_items ?? []).reduce(
        (sum, it) => sum + Number(it?.amount ?? 0),
        0,
      );

      // Activity log emitted from caller's session (post-RPC, best-effort).
      await logActivityForCurrentUser({
        actionType: 'update',
        resourceType: 'learner',
        resourceId: learnerId,
        description: AdmissionFeesActivityTemplates.enquiry.legacy_fee_adopted(
          result.item_count,
          resolvedTotal,
        ),
        metadata: {
          sub_type: 'enquiry',
          event: 'legacy_fee_adopted',
          item_count: result.item_count,
          resolved_total: resolvedTotal,
        },
      });

      toast.success(`Adopted: ${result.item_count} fee items`);
      onAdopted?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to adopt fee structure';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Migrate to fee structure</DialogTitle>
          <DialogDescription>
            Replace the legacy manual fee entry with values derived from the matching
            active fee structure. This preserves an audit trail in activity logs.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preview…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded border bg-muted/30 p-3">
              <div className="mb-2 text-sm font-medium">Current (legacy)</div>
              {legacyFeeItems.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">No legacy items.</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {legacyFeeItems.map((it, idx) => (
                      <tr key={`legacy-${idx}`} className="border-t">
                        <td className="py-1">
                          {it.category_name ?? it.category_id ?? '—'}
                        </td>
                        <td className="py-1 text-right">
                          ₹{Number(it.amount ?? 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t font-bold">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right">
                        ₹{legacyTotal.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded border-2 border-primary p-3">
              <div className="mb-2 text-sm font-medium">
                After migration {preview ? `(${preview.name})` : ''}
              </div>
              {!preview ? (
                <p className="text-xs italic text-amber-700">
                  No matching fee structure found for the lead&apos;s current dimensions.
                  Configure one before migrating.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {preview.items.map((it) => {
                      const label =
                        categoriesById[it.billing_category_id]?.category_name ??
                        it.billing_category_id;
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="py-1">{label}</td>
                          <td className="py-1 text-right">
                            ₹{Number(it.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t font-bold">
                      <td className="py-1">Total</td>
                      <td className="py-1 text-right">
                        ₹{previewTotal.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || loading || !preview}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm migration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
