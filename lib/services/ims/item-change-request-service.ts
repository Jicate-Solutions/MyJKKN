// lib/services/ims/item-change-request-service.ts
//
// Item edits that need a second signature.
//
// A POS store manager runs the counter. They may open the item form and change
// what they think is wrong — but Save raises a REQUEST rather than writing to the
// item. A super admin approves, and approving is what applies the change.
//
// Two things worth knowing about the shape here:
//
//   - THE DIFF IS COMPUTED CLIENT-SIDE, THE APPLY IS NOT. What we store is only
//     what changed, plus what those fields held at the time. The approver reads
//     that pair as a before/after. The database re-checks the "before" half
//     against the live row when approving, so a request whose item moved in the
//     meantime is refused rather than silently clobbering someone else's edit.
//
//   - APPROVING GOES THROUGH AN RPC, NEVER AN UPDATE. There is no UPDATE grant on
//     ims_item_change_requests at all, so a requester cannot mark their own
//     request approved even by crafting the call. Only
//     ims_review_item_change_request can move it, and it refuses anyone who is
//     not a super admin.

import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Columns a requester may propose. Mirrors the SET list in the SQL function.
 *
 * `code` is NOT here: since 20260804120000 item codes are generated from the
 * institution's sequence and are immutable. It was removed from the RPC's SET
 * list in the same migration — both were needed, because dropping it only here
 * would still let a request crafted by hand rewrite a generated code.
 */
export const PROPOSABLE_ITEM_FIELDS = [
  'name', 'description', 'company_name', 'brand',
  'category_id', 'item_type',
  'base_unit_id', 'purchase_unit_id', 'sale_unit_id', 'indent_unit_id',
  'cost_price', 'mrp', 'selling_price', 'gst_rate', 'hsn_code',
  'reorder_level', 'max_stock_level',
  'is_active', 'track_batch', 'track_expiry', 'is_sellable_to_students',
  'is_distributable', 'is_bundle', 'is_chemical',
  'variant_attributes', 'image_url',
] as const;

export type ProposableItemField = (typeof PROPOSABLE_ITEM_FIELDS)[number];

/**
 * Human labels for the approver's diff. Keyed by column, not by
 * PROPOSABLE_ITEM_FIELDS — `code` stays listed so a request raised before
 * 20260804120000 still renders a readable label instead of a bare column name.
 * The RPC will no longer apply it.
 */
export const ITEM_FIELD_LABELS: Record<string, string> = {
  code: 'Item code',
  name: 'Name',
  description: 'Description',
  company_name: 'Company',
  brand: 'Brand',
  category_id: 'Category',
  item_type: 'Item type',
  base_unit_id: 'Base unit',
  purchase_unit_id: 'Purchase unit',
  sale_unit_id: 'Sale unit',
  indent_unit_id: 'Indent unit',
  cost_price: 'Cost price',
  mrp: 'MRP',
  selling_price: 'Selling price',
  gst_rate: 'GST rate',
  hsn_code: 'HSN code',
  reorder_level: 'Reorder level',
  max_stock_level: 'Max stock level',
  is_active: 'Active',
  track_batch: 'Track batch',
  track_expiry: 'Track expiry',
  is_sellable_to_students: 'Sellable at the counter',
  is_distributable: 'Distributable',
  is_bundle: 'Is a bundle',
  is_chemical: 'Is a chemical',
  variant_attributes: 'Variant attributes',
  image_url: 'Image',
};

export interface ImsItemChangeRequest {
  id: string;
  item_id: string;
  institution_id: string;
  store_id: string | null;
  requested_by: string;
  requested_at: string;
  reason: string | null;
  proposed_changes: Record<string, unknown>;
  current_values: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  applied_at: string | null;
  created_at: string;
  item?: { id: string; code: string; name: string } | null;
  requester?: { full_name: string | null } | null;
  reviewer?: { full_name: string | null } | null;
}

/**
 * Which fields actually changed, and what they held before.
 *
 * Comparison is deliberately loose about `null` vs `''` vs `undefined`: a form
 * that renders an empty text box as `''` where the row holds `null` has not
 * changed anything, and sending it as a change would give the approver a diff
 * with nothing in it to decide.
 */
