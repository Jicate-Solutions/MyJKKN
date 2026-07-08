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
    return (data ?? []).map(mapItem);
  },

  async getItem(domainItemId: string): Promise<CatalogItem | null> {
    const { data, error } = await db()
      .from('ims_items')
      .select('id,name,code,purchase_unit_id,base_unit_id,hsn_code,gst_rate,is_chemical,cost_price,reorder_level,category:ims_item_categories(is_chemical)')
      .eq('id', domainItemId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapItem(data) : null;
  },

  async postReceipt(line: AcceptedReceiptLine, ctx: DomainCtx): Promise<void> {
    const supabase = db();
    const totalValue = line.totalValue ?? line.costPrice * line.acceptedQuantity;
    const storeCols = ctx.storeId ? { store_id: ctx.storeId } : {};

    // 1) Create stock batch (batch-wise inventory)
    await supabase.from('ims_stock_batches').insert({
      item_id: line.domainItemId,
      batch_number: line.batchNumber ?? null,
      expiry_date: line.expiryDate ?? null,
      quantity: line.acceptedQuantity,
      cost_price: line.costPrice,
      total_value: totalValue,
      grn_id: line.grnId,
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
    stockQuery = ctx.storeId
      ? stockQuery.eq('store_id', ctx.storeId)
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
    // Code is a placeholder; the store admin can refine item master fields later.
    const code = `NEW-${Date.now().toString().slice(-8)}`;
    const { data, error } = await db()
      .from('ims_items')
      .insert({
        code,
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
