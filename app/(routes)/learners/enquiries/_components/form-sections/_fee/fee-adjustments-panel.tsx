'use client';

// ============================================================================
// fee-adjustments-panel.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 10 — Editable list of fee adjustments for a learner.
// Renders rows with category + reason + signed delta, with edit/remove
// actions gated on `admission_fees.manage_adjustments`. Add-button opens
// AdjustmentDialog. Parent is notified via onChange so it can recompute totals.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 10
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { FeeAdjustmentService } from '@/lib/services/admission/fee-adjustment-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  AdmissionFeeAdjustment,
  AdmissionFeeAdjustmentReasonCode,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

import { AdjustmentDialog } from './adjustment-dialog';

interface Props {
  learnerId: string;
  /** Bumped by parent after each successful create/update/remove. Lets the
   *  ResolvedTotalPanel know it needs to re-fetch the resolution. */
  onChange?: () => void;
}

const REASON_LABELS: Record<AdmissionFeeAdjustmentReasonCode, string> = {
  scholarship_merit: 'Scholarship — Merit',
  donor_seat: 'Donor Seat',
  sibling_rebate: 'Sibling Rebate',
  management_waiver: 'Management Waiver',
  fee_concession: 'Fee Concession',
  staff_ward: 'Staff Ward',
  financial_hardship: 'Financial Hardship',
  other: 'Other',
};

export function FeeAdjustmentsPanel({ learnerId, onChange }: Props) {
  const { canPerformAll, isSuperAdmin } = usePermissions();
  const canManage =
    isSuperAdmin || canPerformAll('admission_fees', ['manage_adjustments']);

  const [adjustments, setAdjustments] = useState<AdmissionFeeAdjustment[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdmissionFeeAdjustment | null>(null);

  const refresh = async () => {
    if (!learnerId) return;
    try {
      setLoading(true);
      const [list, cats] = await Promise.all([
        FeeAdjustmentService.listForLearner(learnerId),
        BillingCategoryService.getActiveBillingCategories(),
      ]);
      setAdjustments(list);
      setCategories(cats);
    } catch (err) {
      console.error('[fee-adjustments-panel] load:', err);
      const message = err instanceof Error ? err.message : 'Failed to load adjustments';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId]);

  const categoriesById = useMemo(() => {
    const map: Record<string, BillingCategory> = {};
    for (const cat of categories) map[cat.id] = cat;
    return map;
  }, [categories]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (adj: AdmissionFeeAdjustment) => {
    setEditing(adj);
    setDialogOpen(true);
  };

  const handleRemove = async (adj: AdmissionFeeAdjustment) => {
    if (!confirm('Remove this adjustment? This action cannot be undone.')) return;
    try {
      setRemovingId(adj.id);
      await FeeAdjustmentService.remove(adj.id);
      toast.success('Adjustment removed');
      await refresh();
      onChange?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove adjustment';
      toast.error(message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleDialogSuccess = async () => {
    await refresh();
    onChange?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Per-learner exceptions: scholarships, donor seats, rebates, waivers, surcharges.
        </span>
        {canManage && (
          <Button type="button" size="sm" variant="outline" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Add Adjustment
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading adjustments…
        </div>
      ) : adjustments.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No adjustments yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Category</th>
              <th className="py-1">Reason</th>
              <th className="py-1 text-right">Delta</th>
              {canManage && <th className="py-1" />}
            </tr>
          </thead>
          <tbody>
            {adjustments.map((adj) => {
              const catLabel = adj.billing_category_id
                ? categoriesById[adj.billing_category_id]?.category_name ??
                  adj.billing_category_id
                : 'Global';
              const delta = Number(adj.delta_amount);
              const isNeg = delta < 0;
              return (
                <tr key={adj.id} className="border-t">
                  <td className="py-1">{catLabel}</td>
                  <td className="py-1">{REASON_LABELS[adj.reason_code] ?? adj.reason_code}</td>
                  <td
                    className={`py-1 text-right font-medium ${isNeg ? 'text-emerald-600' : 'text-amber-700'}`}
                  >
                    {isNeg ? '-' : '+'}₹{Math.abs(delta).toLocaleString('en-IN')}
                  </td>
                  {canManage && (
                    <td className="py-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(adj)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(adj)}
                        disabled={removingId === adj.id}
                        title="Remove"
                        className="text-destructive"
                      >
                        {removingId === adj.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canManage && (
        <AdjustmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editing ? 'edit' : 'create'}
          learnerId={learnerId}
          initialValues={editing}
          categories={categories}
          onSuccess={handleDialogSuccess}
        />
      )}
    </div>
  );
}
