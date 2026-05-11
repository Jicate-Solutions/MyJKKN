/**
 * IMS Financial Transactions
 */

export type ImsTransactionType =
  | 'sale'
  | 'purchase'
  | 'issue'
  | 'return'
  | 'adjustment'
  | 'write_off';

export interface ImsFinancialTransaction {
  id: string;
  transaction_type: ImsTransactionType;
  reference_id: string | null;
  reference_type: string | null;
  amount: number;
  description: string;
  department_id: string | null;
  item_id: string | null;
  quantity: number | null;
  created_by: string;
  institution_id: string;
  store_id: string | null;
  created_at: string;
  // Joined
  department?: { id: string; department_name: string } | null;
  item?: { id: string; name: string; code: string } | null;
  created_by_profile?: { full_name: string } | null;
}

export interface ImsFinancialFilters {
  transaction_type?: ImsTransactionType;
  department_id?: string;
  date_from?: string;
  date_to?: string;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export interface ImsFinancialSummary {
  total_revenue: number;
  total_costs: number;
  gross_profit: number;
  total_issues_value: number;
  total_write_offs: number;
  transaction_count: number;
}

export interface ImsPeriodSummary {
  period: string;
  revenue: number;
  costs: number;
  profit: number;
}

export interface ImsDepartmentCostSummary {
  department_id: string;
  department_name: string;
  total_issued_value: number;
  total_consumed_value: number;
  item_count: number;
}

export interface ImsItemProfitSummary {
  item_id: string;
  item_name: string;
  item_code: string;
  total_sold: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_percent: number;
}

export interface ImsTodayMetrics {
  sales_count: number;
  sales_revenue: number;
  profit: number;
  pending_payments: number;
  margin_percent: number;
}
