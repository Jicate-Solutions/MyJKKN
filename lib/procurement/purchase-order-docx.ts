// lib/procurement/purchase-order-docx.ts
//
// Client-side Purchase Order DOCX reproducing the institution's paper PO: one
// bordered table (Ref/Date · PURCHASE ORDER · To M/s. vendor + quotation boxes ·
// items · totals · Terms & Condition / Enclosure / Special Note) in Bookman Old
// Style. Consumes the same resolved model as purchase-order-pdf.ts
// (lib/procurement/po-document-model.ts) so both outputs stay in sync.
// docx's Packer.toBlob() runs fine in the browser — no server round-trip.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Tab,
  TabStopType,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  type TableVerticalAlign,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import type { PoWithItems } from '@/types/procurement';
import { resolvePoDocumentModel } from './po-document-model';
import { itemColumnWeights, splitSpans } from './po-document-layout';

const FONT = 'Bookman Old Style';
const MARGIN = 720; // 0.5"
const TABLE_WIDTH = 11906 - MARGIN * 2; // A4 width minus margins
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const alignOf = (a?: 'left' | 'center' | 'right'): Align =>
  a === 'right' ? AlignmentType.RIGHT : a === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;

/** One paragraph; size is in points. */
function para(text: string, o: { size?: number; bold?: boolean; align?: Align } = {}) {
  return new Paragraph({
    alignment: o.align ?? AlignmentType.LEFT,
    children: [new TextRun({ text, font: FONT, bold: o.bold, size: (o.size ?? 10) * 2 })],
  });
}

function cell(
  children: Paragraph[],
  o: { span?: number; rowSpan?: number; width: number; valign?: TableVerticalAlign }
) {
  return new TableCell({
    borders: BORDERS,
    columnSpan: o.span && o.span > 1 ? o.span : undefined,
    rowSpan: o.rowSpan && o.rowSpan > 1 ? o.rowSpan : undefined,
    width: { size: o.width, type: WidthType.DXA },
    verticalAlign: o.valign ?? VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: children.length ? children : [para('')],
  });
}

