/**
 * IMS Store types — each store maps to a JKKN institution operating
 * as an independent IMS instance with its own items, stock, and sales.
 * Updated: 2026-02-21 — Multiple stores per institution, POS/receipt config.
 */

export interface ImsStore {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  upi_vpa: string | null;
  upi_merchant_name: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  sale_number_prefix: string;
  manager_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImsStoreWithRelations extends ImsStore {
  manager: { id: string; full_name: string } | null;
}

export type CreateImsStoreDto = Omit<ImsStore, 'id' | 'created_at' | 'updated_at'>;

export type UpdateImsStoreDto = Partial<
  Omit<ImsStore, 'id' | 'created_at' | 'updated_at' | 'created_by'>
>;

export interface ImsStoreFilters {
  search?: string;
  is_active?: boolean;
  institution_id?: string;
  page?: number;
  limit?: number;
}
