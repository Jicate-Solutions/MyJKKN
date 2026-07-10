// lib/procurement/purchase-order-pdf.ts
//
// Client-side Purchase Order PDF (PRD step 7 — "downloaded or emailed to the
// vendor"). jspdf + jspdf-autotable, no server round-trip.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PoWithItems } from '@/types/procurement';

export function downloadPurchaseOrderPdf(po: PoWithItems, orgName = 'JKKN'): void {
  const doc = new jsPDF();
  const marginX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text('Purchase Order', marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(orgName, marginX, y);
  y += 5;
  doc.text(`PO No: ${po.po_number}`, marginX, y);
  y += 5;
  doc.text(`Date: ${new Date(po.created_at).toLocaleDateString()}`, marginX, y);
  y += 5;
  doc.text(`Vendor: ${po.supplier?.name ?? po.supplier_id}`, marginX, y);
  y += 5;
  if (po.supplier?.gstin) {
    doc.text(`Vendor GSTIN: ${po.supplier.gstin}`, marginX, y);
    y += 5;
  }
  if (po.payment_terms) {
    doc.text(`Payment terms: ${po.payment_terms}`, marginX, y);
    y += 5;
  }
  if (po.expected_delivery_date) {
    doc.text(`Expected delivery: ${new Date(po.expected_delivery_date).toLocaleDateString()}`, marginX, y);
    y += 5;
  }
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Item', 'Specification', 'Qty', 'Unit', 'Unit Price', 'Line Total']],
    body: po.items.map((it, i) => [
      String(i + 1),
      it.item_name,
      it.item_spec || '-',
      String(it.ordered_quantity),
      it.unit_label || '-',
      Number(it.unit_price).toLocaleString(),
      Number(it.line_total).toLocaleString(),
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  const afterY = (doc.lastAutoTable?.finalY ?? y + 20) + 8;
  doc.setFontSize(10);
  const totalsX = 140;
  doc.text(`Subtotal: ${Number(po.subtotal).toLocaleString()}`, totalsX, afterY);
  doc.text(`Tax: ${Number(po.tax_amount).toLocaleString()}`, totalsX, afterY + 5);
  doc.setFontSize(11);
  doc.text(`Total: ${Number(po.total_amount).toLocaleString()}`, totalsX, afterY + 11);

  doc.save(`${po.po_number}.pdf`);
}
