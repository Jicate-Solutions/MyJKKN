/**
 * IMS Goods Received Notes (GRN)
 */

export type ImsGRNStatus = 'draft' | 'pending_verification' | 'verified' | 'approved' | 'cancelled';

export interface ImsGoodsReceivedNote {
  id: string;
  grn_number: string;
  supplier_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  status: ImsGRNStatus;
  received_by: string;
  verified_by: string | null;
  approved_by: string | null;
  notes: string | null;
  institution_id: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  supplier?: { id: string; name: string; code: string } | null;
  received_by_profile?: { full_name: string } | null;
  verified_by_profile?: { full_name: string } | null;
  approved_by_profile?: { full_name: string } | null;
}

export interface ImsGRNItem {
  id: string;
  grn_id: string;
  item_id: string;
  quantity: number;
  unit_id: string;
  cost_price: number;       // per-unit price EXCLUDING GST
  taxable_amount: number;   // cost_price × quantity
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  total_gst_amount: number;
  total: number;            // taxable_amount + total_gst_amount
  batch_number: string | null;
  expiry_date: string | null;
  // Joined
  item?: { id: string; name: string; code: string; hsn_code: string | null; gst_rate: number };
  unit?: { id: string; name: string; abbreviation: string };
}

export interface ImsGRNWithItems extends ImsGoodsReceivedNote {
  items: ImsGRNItem[];
}

export interface ImsGRNFilters {
  search?: string;
  status?: ImsGRNStatus;
  supplier_id?: string;
  institution_id?: string;
  store_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export type CreateImsGRNDto = {
  supplier_id: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_amount?: number;
  notes?: string;
  institution_id: string;
  store_id?: string;
  items: Array<{
    item_id: string;
    quantity: number;
    unit_id: string;
    cost_price: number;     // per-unit price EXCLUDING GST
    gst_rate?: number;      // item GST % — if omitted, read from ims_items.gst_rate
    batch_number?: string;
    expiry_date?: string;
  }>;
};

export const GRN_STATUS_CONFIG: Record<ImsGRNStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_verification: { label: 'Pending Verification', variant: 'outline' },
  verified: { label: 'Verified', variant: 'default' },
  approved: { label: 'Approved', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};
