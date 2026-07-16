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
  /** null means this vendor did not quote this item at all — never a fake/placeholder price. */
  unit_price: number | null;
  quantity: number | null;
  delivery_time_days: number | null;
  remarks: string | null;
  /** Structured "what this vendor is actually offering" — distinct from the RFQ's own item_spec (what was requested). */
  manufacturer: string | null;
  quality_grade: string | null;
  /** Purity/strength offered — relevant for chemical items (see ProcurementRfqItem.is_chemical). */
  concentration: string | null;
  other_specs: string | null;
  awarded: boolean;
  created_at: string;
}

export interface QuotationWithItems extends ProcurementQuotation {
  items: ProcurementQuotationItem[];
}

export interface CreateQuotationItemDto {
  rfq_item_id: string;
  /** null means this vendor did not quote this item — do not substitute a placeholder price. */
  unit_price: number | null;
  quantity?: number | null;
  delivery_time_days?: number | null;
  remarks?: string | null;
  manufacturer?: string | null;
  quality_grade?: string | null;
  concentration?: string | null;
  other_specs?: string | null;
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
  /** null means this vendor did not quote this item — excluded from the lowest-price calc, never awardable. */
  unit_price: number | null;
  /** Quantity THIS vendor is offering — may differ from the RFQ item's requested quantity. */
  quantity: number | null;
  delivery_time_days: number | null;
  manufacturer: string | null;
  quality_grade: string | null;
  concentration: string | null;
  other_specs: string | null;
  awarded: boolean;
}

/** One row (per RFQ item) of the item-wise comparison. */
export interface ComparisonRow {
  rfq_item_id: string;
  item_name: string;
  item_spec: string | null;
  quantity: number;
  unit_label: string | null;
  /** Resolved live from the catalog (see ProcurementRfqItem.is_chemical) — gates the Concentration column. */
  is_chemical: boolean;
  quotes: ComparisonQuote[];
  lowest_price: number | null;
}

export const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string }> = {
  received: { label: 'Received', color: 'blue' },
  shortlisted: { label: 'Shortlisted', color: 'indigo' },
  awarded: { label: 'Awarded', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
};
