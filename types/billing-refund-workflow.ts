export type RefundType = 'withdrawal' | 'adjustment';
export type RefundRequestStatus = 'pending_review' | 'pending_disbursement' | 'disbursed' | 'declined';

export interface RefundAttachment {
  name: string;
  drive_file_id: string;
  drive_url: string;
  mime?: string;
  size?: number;
}

export interface RefundFlowStage {
  key: string;                 // stable uuid generated client-side on add
  name: string;
  assignee_roles: string[];    // custom_roles.id
  assignee_users: string[];    // profiles.id
}

export interface RefundFlowConfig {
  id: string;
  institution_id: string | null;   // null = global default
  name: string;
  initiator_roles: string[];
  initiator_users: string[];
  stages: RefundFlowStage[];
  disburser_roles: string[];
  disburser_users: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RefundRequestBill {
  id: string;
  request_id: string;
  bill_id: string;
  paid_amount_snapshot: number;
  refund_amount: number;
  bill?: { id: string; bill_description?: string; bill_amount?: number; status?: string };
}

export interface RefundRequestAction {
  id: string;
  request_id: string;
  action_type: 'initiated' | 'approved' | 'declined' | 'disbursed';
  stage_index: number | null;
  stage_name: string;
  actor_id: string;
  actor_role_name: string | null;
  notes: string | null;
  attachments: RefundAttachment[];
  created_at: string;
  actor?: { id: string; full_name: string };
}

export interface RefundRequest {
  id: string;
  request_number: string;
  institution_id: string;
  student_id: string;
  refund_type: RefundType;
  status: RefundRequestStatus;
  current_stage_index: number;
  flow_snapshot: {
    config_id: string;
    initiator: { assignee_roles: string[]; assignee_users: string[] };
    stages: RefundFlowStage[];
    disburser: { assignee_roles: string[]; assignee_users: string[] };
  };
  total_refund_amount: number;
  previous_lifecycle_status: string | null;
  initiated_by: string;
  initiated_at: string;
  declined_by: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  declined_stage_name: string | null;
  payment_mode: string | null;
  payment_details: Record<string, unknown> | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  created_at: string;
  student?: { id: string; first_name: string; last_name: string; roll_number?: string; lifecycle_status?: string };
  bills?: RefundRequestBill[];
  actions?: RefundRequestAction[];
}

export interface EligibleRefundBill {
  bill_id: string;
  bill_description: string;
  paid_amount: number;
  refunded_amount: number;
  held_amount: number;        // sum in other active requests
  refundable: number;         // paid - refunded - held
}

export interface InitiateRefundInput {
  student_id: string;
  refund_type: RefundType;
  bills: { bill_id: string; refund_amount: number }[];
  notes: string;
  attachments: RefundAttachment[];
}

export interface RefundRequestFilters {
  page?: number;
  limit?: number;
  status?: RefundRequestStatus;
  refund_type?: RefundType;
  institution_id?: string;
  student_id?: string;
  search?: string;            // matches request_number
  date_from?: string;
  date_to?: string;
}
