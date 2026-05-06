'use client';

// ============================================================================
// resolved-total-panel.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 11 — Live total panel for the Finance tab.
// Edit mode (learnerId present): calls the resolution RPC via
//   FeeResolutionService.resolveForLearner — server-side aggregation including
//   active adjustments.
// Create mode (no learnerId yet): computes locally from the matched fee
//   structure plus any in-flight adjustments the parent has staged.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 11
// ============================================================================

import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import type {
  ResolvedFeeItem,
  AdmissionFeeAdjustment,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';

interface Props {
  /** Present in edit mode. When absent, falls back to local computation from
   *  matchedStructure + inFlightAdjustments. */
  learnerId?: string;
  matchedStructure: AdmissionFeeStructureWithItems | null;
  inFlightAdjustments?: AdmissionFeeAdjustment[];
  /** Bumped by parent (e.g. after AdjustmentsPanel.onChange) to force recompute. */
  refreshTick: number;
}

export function ResolvedTotalPanel({
  learnerId,
  matchedStructure,
  inFlightAdjustments,
  refreshTick,
}: Props) {
  const [items, setItems] = useState<ResolvedFeeItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (learnerId) {
      FeeResolutionService.resolveForLearner(learnerId)
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch((err) => {
          console.error('[resolved-total-panel] resolveForLearner:', err);
          setItems([]);
          setTotal(0);
        });
    } else if (matchedStructure) {
      const baseItems: ResolvedFeeItem[] = matchedStructure.items.map((it) => ({
        category_id: it.billing_category_id,
        category_name:
          (it as { category_name?: string }).category_name ?? it.billing_category_id,
        amount: Number(it.amount),
        source: 'structure',
      }));
      // Apply in-flight adjustments locally
      const perCat = new Map<string, number>();
      let global = 0;
      (inFlightAdjustments ?? [])
        .filter((a) => a.status === 'active')
        .forEach((a) => {
          if (a.billing_category_id) {
            perCat.set(
              a.billing_category_id,
              (perCat.get(a.billing_category_id) ?? 0) + Number(a.delta_amount),
            );
          } else {
            global += Number(a.delta_amount);
          }
        });
      const merged = baseItems.map((it) => ({
        ...it,
        amount: Math.max(0, it.amount + (perCat.get(it.category_id ?? '') ?? 0)),
      }));
      if (global !== 0) {
        merged.push({
          category_id: null,
          category_name: 'Global Adjustment',
          amount: global,
          source: 'adjustment_global',
        });
      }
      setItems(merged);
      setTotal(merged.reduce((s, it) => s + Number(it.amount), 0));
    } else {
      setItems([]);
      setTotal(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId, matchedStructure, JSON.stringify(inFlightAdjustments), refreshTick]);

  return (
    <div className="rounded border-2 border-primary p-4">
      <div className="mb-2 text-sm font-medium">Resolved Total</div>
      <div className="text-2xl font-bold">₹{total.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-xs text-muted-foreground">{items.length} line items</div>
    </div>
  );
}
