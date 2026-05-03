'use client';

import type { ImsReceiptData } from '@/types/ims/receipt';
import { formatCurrencyINR } from '@/lib/utils/ims-receipt';
import { Badge } from '@/components/ui/badge';

interface ReceiptPreviewProps {
  data: ImsReceiptData;
  compact?: boolean;
}

export function ReceiptPreview({ data, compact = false }: ReceiptPreviewProps) {
  return (
    <div
      className={`font-mono text-xs bg-white text-black p-4 border rounded-lg ${
        compact ? 'max-w-[320px]' : 'max-w-[400px]'
      } mx-auto`}
    >
      {/* Store Header */}
      <div className="text-center space-y-0.5 mb-2">
        <p className="font-bold text-sm uppercase">{data.storeName}</p>
        {data.storeAddress && <p>{data.storeAddress}</p>}
        {data.storePhone && <p>Tel: {data.storePhone}</p>}
        {data.storeGST && <p>GSTIN: {data.storeGST}</p>}
        {data.receiptHeader && <p className="italic">{data.receiptHeader}</p>}
      </div>

      <hr className="border-dashed border-gray-400 my-2" />

      {/* Receipt Info */}
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between">
          <span>Receipt:</span>
          <span className="font-semibold">{data.receiptNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{data.date}</span>
        </div>
        {data.customerName && (
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{data.customerName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Type:</span>
          <span className="capitalize">{data.customerType.replace('_', ' ')}</span>
        </div>
      </div>

      <hr className="border-dashed border-gray-400 my-2" />

      {/* Items Table */}
      <table className="w-full mb-2">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="text-left py-1">Item</th>
            <th className="text-right py-1 w-10">Qty</th>
            <th className="text-right py-1 w-20">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-100">
              <td className="py-1 pr-2">
                <div className="truncate max-w-[160px]">{item.name}</div>
                <div className="text-gray-500">@ {formatCurrencyINR(item.unitPrice)}</div>
              </td>
              <td className="text-right py-1">{item.quantity}</td>
              <td className="text-right py-1">{formatCurrencyINR(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="border-dashed border-gray-400 my-2" />

      {/* Totals */}
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrencyINR(data.subtotal)}</span>
        </div>
        {data.taxAmount > 0 && (
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatCurrencyINR(data.taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1">
          <span>TOTAL</span>
          <span>{formatCurrencyINR(data.totalAmount)}</span>
        </div>
      </div>

      <hr className="border-dashed border-gray-400 my-2" />

      {/* Payment */}
      <div className="space-y-0.5 mb-2">
        <p className="font-semibold">
          Payment: {data.paymentMethod.replace('_', ' ').toUpperCase()}
        </p>
        {data.cashAmount > 0 && (
          <div className="flex justify-between pl-2">
            <span>Cash</span>
            <span>{formatCurrencyINR(data.cashAmount)}</span>
          </div>
        )}
        {data.gpayAmount > 0 && (
          <div className="flex justify-between pl-2">
            <span>GPay</span>
            <span>{formatCurrencyINR(data.gpayAmount)}</span>
          </div>
        )}
        {data.cardAmount > 0 && (
          <div className="flex justify-between pl-2">
            <span>Card</span>
            <span>{formatCurrencyINR(data.cardAmount)}</span>
          </div>
        )}
        {data.upiQrAmount > 0 && (
          <div className="flex justify-between pl-2">
            <span>UPI QR</span>
            <span>{formatCurrencyINR(data.upiQrAmount)}</span>
          </div>
        )}
        {data.changeAmount > 0 && (
          <div className="flex justify-between pl-2 text-green-700">
            <span>Change</span>
            <span>{formatCurrencyINR(data.changeAmount)}</span>
          </div>
        )}
      </div>

      <hr className="border-dashed border-gray-400 my-2" />

      {/* Footer */}
      <div className="text-center space-y-0.5">
        <p>Cashier: {data.cashierName}</p>
        {data.status === 'cancelled' && (
          <Badge variant="destructive" className="font-mono">
            CANCELLED
          </Badge>
        )}
        {data.receiptFooter && <p className="italic">{data.receiptFooter}</p>}
        <p className="mt-2">Thank you for your purchase!</p>
      </div>
    </div>
  );
}
