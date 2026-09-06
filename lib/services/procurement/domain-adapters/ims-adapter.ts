// lib/services/procurement/domain-adapters/ims-adapter.ts
//
// IMS implementation of ProcurementDomainAdapter — the FIRST registered domain.
// Maps procurement's polymorphic item view onto the ims_* catalog + inventory.
//
// postReceipt() intentionally mirrors the proven stock-posting block in
// ImsGRNService.approveGRN (batch insert -> stock_summary upsert -> 'purchase'
// financial txn). It is duplicated rather than imported so the existing GRN
// service stays untouched; the two should later be unified into one shared helper.
// Source of truth: lib/services/ims/grn-service.ts (approveGRN, ~lines 338-403).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ProcurementDomainAdapter,
  CatalogItem,
  ItemSnapshot,
  AcceptedReceiptLine,
  DomainCtx,
} from './types';

// IMS tables are not in the Supabase-generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClientSupabaseClient() as any;

function mapItem(row: any): CatalogItem {
  return {
    domainItemId: row.id,
    name: row.name,
    code: row.code ?? null,
    unitId: row.purchase_unit_id ?? row.base_unit_id ?? null,
    hsnCode: row.hsn_code ?? null,
    gstRate: row.gst_rate ?? null,
    // effective chemical flag = per-item override, else category flag
    isChemical: row.is_chemical ?? row.category?.is_chemical ?? false,
    costPrice: row.cost_price ?? null,
    reorderLevel: row.reorder_level ?? null,
  };
}

/**
 * Attach on-hand stock (summed across stores) to catalog items so the PR picker can show
 * "in stock: X" and the request captures a current_stock snapshot — drives the PRD's
 * "when stock reaches minimum level, raise a PR" restock decision.
 */
async function attachCurrentStock(items: CatalogItem[]): Promise<void> {
  if (!items.length) return;
  const ids = items.map((i) => i.domainItemId);
  const { data } = await db()
    .from('ims_stock_summary')
    .select('item_id, current_quantity')
    .in('item_id', ids);
  const byId = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    byId.set(r.item_id, (byId.get(r.item_id) ?? 0) + Number(r.current_quantity ?? 0));
  }
  for (const it of items) it.currentStock = byId.get(it.domainItemId) ?? 0;
}

export const imsAdapter: ProcurementDomainAdapter = {
  domain: 'ims',

  async searchItems(query: string, ctx: DomainCtx): Promise<CatalogItem[]> {
    let q = db()
      .from('ims_items')
      .select('id,name,code,purchase_unit_id,base_unit_id,hsn_code,gst_rate,is_chemical,cost_price,reorder_level,category:ims_item_categories(is_chemical)')
      .eq('institution_id', ctx.institutionId)
      .limit(20);
    if (query?.trim()) {
      q = q.or(`name.ilike.%${query}%,code.ilike.%${query}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const items = (data ?? []).map(mapItem);
    await attachCurrentStock(items);
    return items;
  },

  async getItem(domainItemId: string): Promise<CatalogItem | null> {
    const { data, error } = await db()
      .from('ims_items')
      .select('id,name,code,purchase_unit_id,base_unit_id,hsn_code,gst_rate,is_chemical,cost_price,reorder_level,category:ims_item_categories(is_chemical)')
      .eq('id', domainItemId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const item = mapItem(data);
    await attachCurrentStock([item]);
    return item;
  },

  async postReceipt(line: AcceptedReceiptLine, ctx: DomainCtx): Promise<void> {
    const supabase = db();
    const totalValue = line.totalValue ?? line.costPrice * line.acceptedQuantity;
    // Procurement is institution-scoped and passes no IMS store, but every IMS
    // stock view filters batches by store_id (getBatchesForItem, stock lists) —
    // a store-less batch is silently hidden (store_id = NULL never matches an
    // .eq filter). Attribute the receipt to the item's own store; fall back to
    // institution-level only when the item itself is store-less.
    let storeId: string | null = ctx.storeId ?? null;
    if (!storeId) {
      const { data: itemRow } = await supabase
        .from('ims_items')
        .select('store_id')
        .eq('id', line.domainItemId)
        .maybeSingle();
      storeId = itemRow?.store_id ?? null;
    }
    const storeCols = storeId ? { store_id: storeId } : {};
    const entryDate = new Date().toISOString().slice(0, 10); // ims_stock_batches.entry_date is NOT NULL

    // 1) Create stock batch (batch-wise inventory). quantity_available is NOT NULL
    //    with no DB default — a fresh batch has its full quantity available (nothing
    //    consumed yet), so it must mirror acceptedQuantity or the insert throws.
    await supabase.from('ims_stock_batches').insert({
      item_id: line.domainItemId,
      batch_number: line.batchNumber ?? null,
      expiry_date: line.expiryDate ?? null,
      quantity: line.acceptedQuantity,
      quantity_available: line.acceptedQuantity,
      cost_price: line.costPrice,
      total_value: totalValue,
      grn_id: line.grnId,
      entry_date: entryDate,
      location_type: 'central_store',
      department_id: null,
      institution_id: ctx.institutionId,
      ...storeCols,
    });

    // 2) Upsert stock summary (primary: store_id; fallback: institution_id)
    let stockQuery = supabase
      .from('ims_stock_summary')
      .select('id, current_quantity, available_quantity, total_value')
      .eq('item_id', line.domainItemId);
    stockQuery = storeId
      ? stockQuery.eq('store_id', storeId)
      : stockQuery.eq('institution_id', ctx.institutionId);
    const { data: existing } = await stockQuery.maybeSingle();

    if (existing) {
      await supabase
        .from('ims_stock_summary')
        .update({
          current_quantity: existing.current_quantity + line.acceptedQuantity,
          available_quantity: existing.available_quantity + line.acceptedQuantity,
          total_value: existing.total_value + totalValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('ims_stock_summary').insert({
        item_id: line.domainItemId,
        current_quantity: line.acceptedQuantity,
        reserved_quantity: 0,
        available_quantity: line.acceptedQuantity,
        total_value: totalValue,
        institution_id: ctx.institutionId,
        ...storeCols,
      });
    }

    // 3) Record the purchase in the financial ledger
    await supabase.from('ims_financial_transactions').insert({
      transaction_type: 'purchase',
      reference_id: line.grnId,
      reference_type: 'grn',
      amount: totalValue,
      description: `GRN ${line.grnNumber} - Item received (procurement)`,
      item_id: line.domainItemId,
      quantity: line.acceptedQuantity,
      created_by: ctx.userId,
      institution_id: ctx.institutionId,
      ...storeCols,
    });
  },

  async reconcileNewItem(snapshot: ItemSnapshot, ctx: DomainCtx): Promise<string> {
    // Create a catalog item for an approved "new item" Purchase Request.
    //
    // `code` is omitted, not invented. This used to mint `NEW-<timestamp>` and
    // leave the store admin to fix it later; since 20260804120000 the
    // ims_items_autofill_code trigger assigns a real code from the institution's
    // sequence, so an item born here is indistinguishable from one created on the
    // items page. The store admin can still refine the other master fields.
    const { data, error } = await db()
      .from('ims_items')
      .insert({
        name: snapshot.name,
        hsn_code: snapshot.hsnCode ?? null,
        gst_rate: snapshot.gstRate ?? 0,
        is_chemical: snapshot.isChemical ?? null,
        base_unit_id: snapshot.unitId ?? null,
        purchase_unit_id: snapshot.unitId ?? null,
        institution_id: ctx.institutionId,
        ...(ctx.storeId ? { store_id: ctx.storeId } : {}),
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  },
};
