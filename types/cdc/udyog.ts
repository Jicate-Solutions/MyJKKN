// types/cdc/udyog.ts — UNNATI → UDYOG apply-tracker (BUG-004075).

export type UdyogStatus = 'required' | 'directed' | 'applied' | 'waived' | 'cancelled';

export interface UdyogRequirementRow {
  id: string;
  learner_id: string;
  source_programme_id: string | null;
  institution_id: string | null;
  status: UdyogStatus;
  udyog_reference: string | null;
  due_date: string | null;
  directed_at: string | null;
  applied_at: string | null;
  waived_reason: string | null;
  created_at: string;
  updated_at: string;
  learner?: { first_name: string | null; last_name: string | null; register_number: string | null } | null;
  programme?: { name: string | null } | null;
}

export interface UdyogListResponse {
  requirements: UdyogRequirementRow[];
  portalUrl: string;
}

export type UdyogAction = 'direct' | 'apply' | 'waive';

export interface UdyogActionPayload {
  id: string;
  action: UdyogAction;
  udyog_reference?: string;
  waived_reason?: string;
}
