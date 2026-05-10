/**
 * IMS Sales & POS
 */

export type ImsCustomerType = 'student' | 'staff' | 'patient' | 'walk_in';
export type ImsPaymentMethod = 'cash' | 'gpay' | 'card' | 'upi_qr' | 'mixed';
export type ImsSaleStatus = 'completed' | 'cancelled' | 'refunded';

export interface ImsSale {
  id: string;
  sale_number: string;
  customer_type: ImsCustomerType;
  customer_name: string | null;
  customer_id: string | null;
  payment_method: ImsPaymentMethod;
  cash_amount: number;
  gpay_amount: number;
  card_amount: number;
  gpay_transaction_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  profit_amount: number;
  upi_qr_amount: number;
  upi_qr_transaction_ref: string | null;
  status: ImsSaleStatus;
  cashier_id: string;
  cancellation_reason: string | null;
  institution_id: string;
  items_returned: boolean | null;
  receipt_pdf_url: string | null;
  store_id: string | null;
  shift_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  cashier?: { full_name: string } | null;
}

export interface ImsSaleItem {
  id: string;
  sale_id: string;
  item_id: string;
  batch_id: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  profit: number;
  // Joined
  item?: { id: string; name: string; code: string };
}

export interface ImsSaleWithItems extends ImsSale {
  items: ImsSaleItem[];
}

export interface ImsSaleFilters {
  search?: string;
  status?: ImsSaleStatus;
  payment_method?: ImsPaymentMethod;
  customer_type?: ImsCustomerType;
  date_from?: string;
  date_to?: string;
  institution_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export interface ImsCartItem {
  item_id: string;
  name: string;
  code: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  max_quantity: number;
  discount_percent: number;
}

export interface ImsCartSummary {
  items: ImsCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface ImsSellableItem {
  id: string;
  name: string;
  code: string;
  selling_price: number;
  cost_price: number;
  available_quantity: number;
  unit_abbreviation: string;
  category_name: string;
}

export type CreateImsSaleDto = {
  customer_type: ImsCustomerType;
  customer_name?: string;
  customer_id?: string;
  payment_method: ImsPaymentMethod;
  cash_amount?: number;
  gpay_amount?: number;
  card_amount?: number;
  gpay_transaction_id?: string;
  upi_qr_amount?: number;
  upi_qr_transaction_ref?: string;
  additional_discount?: number;
  institution_id: string;
  store_id?: string;
  items: Array<{
    item_id: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
    discount_percent?: number;
  }>;
};

/** UPI QR code payment lifecycle tracking */
export type ImsUpiQrStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface ImsUpiQrPayment {
  id: string;
  store_id: string;
  transaction_ref: string;
  upi_string: string;
  amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  status: ImsUpiQrStatus;
  sale_id: string | null;
  upi_transaction_id: string | null;
  confirmed_by: string | null;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}
