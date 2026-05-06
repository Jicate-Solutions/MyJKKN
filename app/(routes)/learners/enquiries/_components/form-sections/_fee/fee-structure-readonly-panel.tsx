'use client';

// ============================================================================
// fee-structure-readonly-panel.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 9 — Finance tab read-only "Fee Structure" section.
// Auto-fetches the matching active fee structure via the 8-dimension matrix
// when all dimensions are present. Renders a read-only table of base line items
// before any adjustments. Sibling components (FeeAdjustmentsPanel,
// ResolvedTotalPanel, NoMatchEmptyState) handle the rest of the Finance tab.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 9
// ============================================================================

import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import type {
  FeeStructureMatrixDimensions,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

interface Props {
  dims: Partial<FeeStructureMatrixDimensions>;
  /** Notifies the parent when match status changes. Parent then knows whether to
   *  render the NoMatchEmptyState fallback. Also forwards the matched record so
   *  the parent can reuse it without a second fetch. */
  onMatchChange?: (match: AdmissionFeeStructureWithItems | null) => void;
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

export function FeeStructureReadonlyPanel({ dims, onMatchChange }: Props) {
  const [match, setMatch] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categoriesById, setCategoriesById] = useState<Record<string, BillingCategory>>({});
  const [loading, setLoading] = useState(false);

  // Fetch category names once on mount.
  // admission_fee_structure_items only carries billing_category_id, not the
  // human label, so we dereference the id → name client-side.
  useEffect(() => {
    let cancelled = false;
    BillingCategoryService.getActiveBillingCategories()
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, BillingCategory> = {};
        for (const cat of list) {
          map[cat.id] = cat;
        }
        setCategoriesById(map);
      })
      .catch((err) => {
        // Soft-fail: we still render rows with the category_id as the label.
        console.error('[fee-structure-readonly-panel] load categories:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFullDims(dims)) {
      setMatch(null);
      onMatchChange?.(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    FeeResolutionService.previewMatchByDimensions(dims as FeeStructureMatrixDimensions)
      .then((m) => {
        if (cancelled) return;
        setMatch(m);
        onMatchChange?.(m);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[fee-structure-readonly-panel] previewMatchByDimensions:', err);
        setMatch(null);
        onMatchChange?.(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(dims)]);

  if (!isFullDims(dims)) {
    return (
      <p className="text-sm text-muted-foreground">
        Select institution, degree, department, programme, quota, community,
        accommodation, and admission year to load the fee structure.
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm">Loading fee structure…</p>;
  }
  if (!match) {
    // Empty state handled separately by NoMatchEmptyState.
    return null;
  }

  return (
    <div className="rounded border bg-muted/30 p-4">
      <div className="mb-2 text-sm font-medium">
        Auto-populated from: <span className="font-mono">{match.name}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1">Category</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {match.items.map((it) => {
            const label =
              categoriesById[it.billing_category_id]?.category_name ?? it.billing_category_id;
            return (
              <tr key={it.id} className="border-t">
                <td className="py-1">{label}</td>
                <td className="py-1 text-right">
                  ₹{Number(it.amount).toLocaleString('en-IN')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
