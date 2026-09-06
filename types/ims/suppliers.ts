/**
 * IMS Suppliers
 */

export interface ImsSupplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  is_active: boolean;
  institution_id: string;
  store_id: string | null;
  /** Vendor commercial terms, e.g. "30 days net" (procurement). */
  payment_terms?: string | null;
  /** Typical delivery lead time in days (procurement). */
  lead_time_days?: number | null;
  /** Vendor rating 0-5 (procurement). */
  rating?: number | null;
  /** JSON bank/payment details for PO settlement (procurement). */
  bank_details?: Record<string, unknown> | null;
  /** Default PO document format pre-selected for this vendor (procurement). */
  default_po_format_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImsSupplierFilters {
  search?: string;
  is_active?: boolean;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export type CreateImsSupplierDto = Omit<ImsSupplier, 'id' | 'created_at' | 'updated_at'>;
export type UpdateImsSupplierDto = Partial<CreateImsSupplierDto>;
