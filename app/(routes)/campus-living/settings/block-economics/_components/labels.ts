// Shared enum labels + ₹ formatter for the block-economics CRUD components.
// Mirrors the CHECK constraints in hostel_block_economics_entries
// (supabase/migrations/20260607120000_bed_economics_substrate.sql).

import type { CostKind, CostCategory } from '@/lib/services/campus-living/block-economics-service';

export const COST_KIND_LABELS: Record<CostKind, string> = {
  opex: 'Operating cost',
  capex: 'Capital cost',
};

/** Plain-English category labels — the accounts office reads these. */
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  staff: 'Staff & wages',
  utilities: 'Utilities (power, water)',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance & repairs',
  mess_subsidy: 'Mess subsidy',
  other: 'Other operating cost',
  capex_building: 'Building (capital)',
  capex_renovation: 'Renovation (capital)',
};

/** Which categories belong to which kind (drives the form's category dropdown). */
export const OPEX_CATEGORIES: CostCategory[] = [
  'staff',
  'utilities',
  'housekeeping',
  'maintenance',
  'mess_subsidy',
  'other',
];

export const CAPEX_CATEGORIES: CostCategory[] = [
  'capex_building',
  'capex_renovation',
];

/**
 * ₹ in Indian formatting (en-IN), rounded to whole rupees for display —
 * e.g. 1234567 → ₹12,34,567. Matches the Bed Economics dashboard's
 * format.ts so table figures read consistently across the feature. The form
 * input still accepts paise (step="0.01"); rounding applies only on display.
 */
export function formatRupees(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
