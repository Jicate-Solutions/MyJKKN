/**
 * IMS Report Types
 */

export interface ImsDashboardStats {
  total_items: number;
  total_stock_value: number;
  low_stock_count: number;
  pending_indents: number;
  today_sales: number;
  today_revenue: number;
  expiring_soon_count: number;
  out_of_stock_count: number;
}

export interface ImsSalesSummary {
  total_sales: number;
  total_revenue: number;
  total_profit: number;
  average_sale_value: number;
  cash_total: number;
  digital_total: number;
}

export interface ImsDailySalesData {
  date: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface ImsPaymentBreakdown {
  method: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface ImsTopSellingItem {
  item_id: string;
  item_name: string;
  item_code: string;
  total_quantity: number;
  total_revenue: number;
  total_profit: number;
}

export interface ImsSalesByCashier {
  cashier_id: string;
  cashier_name: string;
  sale_count: number;
  total_revenue: number;
}

export interface ImsStockValuation {
  category_id: string;
  category_name: string;
  item_count: number;
  total_quantity: number;
  total_value: number;
  percentage: number;
}

export interface ImsExpiringItem {
  item_id: string;
  item_name: string;
  item_code: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  days_until_expiry: number;
}

export interface ImsIndentSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  issued: number;
  delivered: number;
}

export interface ImsIndentByDepartment {
  department_id: string;
  department_name: string;
  total_requests: number;
  pending: number;
  approved: number;
  completed: number;
  estimated_value: number;
}

export interface ImsDepartmentConsumption {
  department_id: string;
  department_name: string;
  total_items: number;
  total_quantity: number;
  total_value: number;
  percentage: number;
}

export interface ImsItemConsumption {
  item_id: string;
  item_name: string;
  item_code: string;
  total_quantity: number;
  total_value: number;
  departments: Array<{ name: string; quantity: number }>;
}

export interface ImsRecentActivity {
  id: string;
  type: 'sale' | 'indent' | 'grn' | 'issue' | 'approval' | 'stock_alert';
  title: string;
  description: string;
  timestamp: string;
  user_name?: string;
}

export interface ImsAlertSummary {
  out_of_stock: number;
  low_stock: number;
  expiring_soon: number;
  expired: number;
}

export interface ImsLowStockItem {
  item_id: string;
  item_name: string;
  item_code: string;
  current_quantity: number;
  reorder_level: number;
  unit_abbreviation: string;
}
