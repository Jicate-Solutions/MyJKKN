// types/procurement/quotation.ts

export type QuotationStatus = 'received' | 'shortlisted' | 'awarded' | 'rejected';

export interface ProcurementQuotation {
  id: string;
  institution_id: string;
  rfq_id: string;
  supplier_id: string;
  vendor_quote_number: string | null;
  quote_date: string | null;
  validity_date: string | null;
  payment_terms: string | null;
  delivery_time_days: number | null;
  total_amount: number | null;
  document_url: string | null;
  document_file_id: string | null;
  status: QuotationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: { id: string; name: string; code: string; email: string | null } | null;
}

export interface ProcurementQuotationItem {
  id: string;
  quotation_id: string;
  rfq_item_id: string;
  unit_price: number;
  quantity: number | null;
  delivery_time_days: number | null;
  remarks: string | null;
  awarded: boolean;
  created_at: string;
}

export interface QuotationWithItems extends ProcurementQuotation {
  items: ProcurementQuotationItem[];
}

export interface CreateQuotationItemDto {
  rfq_item_id: string;
  unit_price: number;
  quantity?: number | null;
  delivery_time_days?: number | null;
  remarks?: string | null;
}

export interface CreateQuotationDto {
  institution_id: string;
  rfq_id: string;
  supplier_id: string;
  vendor_quote_number?: string | null;
  quote_date?: string | null;
  validity_date?: string | null;
  payment_terms?: string | null;
  delivery_time_days?: number | null;
  document_url?: string | null;
  document_file_id?: string | null;
  notes?: string | null;
  items: CreateQuotationItemDto[];
}

/** One quote cell in the comparison matrix. */
export interface ComparisonQuote {
  quotation_id: string;
  quotation_item_id: string;
  supplier_id: string;
  supplier_name: string;
  unit_price: number;
  delivery_time_days: number | null;
  awarded: boolean;
}

/** One row (per RFQ item) of the item-wise comparison. */
export interface ComparisonRow {
  rfq_item_id: string;
  item_name: string;
  item_spec: string | null;
  quantity: number;
  unit_label: string | null;
  quotes: ComparisonQuote[];
  lowest_price: number | null;
}

export const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string }> = {
  received: { label: 'Received', color: 'blue' },
  shortlisted: { label: 'Shortlisted', color: 'indigo' },
  awarded: { label: 'Awarded', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
};
