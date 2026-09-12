// types/id-cards.ts — locked contract, distributed identically to UI and API agents
export type IdCardPolicy = {
  printer_model: 'primacy_2';
  sides: 1 | 2;
  encoding: {
    magstripe_enabled: boolean;
    magstripe_hardware_present: boolean;
    chip_enabled: boolean;
    chip_hardware_present: boolean;
    rfid_enabled: boolean;
    rfid_hardware_present: boolean;
  };
  station_endpoint_url: string | null;
  ribbon_type: 'YMCKO' | 'YMCKOK' | 'monochrome';
  photo_fallback: string[];
};

export type IdCardTemplate = {
  id: string;
  name: string;
  institution_id: string | null;
  front_layout_json: Record<string, unknown>;
  back_layout_json: Record<string, unknown> | null;
  field_mappings: Array<{ card_field: string; db_column: string }>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type IdCardPrintJobStatus = 'pending' | 'rendering' | 'sent_to_agent' | 'printed' | 'failed';

export type IdCardPrintJob = {
  id: string;
  profile_id: string;
  template_id: string;
  status: IdCardPrintJobStatus;
  enqueued_by: string;
  enqueued_at: string;
  picked_up_at: string | null;
  result: { success: boolean; error_message: string | null } | null;
};

/**
 * One row of the preview-time missing-data report returned by
 * GET /api/id-cards/templates/:id/render?include=fields. `value` is null when
 * the card would print that field blank — the preview dialogs paint it red.
 */
export type CardFieldReport = {
  key: string;
  label: string;
  side: 'front' | 'back';
  value: string | null;
  /**
   * Set when the value is PRESENT but would print wrong — today the permanent
   * address, classified by lib/id-cards/address-quality.ts (two PIN codes, a
   * phone number in the street, filler text, cut off on every layout …).
   * A plain-English label list; null/absent when the value is fine.
   */
  problem?: string | null;
  /** Worst severity behind `problem` (mirrors AddressIssueSeverity). */
  problem_severity?: 'critical' | 'high' | 'medium' | null;
  /** What a person should do about `problem`. */
  problem_fix?: string | null;
};
