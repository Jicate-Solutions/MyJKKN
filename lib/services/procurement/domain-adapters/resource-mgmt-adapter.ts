// lib/services/procurement/domain-adapters/resource-mgmt-adapter.ts
//
// Resource Management implementation of ProcurementDomainAdapter — the SECOND
// registered domain (PLAN-procurement-v1 §Phase 5, the reuse proof).
//
// RM's inventory model differs from IMS: no batches/stock-summary — each
// `resources` row is one record (asset or bulk lot) with its own quantity,
// location, caretaker, warranty. Director decisions (2026-07-11 interview):
//   * restock pick  -> quantity top-up on the existing record;
//   * new item      -> ONE draft record with the full quantity, tagged
//     'needs-setup' (RM team completes room/caretaker later);
//   * top-ups never rewrite the record's warranty/vendor/value;
//   * "in stock" counts USABLE units only (maintenance/out_of_order show 0;
//     retired/inactive never appear in the picker).
//
// Writes go through two SECURITY DEFINER RPCs (20260711093000 migration) gated
// on procurement.grn_verify + institution scope — resources table RLS requires
// resources.resources.create/edit, which storekeepers deliberately lack.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementDomainAdapter,
  CatalogItem,
  ItemSnapshot,
  AcceptedReceiptLine,
  DomainCtx,
} from './types';

// resources columns used here are not all in the generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClientSupabaseClient() as any;

/** Statuses whose units count as USABLE stock (Director: exclude maintenance etc.). */
const USABLE_STATUSES = new Set(['available', 'occupied']);
/** Statuses hidden from the picker entirely. */
const HIDDEN_STATUSES = ['retired', 'inactive'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResource(row: any): CatalogItem {
  return {
    domainItemId: row.id,
    name: row.name,
    code: row.resource_code ?? null,
    spec: row.description ?? null,
    unitLabel: 'unit',
    isChemical: false, // RM never carries chemicals — those belong to IMS (batch/expiry).
    costPrice: null,
    currentStock: USABLE_STATUSES.has(row.status)
      ? Number(row.current_stock_quantity ?? 0)
      : 0,
  };
}

export const resourceMgmtAdapter: ProcurementDomainAdapter = {
  domain: 'resource_mgmt',
  // fn_procurement_rm_post_receipt claims the GRN line atomically in its own
  // transaction — replaying a post is a no-op, so verify retries are safe.
  idempotentPosts: true,

  async searchItems(query: string, ctx: DomainCtx): Promise<CatalogItem[]> {
    let q = db()
      .from('resources')
      .select('id,name,resource_code,description,status,current_stock_quantity')
      .eq('institution_id', ctx.institutionId)
      // NULL status must stay visible: `status not in (...)` is NULL for unset
      // rows and would silently drop them from the picker.
      .or(`status.is.null,status.not.in.(${HIDDEN_STATUSES.join(',')})`)
      .order('name')
      .limit(20);
    // Double-quote the ilike patterns so commas/parens/dots in user input stay
    // literal instead of re-parsing as PostgREST filter syntax (injection);
    // strip the two chars that would break out of the quotes.
    const needle = query.trim().replace(/["\\]/g, '');
    if (needle) {
      q = q.or(`name.ilike."%${needle}%",resource_code.ilike."%${needle}%"`);
    }
    const { data, error } = await q;
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(mapResource);
  },

  async getItem(domainItemId: string, ctx: DomainCtx): Promise<CatalogItem | null> {
    const { data, error } = await db()
      .from('resources')
      .select('id,name,resource_code,description,status,current_stock_quantity')
      .eq('id', domainItemId)
      .eq('institution_id', ctx.institutionId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapResource(data) : null;
  },

  async postReceipt(line: AcceptedReceiptLine, _ctx: DomainCtx): Promise<void> {
    const totalValue = line.totalValue ?? line.costPrice * line.acceptedQuantity;
    // The RPC binds the write to this exact GRN line (must be linked to the
    // resource, in a verified resource_mgmt GRN of the same institution) and
    // claims it exactly-once via domain_posted_at — a re-post is a no-op.
    // RM quantities are INTEGER units by design (Director 2026-07-11: each
    // resources row is one record with discrete usable units — assets/lots,
    // never fractional). The RPC's integer p_quantity == numeric accepted_
    // quantity equality is therefore exact; fractional lines belong to IMS.
    const { error } = await db().rpc('fn_procurement_rm_post_receipt', {
      p_grn_item_id: line.grnItemId,
      p_resource_id: line.domainItemId,
      p_quantity: line.acceptedQuantity,
      p_total_value: totalValue,
    });
    if (error) throw error;
  },

  async reconcileNewItem(
    snapshot: ItemSnapshot,
    ctx: DomainCtx,
    poItemId?: string | null
  ): Promise<string> {
    // Passing the PO line lets the RPC lock it and reuse an already-materialized
    // draft (split delivery: GRN2 tops up GRN1's record instead of duplicating).
    // Scope note (review r3): the RPC is intentionally NOT bound to a GRN line —
    // the hook's contract includes PR-approval-time materialization, where no
    // GRN exists yet. A direct caller gains nothing beyond the legitimate flow:
    // only 0-qty needs-setup drafts in their own institution (RM reviews these
    // during setup), and stock can only ever land on a draft via post_receipt,
    // which IS line-bound. No existing resource is reachable from here.
    const { data, error } = await db().rpc('fn_procurement_rm_reconcile_new_item', {
      p_institution_id: ctx.institutionId,
      p_name: snapshot.name,
      p_description: snapshot.spec ?? null,
      p_po_item_id: poItemId ?? null,
    });
    if (error) throw error;
    return data as string;
  },
};
