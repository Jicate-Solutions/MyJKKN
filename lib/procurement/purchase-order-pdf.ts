// lib/procurement/purchase-order-pdf.ts
//
// Client-side Purchase Order PDF (PRD step 7 — "downloaded or emailed to the
// vendor"). jspdf + jspdf-autotable, no server round-trip. Layout is driven by
// the resolved document model (lib/procurement/po-document-model.ts) so each
// vendor's saved format renders its own header fields, item columns, and
// 3-column footer without any code change here.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PoWithItems } from '@/types/procurement';
import { resolvePoDocumentModel } from './po-document-model';

export function downloadPurchaseOrderPdf(po: PoWithItems, orgName = 'JKKN'): void {
  const model = resolvePoDocumentModel(po, orgName);
  const doc = new jsPDF();
  const marginX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text('Purchase Order', marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(model.orgName, marginX, y);
  y += 5;
  for (const field of model.headerFields) {
    doc.text(`${field.label}: ${field.value}`, marginX, y);
    y += 5;
  }
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 2,
    head: [model.itemColumns.map((c) => c.label)],
    body: model.itemRows.map((row) => row.cells.map((c) => c.value)),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: model.itemColumns.reduce<Record<number, { halign: 'left' | 'center' | 'right' }>>(
      (styles, col, i) => {
        if (col.align === 'right' || col.align === 'center') styles[i] = { halign: col.align };
        return styles;
      },
      {}
    ),
  });

  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  let afterY = (doc.lastAutoTable?.finalY ?? y + 20) + 8;
  doc.setFontSize(10);
  const totalsX = 140;
  doc.text(`Subtotal: ${model.totals.subtotal.toLocaleString()}`, totalsX, afterY);
  doc.text(`Tax: ${model.totals.tax.toLocaleString()}`, totalsX, afterY + 5);
  doc.setFontSize(11);
  doc.text(`Total: ${model.totals.total.toLocaleString()}`, totalsX, afterY + 11);
  afterY += 20;

  if (model.termsAndConditions) {
    doc.setFontSize(9);
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(`Terms & Conditions: ${model.termsAndConditions}`, 180);
    doc.text(lines, marginX, afterY);
    doc.setTextColor(0);
    afterY += lines.length * 4 + 4;
  }

  // 3-column footer (Terms & Condition / Enclosure / Special Note), rendered
  // as side-by-side mini tables sharing one startY.
  if (model.footerGroups.length > 0) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const colWidth = (pageWidth - marginX * 2) / model.footerGroups.length;
    for (let i = 0; i < model.footerGroups.length; i++) {
      const group = model.footerGroups[i];
      const body = group.freeText
        ? [[group.text || '']]
        : (group.fields || []).map((f) => [`${f.label}: ${f.value}`]);
      autoTable(doc, {
        startY: afterY,
        margin: { left: marginX + colWidth * i },
        tableWidth: colWidth - 2,
        head: [[group.title]],
        body,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
      });
    }
  }

  doc.save(`${po.po_number}.pdf`);
}
