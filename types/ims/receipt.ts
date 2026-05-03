/**
 * IMS Receipt — view-model for rendering receipts across 4 channels
 * (Print, PDF, WhatsApp, Email). Not a database row — aggregated from
 * ims_sales + ims_sale_items + ims_stores at display time.
 */

import type { ImsPaymentMethod, ImsCustomerType, ImsSaleStatus } from './sales';

export interface ImsReceiptItem {
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ImsReceiptData {
  saleId: string;
  receiptNo: string;
  date: string;
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeGST: string | null;
  items: ImsReceiptItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: ImsPaymentMethod;
  cashAmount: number;
  gpayAmount: number;
  cardAmount: number;
  upiQrAmount: number;
  changeAmount: number;
  cashierName: string;
  customerName: string | null;
  customerType: ImsCustomerType;
  status: ImsSaleStatus;
  receiptHeader: string | null;
  receiptFooter: string | null;
}
