'use client';

import { useState } from 'react';
import { Printer, FileText, MessageCircle, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReceiptPreview } from './receipt-preview';
import { formatReceiptText, formatCurrencyINR } from '@/lib/utils/ims-receipt';
import type { ImsReceiptData } from '@/types/ims/receipt';
import { toast } from 'sonner';

interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: ImsReceiptData | null;
}

export function ReceiptModal({ open, onOpenChange, receiptData }: ReceiptModalProps) {
  const [emailAddress, setEmailAddress] = useState('');

  if (!receiptData) return null;

  const handlePrint = () => {
    const text = formatReceiptText(receiptData);
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      toast.error('Please allow pop-ups to print receipts');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${receiptData.receiptNo}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-width: 76mm;
            margin: 0 auto;
            padding: 4mm;
          }
        </style>
      </head>
      <body>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        unit: 'mm',
        format: [80, 200],
      });

      doc.setFont('Courier');
      doc.setFontSize(9);

      const rawText = formatReceiptText(receiptData);
      // jsPDF Courier font does not support ─ (U+2500) or ₹ (U+20B9) — replace with ASCII equivalents
      const text = rawText.replace(/─/g, '-').replace(/₹/g, 'Rs');
      const lines = text.split('\n');
      let y = 5;

      for (const line of lines) {
        if (y > 195) {
          doc.addPage([80, 200]);
          y = 5;
        }
        doc.text(line, 3, y);
        y += 4;
      }

      doc.save(`Receipt-${receiptData.receiptNo}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const handleWhatsApp = () => {
    const text = formatReceiptText(receiptData);
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handleEmail = () => {
    const text = formatReceiptText(receiptData);
    const subject = encodeURIComponent(`Receipt ${receiptData.receiptNo} - ${receiptData.storeName}`);
    const body = encodeURIComponent(text);
    const to = emailAddress ? encodeURIComponent(emailAddress) : '';
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt - {receiptData.receiptNo}</DialogTitle>
        </DialogHeader>

        {/* Receipt Preview */}
        <ReceiptPreview data={receiptData} compact />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button onClick={handlePrint} variant="outline" className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={handlePDF} variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button onClick={handleWhatsApp} variant="outline" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
          <div className="flex gap-1">
            <Input
              placeholder="Email address"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              className="h-9 text-sm"
            />
            <Button onClick={handleEmail} variant="outline" size="icon" className="h-9 w-9 shrink-0">
              <Mail className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
