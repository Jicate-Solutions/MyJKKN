// types/procurement/po-format.ts
//
// Configurable Purchase Order document format: user-defined header fields,
// item-table columns, and a 3-column footer, saved per institution and
// optionally set as a vendor's default. Consumed by lib/procurement/
// po-document-model.ts to drive both the PDF and DOCX renderers.

export type PoFieldSource =
  | `po.${string}`
  | `supplier.${string}`
  | `header_values.${string}`
  | `footer_values.${string}`
  | `item.${string}`
  | `item_extra.${string}`
  | 'row_index';

export type PoFieldFormat = 'date' | 'currency' | 'percent';
export type PoFieldAlign = 'left' | 'center' | 'right';

export interface PoHeaderFieldDef {
  key: string;
  label: string;
  source: PoFieldSource;
  format?: PoFieldFormat;
}

export interface PoItemColumnDef {
  key: string;
  label: string;
  source: PoFieldSource;
  width?: number;
  align?: PoFieldAlign;
  format?: PoFieldFormat;
}

export interface PoFooterFieldDef {
  key: string;
  label: string;
  source: PoFieldSource;
}

export interface PoFooterColumnDef {
  key: string;
  title: string;
  /** When true, this group renders as a single free-text block instead of a field list. */
  freeText?: boolean;
  source?: PoFieldSource;
  fields?: PoFooterFieldDef[];
}

export interface ProcurementPoFormat {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  header_fields: PoHeaderFieldDef[];
  item_columns: PoItemColumnDef[];
  /** Exactly 3 groups in practice: terms / enclosure / special_note. */
  footer_columns: PoFooterColumnDef[];
  terms_and_conditions_default: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreatePoFormatDto = Omit<
  ProcurementPoFormat,
  'id' | 'created_at' | 'updated_at'
>;
export type UpdatePoFormatDto = Partial<CreatePoFormatDto>;
