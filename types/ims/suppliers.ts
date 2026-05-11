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