export function diffItemChanges(
  original: Record<string, any>,
  proposed: Record<string, any>,
): { changes: Record<string, unknown>; before: Record<string, unknown> } {
  const changes: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};

  const normalize = (v: unknown) => {
    if (v === undefined || v === null || v === '') return null;
    // Numeric columns come back from Postgres as strings ("45.00"); comparing
    // those to a form's number would flag every field as changed.
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      return Number(v);
    }
    return v;
  };

  for (const field of PROPOSABLE_ITEM_FIELDS) {
    if (!(field in proposed)) continue;

    const a = normalize(original?.[field]);
    const b = normalize(proposed[field]);

    if (a !== b) {
      changes[field] = proposed[field] ?? null;
      before[field] = original?.[field] ?? null;
    }
  }

  return { changes, before };
}

export class ImsItemChangeRequestService {
  private static get supabase() {
    // IMS tables are not in the Supabase-generated Database type.
    return createClientSupabaseClient() as ReturnType<typeof createClientSupabaseClient> & {
      from: (table: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => any;
    };
  }

  /** Raise a request for the fields that changed. Returns null if nothing did. */
  static async createRequest(input: {
    itemId: string;
    institutionId: string;
    storeId?: string | null;
    requestedBy: string;
    original: Record<string, any>;
    proposed: Record<string, any>;
    reason?: string | null;
  }): Promise<ImsItemChangeRequest | null> {
    const { changes, before } = diffItemChanges(input.original, input.proposed);

    if (Object.keys(changes).length === 0) return null;

    const { data, error } = await this.supabase
      .from('ims_item_change_requests')
      .insert({
        item_id: input.itemId,
        institution_id: input.institutionId,
        store_id: input.storeId ?? null,
        requested_by: input.requestedBy,
        proposed_changes: changes,
        current_values: before,
        reason: input.reason ?? null,
      })
      .select()
      .single();

    if (error) {
      // The partial unique index is the friendly error worth translating: one
      // open request per item, or the approver gets two diffs both claiming to
      // start from the current values.
      if (error.code === '23505') {
        throw new Error(
          'This item already has a change request waiting for approval. ' +
            'Ask a super admin to review it before sending another.',
        );
      }
      throw error;
    }

    return data as ImsItemChangeRequest;
  }

  /** Requests, newest first. Pass status to filter the queue. */
  static async listRequests(filters: {
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
    institutionId?: string | null;
    requestedBy?: string | null;
    limit?: number;
  } = {}): Promise<ImsItemChangeRequest[]> {
    let query = this.supabase
      .from('ims_item_change_requests')
      .select(
        `*,
         item:ims_items!item_id(id, code, name),
         requester:profiles!requested_by(full_name),
         reviewer:profiles!reviewed_by(full_name)`
      )
      .order('requested_at', { ascending: false })
      .limit(filters.limit ?? 100);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.institutionId) query = query.eq('institution_id', filters.institutionId);
    if (filters.requestedBy) query = query.eq('requested_by', filters.requestedBy);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ImsItemChangeRequest[];
  }

  /** Item ids that already have a request waiting, for badging the item list. */
  static async getPendingItemIds(institutionId?: string | null): Promise<Set<string>> {
    let query = this.supabase
      .from('ims_item_change_requests')
      .select('item_id')
      .eq('status', 'pending');

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;
    if (error) return new Set();
    return new Set(((data ?? []) as { item_id: string }[]).map((r) => r.item_id));
  }

  /**
   * Approve (and apply) or reject.
   *
   * Goes through the RPC because there is no UPDATE grant on the table — the
   * decision and the write to ims_items happen in one transaction, so an approved
   * request can never exist without the change it approved.
   */
  static async review(
    requestId: string,
    approve: boolean,
    note?: string | null,
  ): Promise<{ status: string; item_id: string }> {
    const { data, error } = await this.supabase.rpc('ims_review_item_change_request', {
      p_request_id: requestId,
      p_approve: approve,
      p_note: note ?? null,
    });

    if (error) {
      // Staleness is the one failure a human can act on, so say so plainly
      // rather than surfacing a Postgres error code.
      if (error.code === '40001' || /changed since this request/i.test(error.message ?? '')) {
        throw new Error(
          'The item has changed since this request was raised, so it was not applied. ' +
            'Ask for a fresh request.',
        );
      }
      throw new Error(error.message || 'Could not review the request');
    }

    return data as { status: string; item_id: string };
  }
}
