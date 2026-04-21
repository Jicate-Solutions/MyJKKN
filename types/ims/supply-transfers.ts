/**
 * IMS Supply Transfer (Shipment) Types
 * Represents the physical dispatch from central store to a branch institution.
 */

export type ImsShipmentStatus =
  | 'preparing'
  | 'dispatched'
  | 'received'
  | 'received_with_variance'
  | 'cancelled';

export interface ImsSupplyShipment {
  id: string;
  shipment_no: string;
  request_id: string;
  source_store_id: string;
  destination_institution_id: string;
  destination_store_id: string | null;
  dispatched_at: string | null;
  dispatched_by: string | null;
  received_at: string | null;
  received_by: string | null;
  receipt_notes: string | null;
  status: ImsShipmentStatus;
  created_at: string;
  updated_at: string;
  // Joined
  source_store?: { id: string; name: string; code: string } | null;
  destination_institution?: { id: string; institution_name: string } | null;
  destination_store?: { id: string; name: string; code: string } | null;
  dispatched_by_profile?: { full_name: string } | null;
  items?: ImsSupplyShipmentItem[];
}

export interface ImsSupplyShipmentItem {
  id: string;
  shipment_id: string;
  request_item_id: string;
  item_id: string;
  source_batch_id: string | null;
  bundle_parent_item_id: string | null;
  dispatched_qty: number;
  received_qty: number | null;
  variance_qty: number | null;
  variance_reason: string | null;
  cost_price: number;
  created_at: string;
  // Joined
  item?: { id: string; name: string; code: string } | null;
}

export type CreateShipmentDto = {
  request_id: string;
  source_store_id: string;
  destination_institution_id: string;
  destination_store_id?: string;
  items: Array<{
    item_id: string;
    request_item_id: string;
    dispatched_qty: number;
    source_batch_id?: string;
    cost_price?: number;
  }>;
};

export type DispatchShipmentDto = {
  dispatched_by: string;
};

export type ConfirmReceiptLine = {
  shipment_item_id: string;
  received_qty: number;
  variance_reason?: string | null;
};

export interface ImsShipmentFilters {
  request_id?: string;
  source_store_id?: string;
  destination_institution_id?: string;
  status?: ImsShipmentStatus;
  page?: number;
  limit?: number;
}
