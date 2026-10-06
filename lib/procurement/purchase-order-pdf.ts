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

const TABLE_STYLES = {
  font: FONT,
  fontSize: 9,
  textColor: 0,
  lineColor: 0,
  lineWidth: 0.2,
  // Tight rows so a typical order and its terms fit on one page.
  cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
  valign: 'middle' as const,
  overflow: 'linebreak' as const,
};

export function downloadPurchaseOrderPdf(po: PoWithItems): void {
  const m = resolvePoDocumentModel(po);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12.7; // 0.5"
  const width = doc.internal.pageSize.getWidth() - margin * 2;

  const weights = itemColumnWeights(m.itemColumns.map((c) => c.key));
  const sum = weights.reduce((a, b) => a + b, 0);
  const grid = weights.map((w) => (w / sum) * width);
  const n = grid.length;
  // The quotation value column gets room for a whole quotation number ("8190/CGSC/QUO/2026-27").
  const [vSpan, qlSpan, qvSpan] = splitSpans(grid, [0.46, 0.24, 0.3]);
  const [tSpan, eSpan, sSpan] = splitSpans(grid, [0.46, 0.24, 0.3]);

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
  // Long names and addresses wrap inside the vendor box — never run into the
  // quotation boxes. The text only sizes the cell; didDrawCell draws it.
  const vendorWidth = grid.slice(0, vSpan).reduce((a, b) => a + b, 0) - 3;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12);
  const nameLines: string[] = doc.splitTextToSize(m.vendor.name, vendorWidth);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(11);
  const addressLines: string[] = m.vendor.lines.flatMap((l) => doc.splitTextToSize(l, vendorWidth) as string[]);
  doc.setFontSize(9);
  const phoneLines: string[] = m.vendor.phone ? doc.splitTextToSize(m.vendor.phone, vendorWidth) : [];
  // One sizing line per drawn line, plus a little air.
  const vendorText = ['To', ...nameLines, ...addressLines, ...phoneLines, ''].join('\n');
  const vendorRow = body.length;
  m.quoteFields.forEach((f, i) => {
    body.push([
      ...(i === 0
        ? [c(vendorText, { valign: 'top', fontSize: 11 }, { colSpan: vSpan, rowSpan: m.quoteFields.length })]
        : []),
      c(f.label, { ...bold, fontSize: 7.5 }, { colSpan: qlSpan }),
      c(f.value, { ...bold, ...center, fontSize: 8.5 }, { colSpan: qvSpan }),
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

  autoTable(doc, {
    startY: margin,
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    tableWidth: width,
    body,
    theme: 'plain',
    styles: TABLE_STYLES,
    columnStyles: Object.fromEntries(grid.map((w, i) => [i, { cellWidth: w }])),
    willDrawCell: (data) => {
      if (data.column.index === 0 && data.row.index === vendorRow) data.cell.text = [];
    },
    didDrawCell: (data) => {
      const x = data.cell.x + 1.5;
      let y = data.cell.y + 5;
      if (data.column.index === 0 && data.row.index === vendorRow) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        doc.text('To', x, y);
        doc.setFontSize(12);
        for (const line of nameLines) {
          y += 5.5;
          doc.text(line, x, y);
        }
        doc.setFont(FONT, 'normal');
        doc.setFontSize(11);
        for (const line of addressLines) {
          y += 5;
          doc.text(line, x, y);
        }
        doc.setFontSize(9);
        for (const line of phoneLines) {
          y += 4.5;
          doc.text(line, x, y);
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

  // TERMS & CONDITION | ENCLOSURE | SPECIAL NOTE — its own table, kept whole:
  // when it doesn't fit under the items it moves to the next page together.
  const foot: RowInput[] = [];
  foot.push([
    c('TERMS & CONDITION', { ...bold, ...center }, { colSpan: tSpan }),
    c('ENCLOSURE', { ...bold, ...center }, { colSpan: eSpan }),
    c('SPECIAL NOTE', { ...bold, ...center }, { colSpan: sSpan }),
  ]);
  // Sizes the cell; didDrawCell draws label / colon / value on fixed tab stops.
  const termsText = m.terms.map((t) => `${t.label}  : ${t.value}`).join('\n\n');
  const termsRow = foot.length;
  const enclosure = [
    m.enclosure.mode,
    `Dated${m.enclosure.dated ? `\n${m.enclosure.dated}` : ''}`,
    `Bank${m.enclosure.bank ? `\n${m.enclosure.bank}` : ''}`,
    `Amount (Rs.)${m.enclosure.amount ? `\n${m.enclosure.amount}` : ''}`,
  ];
  enclosure.forEach((text, i) => {
    foot.push([
      ...(i === 0 ? [c(termsText, { ...bold, valign: 'top', minCellHeight: 30 }, { colSpan: tSpan, rowSpan: 4 })] : []),
      c(text, { ...bold, ...center }, { colSpan: eSpan }),
      ...(i === 0
        ? [c(m.specialNote, { ...bold, ...center, valign: 'middle', fontSize: 11 }, { colSpan: sSpan, rowSpan: 4 })]
        : []),
    ]);
  });


  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY,
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    tableWidth: width,
    body: foot,
    theme: 'plain',
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    styles: TABLE_STYLES,
    columnStyles: Object.fromEntries(grid.map((w, i) => [i, { cellWidth: w }])),
    willDrawCell: (data) => {
      if (data.column.index === 0 && data.row.index === termsRow) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.column.index !== 0 || data.row.index !== termsRow) return;
      const x = data.cell.x + 1.5;
      let y = data.cell.y + 5;
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      for (const t of m.terms) {
        doc.text(t.label, x, y);
        doc.text(':', x + 20, y);
        const value = doc.splitTextToSize(t.value, data.cell.width - 26);
        doc.text(value, x + 23, y);
        y += 6 + (value.length - 1) * 4.2;
      }
    },
  });

  doc.save(`${po.po_number}.pdf`);
}
