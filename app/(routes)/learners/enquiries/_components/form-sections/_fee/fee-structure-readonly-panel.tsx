'use client';

// ============================================================================
// fee-structure-readonly-panel.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 9 — Finance tab read-only "Fee Structure" section.
// Auto-fetches the matching active fee structure via the 8-dimension matrix
// when all dimensions are present. Renders a polished card with header,
// per-item rows, and a Subtotal footer. Sibling components
// (FeeAdjustmentsPanel, NoMatchEmptyState) handle the rest of the tab.
// ----------------------------------------------------------------------------
// Spec §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 9
// ============================================================================

import { useEffect, useState } from 'react';
import { FeeResolutionService } from '@/lib/services/admission/fee-resolution-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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
  /** Monotonic counter the parent can bump to force a re-fetch — e.g. when the
   *  user clicks "Sync Fees" or after the LegacyModeBanner finishes adoption.
   *  Listed alongside JSON.stringify(dims) in the effect dep array so a bump
   *  with unchanged dims still triggers the fetch. */
  refreshTick?: number;
}

function isFullDims(d: Partial<FeeStructureMatrixDimensions>): boolean {
  return !!(
    d.institution_id &&
    d.degree_id &&
    d.department_id &&
    d.programme_id &&
    d.quota_id &&
    d.community_category_id &&
    d.admission_year_id
  );
}

export function FeeStructureReadonlyPanel({ dims, onMatchChange, refreshTick = 0 }: Props) {
  const [match, setMatch] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [categoriesById, setCategoriesById] = useState<Record<string, BillingCategory>>({});
  const [loading, setLoading] = useState(false);
  // id -> name for the hostel room / mess tiers declared on the structure.
  // Read-only: this panel reports what the fee structure says, it never writes
  // to the learner. (Migration 20260910110000.)
  const [tierNames, setTierNames] = useState<Record<string, string>>({});

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

  // Hostel/mess tier names. Both tables are world-readable to authenticated
  // users (RLS SELECT qual = true), so this needs no permission handling.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    Promise.all([
      supabase.from('hostel_categories').select('id, name'),
      supabase.from('mess_categories').select('id, name'),
    ])
      .then(([rooms, messes]) => {
        if (cancelled) return;
        if (rooms.error) throw rooms.error;
        if (messes.error) throw messes.error;
        const map: Record<string, string> = {};
        for (const r of [...(rooms.data ?? []), ...(messes.data ?? [])]) {
          map[r.id] = r.name;
        }
        setTierNames(map);
      })
      .catch((err) => {
        // Soft-fail: the tier row is simply omitted rather than blocking the
        // fee panel, which is the more important content here.
        console.error('[fee-structure-readonly-panel] load hostel tiers:', err);
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
  }, [JSON.stringify(dims), refreshTick]);

  if (!isFullDims(dims)) {
    // Build a specific list of which dims are missing so the counsellor
    // knows exactly what to fill. Each entry includes the friendly label
    // and the form tab where the field lives — saves digging.
    const missing: string[] = [];
    if (!dims.institution_id) missing.push('Institution (Academic Information)');
    if (!dims.degree_id) missing.push('Degree (Academic Information)');
    if (!dims.department_id) missing.push('Department (Academic Information)');
    if (!dims.programme_id) missing.push('Programme (Course Selection)');
    if (!dims.quota_id) missing.push('Quota (Course Selection)');
    if (!dims.community_category_id) missing.push('Community (Basic Details)');
    if (!dims.admission_year_id) missing.push('Admission Year (Course Selection)');

    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">
          {missing.length} field{missing.length !== 1 ? 's' : ''} required to load the fee structure
        </p>
        <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 ml-4 list-disc">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (loading) {
    return <p className="text-sm">Loading fee structure…</p>;
  }
  if (!match) {
    // Empty state handled separately by NoMatchEmptyState.
    return null;
  }

  const subtotal = match.items.reduce((sum, it) => sum + Number(it.amount), 0);

  // Hostel tier declared on the matched structure. Only hostel structures carry
  // one, so its presence is itself the "is this a hostel package" signal — no
  // accommodation lookup needed.
  const roomTier = match.hostel_category_id
    ? tierNames[match.hostel_category_id] ?? null
    : null;
  const messTier = match.mess_category_id
    ? tierNames[match.mess_category_id] ?? null
    : null;
  const hasTier = !!(roomTier || messTier);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Auto-populated from
          </div>
          <div className="mt-0.5 text-sm font-semibold truncate">{match.name}</div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {match.items.length} item{match.items.length !== 1 ? 's' : ''}
        </span>
      </div>
      {hasTier && (
        <div className="border-b bg-muted/10 px-4 py-2.5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Hostel Categories
          </div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Room: </span>
              <span className="font-medium">{roomTier ?? '—'}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Mess: </span>
              <span className="font-medium">{messTier ?? '—'}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Declared on this fee structure. Shown for reference — the learner&apos;s
            own record is not changed here.
          </p>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Category</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {match.items.map((it, idx) => {
            const label =
              categoriesById[it.billing_category_id]?.category_name ?? it.billing_category_id;
            return (
              <tr
                key={it.id}
                className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}
              >
                <td className="px-4 py-2">{label}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  ₹{Number(it.amount).toLocaleString('en-IN')}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/30">
            <td className="px-4 py-3 text-sm font-semibold">Subtotal</td>
            <td className="px-4 py-3 text-right text-base font-bold tabular-nums">
              ₹{subtotal.toLocaleString('en-IN')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
