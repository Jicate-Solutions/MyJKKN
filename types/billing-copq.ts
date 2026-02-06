// types/billing-copq.ts
// Billing COPQ (Cost of Poor Quality) Types

export type COPQCategory =
  | 'refund_processing'
  | 'late_payment_followup'
  | 'invoice_error'
  | 'payment_reconciliation'
  | 'discount_dispute'
  | 'collection_cost'
  | 'bad_debt'
  | 'reputation_impact'
  | 'process_rework'
  | 'other';

export type COPQStatus = 'logged' | 'investigating' | 'resolved' | 'written_off';

export const COPQ_CATEGORY_LABELS: Record<COPQCategory, string> = {
  refund_processing: 'Refund Processing',
  late_payment_followup: 'Late Payment Follow-up',
  invoice_error: 'Invoice Errors',
  payment_reconciliation: 'Payment Reconciliation',
  discount_dispute: 'Discount Disputes',
  collection_cost: 'Collection Costs',
  bad_debt: 'Bad Debt',
  reputation_impact: 'Reputation Impact',
  process_rework: 'Process Rework',
  other: 'Other'
};

export const COPQ_CATEGORY_DESCRIPTIONS: Record<COPQCategory, string> = {
  refund_processing: 'Time and cost spent processing refunds due to billing errors',
  late_payment_followup: 'Staff time spent following up on late payments',
  invoice_error: 'Corrections needed for billing mistakes and incorrect invoices',
  payment_reconciliation: 'Time spent reconciling payment discrepancies',
  discount_dispute: 'Resolution of discount-related complaints and disputes',
  collection_cost: 'Costs incurred in debt collection efforts',
  bad_debt: 'Uncollectable debts written off',
  reputation_impact: 'Estimated cost of reputation damage from billing issues',
  process_rework: 'Rework due to process failures in billing workflow',
  other: 'Other billing quality issues not categorized above'
};

export const COPQ_STATUS_LABELS: Record<COPQStatus, string> = {
  logged: 'Logged',
  investigating: 'Investigating',
  resolved: 'Resolved',
  written_off: 'Written Off'
};

export const COPQ_STATUS_COLORS: Record<COPQStatus, string> = {
  logged: 'bg-blue-100 text-blue-800',
  investigating: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  written_off: 'bg-gray-100 text-gray-800'
};

export interface BillingCOPQIncident {
  id: string;
  institution_id: string;
  bill_id: string | null;
  learner_id: string | null;
  incident_date: string;
  category: COPQCategory;
  description: string;
  /** Visible cost in rupees. Stored as paisa (BIGINT) in DB, converted by service layer. */
  visible_cost: number;
  /** Hidden cost estimate in rupees. Stored as paisa (BIGINT) in DB, converted by service layer. */
  hidden_cost_estimate: number;
  time_spent_hours: number | null;
  affected_stakeholders: number;
  root_cause: string | null;
  preventive_action: string | null;
  reported_by: string | null;
  status: COPQStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  bill?: {
    id: string;
    bill_number: string;
  } | null;
  learner?: {
    id: string;
    name: string;
    roll_number?: string;
  } | null;
  reporter?: {
    id: string;
    full_name: string;
  } | null;
}

export interface CreateCOPQIncidentDto {
  institution_id: string;
  bill_id?: string | null;
  learner_id?: string | null;
  incident_date: string;
  category: COPQCategory;
  description: string;
  /** Visible cost in rupees. Service layer converts to paisa before DB insert. */
  visible_cost: number;
  /** Hidden cost estimate in rupees. Service layer converts to paisa before DB insert. */
  hidden_cost_estimate: number;
  time_spent_hours?: number | null;
  affected_stakeholders?: number;
  root_cause?: string | null;
  preventive_action?: string | null;
}

export interface UpdateCOPQIncidentDto extends Partial<CreateCOPQIncidentDto> {
  status?: COPQStatus;
  resolved_at?: string | null;
}

export interface COPQFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  category?: COPQCategory;
  status?: COPQStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface COPQListResponse {
  data: BillingCOPQIncident[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface COPQSummary {
  institution_id: string;
  month: string;
  category: COPQCategory;
  incident_count: number;
  /** Total visible cost in rupees. Converted from paisa by service layer. */
  total_visible_cost: number;
  /** Total hidden cost in rupees. Converted from paisa by service layer. */
  total_hidden_cost: number;
  /** Total COPQ (visible + hidden) in rupees. Converted from paisa by service layer. */
  total_copq: number;
  avg_time_spent: number;
}

export interface COPQDashboard {
  /** Total COPQ year-to-date in rupees. Converted from paisa by service layer. */
  total_copq_ytd: number;
  visible_vs_hidden: {
    /** Visible cost total in rupees. */
    visible: number;
    /** Hidden cost total in rupees. */
    hidden: number;
  };
  /** COPQ by category in rupees. */
  by_category: Partial<Record<COPQCategory, number>>;
  trend: Array<{
    month: string;
    /** Total COPQ for this month in rupees. */
    copq: number;
    /** Visible cost for this month in rupees. */
    visible: number;
    /** Hidden cost for this month in rupees. */
    hidden: number;
  }>;
  top_incidents: BillingCOPQIncident[];
  stats: {
    total_incidents: number;
    open_incidents: number;
    resolved_incidents: number;
    avg_resolution_time_days: number;
  };
}

export interface COPQIcebergData {
  visible_costs: Array<{
    category: COPQCategory;
    label: string;
    /** Amount in rupees. Converted from paisa by service layer. */
    amount: number;
    percentage: number;
  }>;
  hidden_costs: Array<{
    category: COPQCategory;
    label: string;
    /** Amount in rupees. Converted from paisa by service layer. */
    amount: number;
    percentage: number;
  }>;
  /** Total visible costs in rupees. */
  total_visible: number;
  /** Total hidden costs in rupees. */
  total_hidden: number;
  /** hidden/visible ratio */
  ratio: number;
}
