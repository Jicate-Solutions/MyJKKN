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
  student_id: string;
  template_id: string;
  status: IdCardPrintJobStatus;
  enqueued_by: string;
  enqueued_at: string;
  picked_up_at: string | null;
  result: { success: boolean; error_message: string | null } | null;
};
