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

  async searchItems(query: string, ctx: DomainCtx): Promise<CatalogItem[]> {
    let q = db()
      .from('resources')
      .select('id,name,resource_code,description,status,current_stock_quantity')
      .eq('institution_id', ctx.institutionId)
      .not('status', 'in', `(${HIDDEN_STATUSES.join(',')})`)
      .order('name')
      .limit(20);
    const needle = query.trim();
    if (needle) {
      q = q.or(`name.ilike.%${needle}%,resource_code.ilike.%${needle}%`);
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
    const { error } = await db().rpc('fn_procurement_rm_post_receipt', {
      p_resource_id: line.domainItemId,
      p_quantity: line.acceptedQuantity,
      p_total_value: totalValue,
    });
    if (error) throw error;
  },

  async reconcileNewItem(snapshot: ItemSnapshot, ctx: DomainCtx): Promise<string> {
    const { data, error } = await db().rpc('fn_procurement_rm_reconcile_new_item', {
      p_institution_id: ctx.institutionId,
      p_name: snapshot.name,
      p_description: snapshot.spec ?? null,
    });
    if (error) throw error;
    return data as string;
  },
};
