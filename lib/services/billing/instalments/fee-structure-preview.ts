// lib/services/billing/instalments/fee-structure-preview.ts
//
// "What does this learner's fee structure say?" — resolved into the shape the
// New Bill form fills itself from.
//
// Reuses admission_preview_account_bills, the SAME RPC the onboarding preview
// calls, rather than reading admission_fee_structures directly. That matters:
// the resolver applies the 8-dimension structure match, the applies_to year
// rules, and the instalment engine. A second implementation on the billing side
// would be free to answer differently from the one that actually generates
// bills, and the operator would have no way to tell which was right.

import { getErrorMessage } from '@/lib/utils';
import type { BillInstalmentLine } from './bill-instalment-writer';

/** One row of the RPC — one instalment of one fee item. */
interface PreviewRow {
  sort_order: number;
  category_id: string | null;
  category_name: string | null;
  item_amount: number;
  is_billable: boolean;
  owner_module: string | null;
  instalment_no: number | null;
  instalment_count: number | null;
  instalment_amount: number | null;
  share_percent: number | null;
  due_date: string | null;
  matched_source: string | null;
}

/** One fee item, with its schedule folded back together. */
export interface FeeStructurePreviewItem {
  category_id: string;
  category_name: string;
  amount: number;
  /** Empty for an unsplit fee — a single date is not a schedule. */
  instalments: BillInstalmentLine[];
  /** The single due date, when the item is not split. */
  due_date: string | null;
  /**
   * Hostel / mess / transport. Shown so the operator knows the structure
   * contains them, never added to the form: Campus Living and TMS own those
   * bills, and raising them here would double-bill the learner.
   */
  is_billable: boolean;
  owner_module: string | null;
}

export interface FeeStructurePreview {
  items: FeeStructurePreviewItem[];
  /** Nothing resolved — no structure for this learner's admission year, or a
   *  missing quota/community. The caller shows a reason, not an empty panel. */
  isEmpty: boolean;
  error: string | null;
}

interface SupabaseRpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Groups the RPC's per-instalment rows back into one entry per fee item.
 *
 * Shares come from the RPC's `share_percent`, which is the EFFECTIVE share of
 * the rupees the engine produced — not the configured percentage. The last
 * instalment absorbs rounding, so its true share differs slightly from what was
 * typed into the structure, and using the effective value is what makes the
 * percentages add to 100 when they are fed back through the editor.
 */
export function groupPreviewRows(rows: PreviewRow[]): FeeStructurePreviewItem[] {
  const byItem = new Map<number, FeeStructurePreviewItem>();

  for (const row of rows) {
    if (!row.category_id) continue;

    let item = byItem.get(row.sort_order);
    if (!item) {
      item = {
        category_id: row.category_id,
        category_name: row.category_name ?? 'Fee',
        amount: Number(row.item_amount) || 0,
        instalments: [],
        due_date: null,
        is_billable: row.is_billable,
        owner_module: row.owner_module,
      };
      byItem.set(row.sort_order, item);
    }

    if (!row.is_billable || row.due_date == null) continue;

    // instalment_count === 1 is an unsplit fee carrying only its due date.
    if ((row.instalment_count ?? 1) <= 1) {
      item.due_date = row.due_date;
      continue;
    }

    item.instalments.push({
      share_percent: Number(row.share_percent) || 0,
      due_date: row.due_date,
    });
  }

  return Array.from(byItem.values()).map((item) => {
    if (item.instalments.length < 2) {
      // A split that produced one line is not a split. Keep its date instead.
      return {
        ...item,
        due_date: item.due_date ?? item.instalments[0]?.due_date ?? null,
        instalments: [],
      };
    }
    // Force the shares to total exactly 100 — validatePlanLines demands it, and
    // three rounded thirds sum to 99.99. The LAST line takes the remainder,
    // mirroring how the rupees themselves are apportioned.
    const lines = [...item.instalments];
    const used = lines
      .slice(0, -1)
      .reduce((sum, l) => sum + l.share_percent, 0);
    lines[lines.length - 1] = {
      ...lines[lines.length - 1],
      share_percent: Math.round((100 - used) * 100) / 100,
    };
    return { ...item, instalments: lines, due_date: lines[0].due_date };
  });
}

/**
 * Reads the learner's resolved fee structure.
 *
 * Never throws: a learner with no structure (every admission year before 2026
 * has none configured) and a caller without the permission both surface as a
 * message the panel can show, because "the button did nothing" is the worst
 * possible outcome here.
 */
export async function fetchFeeStructurePreview(
  supabase: SupabaseRpc,
  learnerId: string
): Promise<FeeStructurePreview> {
  if (!learnerId) return { items: [], isEmpty: true, error: null };

  const { data, error } = await supabase.rpc('admission_preview_account_bills', {
    p_learner_id: learnerId,
  });

  // Supabase errors are plain objects; try/catch would not see this one.
  if (error) {
    return { items: [], isEmpty: true, error: getErrorMessage(error) };
  }

  const items = groupPreviewRows((data ?? []) as PreviewRow[]);
  return { items, isEmpty: items.length === 0, error: null };
}
