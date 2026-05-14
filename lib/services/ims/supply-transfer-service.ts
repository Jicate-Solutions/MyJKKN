// lib/services/ims/supply-transfer-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsSupplyShipment,
  ImsShipmentFilters,
  CreateShipmentDto,
  DispatchShipmentDto,
  ConfirmReceiptLine,
} from '@/types/ims';

export class ImsSupplyTransferService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  private static readonly SHIPMENT_SELECT = `
    *,
    source_store:ims_stores!source_store_id(id,name,code),
    destination_institution:institutions!destination_institution_id(id,institution_name),
    destination_store:ims_stores!destination_store_id(id,name,code),
    dispatched_by_profile:profiles!dispatched_by(full_name),
    items:ims_supply_shipment_items(
      *,
      item:ims_items(id,name,code)
    )
  `;

  /**
   * List shipments with optional filters.
   */
  static async getShipments(filters: ImsShipmentFilters = {}): Promise<{
    data: ImsSupplyShipment[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT, { count: 'exact' });

      if (filters.request_id) {
        query = query.eq('request_id', filters.request_id);
      }
      if (filters.source_store_id) {
        query = query.eq('source_store_id', filters.source_store_id);
      }
      if (filters.destination_institution_id) {
        query = query.eq('destination_institution_id', filters.destination_institution_id);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      query = query
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: (data || []) as ImsSupplyShipment[],
        metadata: { total: count || 0, page, limit, totalPages: count ? Math.ceil(count / limit) : 0 },
      };
    } catch (error) {
      console.error('[ImsSupplyTransferService] getShipments error:', error);
      throw error;
    }
  }

  /**
   * Get shipments for a specific transfer request.
   */
  static async getShipmentsForRequest(requestId: string): Promise<ImsSupplyShipment[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT)
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ImsSupplyShipment[];
    } catch (error) {
      console.error('[ImsSupplyTransferService] getShipmentsForRequest error:', error);
      throw error;
    }
  }

  /**
   * Central store: create a shipment for an approved transfer request.
   * Status starts at 'preparing'. Stock is NOT deducted yet.
   */
  static async createShipment(dto: CreateShipmentDto): Promise<ImsSupplyShipment> {
    try {
      // Generate shipment_no: SHP-YYYYMMDD-XXXXX
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
      const shipmentNo = `SHP-${dateStr}-${rand}`;

      const { data: shipment, error: shipmentError } = await this.supabase
        .from('ims_supply_shipments')
        .insert({
          shipment_no: shipmentNo,
          request_id: dto.request_id,
          source_store_id: dto.source_store_id,
          destination_institution_id: dto.destination_institution_id,
          destination_store_id: dto.destination_store_id ?? null,
          status: 'preparing',
        })
        .select('id')
        .single();

      if (shipmentError) throw shipmentError;

      // Insert line items
      const lines = dto.items.map((item) => ({
        shipment_id: shipment.id,
        item_id: item.item_id,
        request_item_id: item.request_item_id,
        dispatched_qty: item.dispatched_qty,
        source_batch_id: item.source_batch_id ?? null,
        cost_price: item.cost_price ?? 0,
      }));

      const { error: itemsError } = await this.supabase
        .from('ims_supply_shipment_items')
        .insert(lines);

      if (itemsError) throw itemsError;

      // Return full shipment with joins
      const { data: full, error: fullError } = await this.supabase
        .from('ims_supply_shipments')
        .select(this.SHIPMENT_SELECT)
        .eq('id', shipment.id)
        .single();

      if (fullError) throw fullError;
      return full as ImsSupplyShipment;
    } catch (error) {
      console.error('[ImsSupplyTransferService] createShipment error:', error);
      throw error;
    }
  }

  /**
   * Central store: mark shipment as dispatched.
   * DB trigger `trg_ims_apply_shipment_to_stock` fires on this update
   * and deducts stock from central store + sets request.status = 'shipped'.
   */
  static async dispatchShipment(shipmentId: string, dto: DispatchShipmentDto): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_supply_shipments')
        .update({
          status: 'dispatched',
          dispatched_at: new Date().toISOString(),
          dispatched_by: dto.dispatched_by,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shipmentId)
        .eq('status', 'preparing');   // guard: only from 'preparing'

      if (error) throw error;
    } catch (error) {
      console.error('[ImsSupplyTransferService] dispatchShipment error:', error);
      throw error;
    }
  }

  /**
   * College store: confirm receipt of a dispatched shipment.
   * Calls the `ims_confirm_supply_receipt` RPC which:
   *   - Sets shipment.status = 'received' or 'received_with_variance'
   *   - Sets request.status = 'received' or 'received_with_variance'
   *   - Calls ims_create_branch_batches_from_shipment to create stock batches
   */
  static async confirmReceipt(
    shipmentId: string,
    receivedBy: string,
    notes: string,
    lines: ConfirmReceiptLine[]
  ): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('ims_confirm_supply_receipt', {
        p_shipment_id: shipmentId,
        p_received_by: receivedBy,
        p_receipt_notes: notes,
        p_lines: lines,
      });

      if (error) throw error;
    } catch (error) {
      console.error('[ImsSupplyTransferService] confirmReceipt error:', error);
      throw error;
    }
  }
}