export async function downloadPurchaseOrderDocx(po: PoWithItems): Promise<void> {
  const m = resolvePoDocumentModel(po);

  // One grid shared by every row: the item columns. Other rows span groups of them.
  const weights = itemColumnWeights(m.itemColumns.map((c) => c.key));
  const sum = weights.reduce((a, b) => a + b, 0);
  const grid = weights.map((w) => Math.floor((w / sum) * TABLE_WIDTH));
  const n = grid.length;
  const widthOf = (from: number, span: number) => grid.slice(from, from + span).reduce((a, b) => a + b, 0);

  // Vendor block | quotation label | quotation value ≈ 50% / 28% / 22%.
  const [vSpan, qlSpan, qvSpan] = splitSpans(grid, [0.5, 0.28, 0.22]);
  // Terms | Enclosure | Special note ≈ 50% / 17% / 33%.
  const [tSpan, eSpan, sSpan] = splitSpans(grid, [0.5, 0.17, 0.33]);

  const rows: TableRow[] = [];

  // Ref ........ Date, then PURCHASE ORDER.
  rows.push(
    new TableRow({
      children: [
        cell(
          [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TABLE_WIDTH - 200 }],
              children: [
                new TextRun({ text: `Ref: ${m.refNo}`, font: FONT, bold: true, size: 24 }),
                new TextRun({ children: [new Tab(), `Date: ${m.refDate}`], font: FONT, bold: true, size: 24 }),
              ],
            }),
            para('PURCHASE ORDER', { size: 12, bold: true, align: AlignmentType.CENTER }),
          ],
          { span: n, width: TABLE_WIDTH }
        ),
      ],
    })
  );

  // To M/s. vendor (merged down) | quotation label | value.
  const vendorParas = [
    para('To', { bold: true }),
    para(m.vendor.name, { size: 12, bold: true }),
    ...m.vendor.lines.map((l) => para(l, { size: 11 })),
    ...(m.vendor.phone ? [para(m.vendor.phone, { size: 9 })] : []),
  ];
  m.quoteFields.forEach((f, i) => {
    rows.push(
      new TableRow({
        children: [
          ...(i === 0
            ? [cell(vendorParas, { span: vSpan, rowSpan: m.quoteFields.length, width: widthOf(0, vSpan), valign: VerticalAlign.TOP })]
            : []),
          cell([para(f.label, { size: 8, bold: true })], { span: qlSpan, width: widthOf(vSpan, qlSpan) }),
          cell([para(f.value, { bold: true, align: AlignmentType.CENTER })], { span: qvSpan, width: widthOf(vSpan + qlSpan, qvSpan) }),
        ],
      })
    );
  });

  // Items.
  rows.push(
    new TableRow({
      tableHeader: true,
      children: m.itemColumns.map((c, i) =>
        cell([para(c.label, { bold: true, align: AlignmentType.CENTER })], { width: grid[i] })
      ),
    }),
    ...m.itemRows.map(
      (r) =>
        new TableRow({
          cantSplit: true,
          children: r.cells.map((c, i) => cell([para(c.value, { size: 9.5, align: alignOf(c.align) })], { width: grid[i] })),
        })
    )
  );

  // Total / Round off / Grand Total.
  for (const t of m.totals) {
    rows.push(
      new TableRow({
        children: [
          cell([para(t.label, { bold: true, align: AlignmentType.RIGHT })], { span: n - 1, width: widthOf(0, n - 1) }),
          cell([para(t.value, { bold: true, align: AlignmentType.RIGHT })], { width: grid[n - 1] }),
        ],
      })
    );
  }

  // TERMS & CONDITION | ENCLOSURE | SPECIAL NOTE.
  rows.push(
    new TableRow({
      children: [
        cell([para('TERMS & CONDITION', { bold: true, align: AlignmentType.CENTER })], { span: tSpan, width: widthOf(0, tSpan) }),
        cell([para('ENCLOSURE', { bold: true, align: AlignmentType.CENTER })], { span: eSpan, width: widthOf(tSpan, eSpan) }),
        cell([para('SPECIAL NOTE', { bold: true, align: AlignmentType.CENTER })], { span: sSpan, width: widthOf(tSpan + eSpan, sSpan) }),
      ],
    })
  );
  const enclosure = [
    [m.enclosure.mode, ''],
    ['Dated', m.enclosure.dated],
    ['Bank', m.enclosure.bank],
    ['Amount (Rs.)', m.enclosure.amount],
  ];
  enclosure.forEach(([label, value], i) => {
    rows.push(
      new TableRow({
        children: [
          ...(i === 0
            ? [
                cell(
                  m.terms.map(
                    (t) =>
                      new Paragraph({
                        tabStops: [{ type: TabStopType.LEFT, position: 1300 }],
                        spacing: { after: 80 },
                        children: [
                          new TextRun({ text: t.label, font: FONT, bold: true, size: 20 }),
                          new TextRun({ children: [new Tab(), `: ${t.value}`], font: FONT, bold: true, size: 20 }),
                        ],
                      })
                  ),
                  { span: tSpan, rowSpan: 4, width: widthOf(0, tSpan), valign: VerticalAlign.TOP }
                ),
              ]
            : []),
          cell(
            [
              para(label, { bold: true, align: AlignmentType.CENTER }),
              ...(value ? [para(value, { bold: true, align: AlignmentType.CENTER })] : []),
            ],
            { span: eSpan, width: widthOf(tSpan, eSpan) }
          ),
          ...(i === 0
            ? [
                cell([para(m.specialNote, { size: 12, bold: true, align: AlignmentType.CENTER })], {
                  span: sSpan,
                  rowSpan: 4,
                  width: widthOf(tSpan + eSpan, sSpan),
                }),
              ]
            : []),
        ],
      })
    );
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: [
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: grid,
            rows,
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${po.po_number}.docx`);
}
