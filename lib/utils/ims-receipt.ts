import type { ImsSaleWithItems, ImsStore } from '@/types/ims';
import type { ImsReceiptData, ImsReceiptItem } from '@/types/ims/receipt';

/**
 * Build receipt data from a sale and its associated store.
 */
export function buildReceiptData(
  sale: ImsSaleWithItems,
  store: ImsStore
): ImsReceiptData {
  const items: ImsReceiptItem[] = (sale.items || []).map((item) => ({
    name: item.item?.name || 'Unknown Item',
    code: item.item?.code || '',
    quantity: item.quantity,
    unitPrice: item.unit_price,
    total: item.total,
  }));

  return {
    saleId: sale.id,
    receiptNo: sale.sale_number,
    date: new Date(sale.created_at).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    storeName: store.name,
    storeAddress: store.address,
    storePhone: store.phone,
    storeGST: store.gstin,
    items,
    subtotal: sale.subtotal,
    taxAmount: sale.tax_amount,
    totalAmount: sale.total_amount,
    paymentMethod: sale.payment_method,
    cashAmount: sale.cash_amount || 0,
    gpayAmount: sale.gpay_amount || 0,
    cardAmount: sale.card_amount || 0,
    upiQrAmount: sale.upi_qr_amount || 0,
    changeAmount: Math.max(0, (sale.cash_amount || 0) - sale.total_amount),
    cashierName: sale.cashier?.full_name || 'N/A',
    customerName: sale.customer_name,
    customerType: sale.customer_type,
    status: sale.status,
    receiptHeader: store.receipt_header,
    receiptFooter: store.receipt_footer,
  };
}

/**
 * Format receipt as monospace text (for WhatsApp / Email).
 */
export function formatReceiptText(data: ImsReceiptData): string {
  const LINE = '─'.repeat(40);
  const lines: string[] = [];

  // Header
  lines.push(data.storeName.toUpperCase());
  if (data.storeAddress) lines.push(data.storeAddress);
  if (data.storePhone) lines.push(`Tel: ${data.storePhone}`);
  if (data.storeGST) lines.push(`GSTIN: ${data.storeGST}`);
  if (data.receiptHeader) lines.push(data.receiptHeader);
  lines.push(LINE);

  // Receipt info
  lines.push(`Receipt: ${data.receiptNo}`);
  lines.push(`Date: ${data.date}`);
  if (data.customerName) lines.push(`Customer: ${data.customerName}`);
  lines.push(`Type: ${data.customerType.replace('_', ' ')}`);
  lines.push(LINE);

  // Items
  lines.push('Item                    Qty    Amount');
  lines.push(LINE);
  for (const item of data.items) {
    const name = item.name.length > 22 ? item.name.slice(0, 22) + '..' : item.name.padEnd(24);
    const qty = String(item.quantity).padStart(3);
    const amt = formatCurrencyINR(item.total).padStart(10);
    lines.push(`${name}${qty}${amt}`);
  }
  lines.push(LINE);

  // Totals
  lines.push(`${'Subtotal'.padEnd(28)}${formatCurrencyINR(data.subtotal).padStart(12)}`);
  if (data.taxAmount > 0) {
    lines.push(`${'Tax'.padEnd(28)}${formatCurrencyINR(data.taxAmount).padStart(12)}`);
  }
  lines.push(`${'TOTAL'.padEnd(28)}${formatCurrencyINR(data.totalAmount).padStart(12)}`);
  lines.push(LINE);

  // Payment breakdown
  lines.push(`Payment: ${data.paymentMethod.replace('_', ' ').toUpperCase()}`);
  if (data.cashAmount > 0) lines.push(`  Cash: ${formatCurrencyINR(data.cashAmount)}`);
  if (data.gpayAmount > 0) lines.push(`  GPay: ${formatCurrencyINR(data.gpayAmount)}`);
  if (data.cardAmount > 0) lines.push(`  Card: ${formatCurrencyINR(data.cardAmount)}`);
  if (data.upiQrAmount > 0) lines.push(`  UPI QR: ${formatCurrencyINR(data.upiQrAmount)}`);
  if (data.changeAmount > 0) lines.push(`  Change: ${formatCurrencyINR(data.changeAmount)}`);

  lines.push(LINE);
  lines.push(`Cashier: ${data.cashierName}`);
  if (data.status === 'cancelled') lines.push('*** CANCELLED ***');
  if (data.receiptFooter) lines.push(data.receiptFooter);
  lines.push('Thank you for your purchase!');

  return lines.join('\n');
}

/**
 * Format a number as INR currency.
 */
export function formatCurrencyINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}
