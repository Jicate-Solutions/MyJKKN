// lib/procurement/requirement-list-pdf.ts
//
// Client-side generator for the Purchase Requirement List (PRD step 3): the PDF
// an RFQ is issued to vendors so they can prepare quotations. Uses jspdf +
// jspdf-autotable (already dependencies; previously unused). No server round-trip.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RfqWithDetails } from '@/types/procurement';
import { formatDateDMY } from '@/lib/utils/date-format';

/**
 * Build and trigger a browser download of the requirement-list PDF for an RFQ.
 * Kept dependency-light: title block + item table + vendor list.
 */
export function downloadRequirementListPdf(rfq: RfqWithDetails, orgName = 'JKKN'): void {
  const doc = new jsPDF();
  const marginX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text('Purchase Requirement List', marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(orgName, marginX, y);
  y += 5;
  doc.text(`RFQ No: ${rfq.rfq_number}`, marginX, y);
  y += 5;
  if (rfq.source_request?.request_number) {
    doc.text(`Source Request: ${rfq.source_request.request_number}`, marginX, y);
    y += 5;
  }
  doc.text(`Date: ${formatDateDMY(rfq.created_at)}`, marginX, y);
  y += 4;
  doc.setTextColor(0);

  // Item table
  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Item', 'Specification', 'Required Qty', 'Unit']],
    body: rfq.items.map((it, i) => [
      String(i + 1),
      it.item_name,
      it.item_spec || '-',
      String(it.quantity),
      it.unit_label || '-',
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  // Vendors this went to (if any)
  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  const afterTableY = (doc.lastAutoTable?.finalY ?? y + 20) + 10;
  if (rfq.vendors.length) {
    doc.setFontSize(11);
    doc.text('Issued to vendors:', marginX, afterTableY);
    doc.setFontSize(9);
    doc.setTextColor(90);
    rfq.vendors.forEach((v, i) => {
      const name = v.supplier?.name ?? v.supplier_id;
      doc.text(`${i + 1}. ${name}`, marginX + 2, afterTableY + 6 + i * 5);
    });
    doc.setTextColor(0);
  }

  doc.save(`${rfq.rfq_number}-requirement-list.pdf`);
}
