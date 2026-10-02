// lib/procurement/purchase-order-pdf.ts
//
// Client-side Purchase Order PDF (PRD step 7 — "downloaded or emailed to the
// vendor"). jspdf + jspdf-autotable, no server round-trip. Reproduces the
// institution's paper PO — one bordered black-line table: Ref/Date ·
// PURCHASE ORDER · To M/s. vendor + quotation boxes · items · totals ·
// Terms & Condition / Enclosure / Special Note. Content comes from the resolved
// model (lib/procurement/po-document-model.ts), shared with the DOCX renderer.

import { jsPDF } from 'jspdf';
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable';
import type { PoWithItems } from '@/types/procurement';
import { resolvePoDocumentModel } from './po-document-model';
import { itemColumnWeights, splitSpans } from './po-document-layout';

const FONT = 'times'; // closest built-in serif to the paper PO's Bookman Old Style

export function downloadPurchaseOrderPdf(po: PoWithItems): void {
  const m = resolvePoDocumentModel(po);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12.7; // 0.5"
  const width = doc.internal.pageSize.getWidth() - margin * 2;

  const weights = itemColumnWeights(m.itemColumns.map((c) => c.key));
  const sum = weights.reduce((a, b) => a + b, 0);
  const grid = weights.map((w) => (w / sum) * width);
  const n = grid.length;
  const [vSpan, qlSpan, qvSpan] = splitSpans(grid, [0.5, 0.28, 0.22]);
  const [tSpan, eSpan, sSpan] = splitSpans(grid, [0.5, 0.17, 0.33]);

  const c = (content: string, styles: CellDef['styles'] = {}, extra: Partial<CellDef> = {}): CellDef => ({
    content,
    styles,
    ...extra,
  });
  const bold = { fontStyle: 'bold' as const };
  const center = { halign: 'center' as const };
  const right = { halign: 'right' as const };

  const body: RowInput[] = [];

  // Ref ... Date — the date is drawn right-aligned over this row in didDrawCell.
  body.push([c(`Ref: ${m.refNo}`, { ...bold, fontSize: 11 }, { colSpan: n })]);
  body.push([c('PURCHASE ORDER', { ...bold, ...center, fontSize: 11 }, { colSpan: n })]);

  // To M/s. vendor (merged down) | quotation label | value.
  // The text only sizes the cell (the vendor name is one size up, so it gets an
  // extra line); didDrawCell draws it with the name in bold.
  const vendorText = ['To', m.vendor.name, '', ...m.vendor.lines, m.vendor.phone].join('\n');
  const vendorRow = body.length;
  m.quoteFields.forEach((f, i) => {
    body.push([
      ...(i === 0
        ? [c(vendorText, { valign: 'top', fontSize: 10 }, { colSpan: vSpan, rowSpan: m.quoteFields.length })]
        : []),
      c(f.label, { ...bold, fontSize: 7.5 }, { colSpan: qlSpan }),
      c(f.value, { ...bold, ...center }, { colSpan: qvSpan }),
    ]);
  });

  // Item header + rows.
  body.push(m.itemColumns.map((col) => c(col.label, { ...bold, ...center })));
  for (const r of m.itemRows) {
    body.push(r.cells.map((cell) => c(cell.value, { halign: cell.align ?? 'left' })));
  }

  // Total / Round off / Grand Total.
  for (const t of m.totals) {
    body.push([c(t.label, { ...bold, ...right }, { colSpan: n - 1 }), c(t.value, { ...bold, ...right })]);
  }

  // TERMS & CONDITION | ENCLOSURE | SPECIAL NOTE.
  body.push([
    c('TERMS & CONDITION', { ...bold, ...center }, { colSpan: tSpan }),
    c('ENCLOSURE', { ...bold, ...center }, { colSpan: eSpan }),
    c('SPECIAL NOTE', { ...bold, ...center }, { colSpan: sSpan }),
  ]);
  // Sizes the cell; didDrawCell draws label / colon / value on fixed tab stops.
  const termsText = m.terms.map((t) => `${t.label}  : ${t.value}`).join('\n\n');
  const termsRow = body.length;
  const enclosure = [
    m.enclosure.mode,
    `Dated${m.enclosure.dated ? `\n${m.enclosure.dated}` : ''}`,
    `Bank${m.enclosure.bank ? `\n${m.enclosure.bank}` : ''}`,
    `Amount (Rs.)${m.enclosure.amount ? `\n${m.enclosure.amount}` : ''}`,
  ];
  enclosure.forEach((text, i) => {
    body.push([
      ...(i === 0 ? [c(termsText, { ...bold, valign: 'top', minCellHeight: 30 }, { colSpan: tSpan, rowSpan: 4 })] : []),
      c(text, { ...bold, ...center }, { colSpan: eSpan }),
      ...(i === 0
        ? [c(m.specialNote, { ...bold, ...center, valign: 'middle', fontSize: 11 }, { colSpan: sSpan, rowSpan: 4 })]
        : []),
    ]);
  });

  autoTable(doc, {
    startY: margin,
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    tableWidth: width,
    body,
    theme: 'plain',
    styles: {
      font: FONT,
      fontSize: 9,
      textColor: 0,
      lineColor: 0,
      lineWidth: 0.2,
      cellPadding: 1.5,
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: Object.fromEntries(grid.map((w, i) => [i, { cellWidth: w }])),
    willDrawCell: (data) => {
      const custom =
        data.column.index === 0 && (data.row.index === vendorRow || data.row.index === termsRow);
      if (custom) data.cell.text = [];
    },
    didDrawCell: (data) => {
      const x = data.cell.x + 1.5;
      let y = data.cell.y + 5;
      if (data.column.index === 0 && data.row.index === vendorRow) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        doc.text('To', x, y);
        doc.setFontSize(12);
        y += 5.5;
        doc.text(m.vendor.name, x, y);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(11);
        for (const line of m.vendor.lines) {
          y += 5;
          doc.text(line, x, y);
        }
        if (m.vendor.phone) {
          doc.setFontSize(9);
          doc.text(m.vendor.phone, x, y + 4.5);
        }
      }
      if (data.column.index === 0 && data.row.index === termsRow) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        for (const t of m.terms) {
          doc.text(t.label, x, y);
          doc.text(':', x + 20, y);
          const value = doc.splitTextToSize(t.value, data.cell.width - 26);
          doc.text(value, x + 23, y);
          y += 6 + (value.length - 1) * 4.2;
        }
      }
      if (data.row.index === 0 && data.column.index === 0) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(11);
        doc.text(`Date: ${m.refDate}`, data.cell.x + data.cell.width - 2, data.cell.y + data.cell.height / 2, {
          align: 'right',
          baseline: 'middle',
        });
      }
    },
  });

  doc.save(`${po.po_number}.pdf`);
}
