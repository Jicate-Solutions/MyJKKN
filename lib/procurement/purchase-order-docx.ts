// lib/procurement/purchase-order-docx.ts
//
// Client-side Purchase Order DOCX, mirroring the bordered-table letterhead
// look of the source sample PO documents. Consumes the same resolved
// document model as purchase-order-pdf.ts (lib/procurement/po-document-model.ts)
// so both outputs stay in sync as formats evolve. docx's Packer.toBlob()
// runs fine in the browser — no server round-trip needed.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
  VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import type { PoWithItems } from '@/types/procurement';
import { resolvePoDocumentModel } from './po-document-model';

const TABLE_WIDTH_DXA = 9360; // Letter, 1" margins
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function textCell(text: string, opts: { bold?: boolean; width: number; shaded?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType] } ) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: { size: opts.width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shaded ? { fill: 'E8EEF7', type: ShadingType.CLEAR } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, size: 18 })],
      }),
    ],
  });
}

export async function downloadPurchaseOrderDocx(po: PoWithItems, orgName = 'JKKN'): Promise<void> {
  const model = resolvePoDocumentModel(po, orgName);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'PURCHASE ORDER', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: model.orgName, size: 20, color: '555555' })],
    }),
  ];

  // Header fields: bordered label/value table.
  if (model.headerFields.length > 0) {
    children.push(
      new Table({
        columnWidths: [TABLE_WIDTH_DXA * 0.35, TABLE_WIDTH_DXA * 0.65],
        rows: model.headerFields.map(
          (f) =>
            new TableRow({
              children: [
                textCell(f.label, { bold: true, width: TABLE_WIDTH_DXA * 0.35, shaded: true }),
                textCell(f.value, { width: TABLE_WIDTH_DXA * 0.65 }),
              ],
            })
        ),
      }),
      new Paragraph({ spacing: { after: 200 }, children: [] })
    );
  }

  // Items table.
  const weights = model.itemColumns.map((c) => 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => Math.floor((w / totalWeight) * TABLE_WIDTH_DXA));

  const alignOf = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? AlignmentType.RIGHT : align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;

  children.push(
    new Table({
      columnWidths: colWidths,
      rows: [
        new TableRow({
          tableHeader: true,
          children: model.itemColumns.map((c, i) =>
            textCell(c.label, { bold: true, width: colWidths[i], shaded: true, align: AlignmentType.CENTER })
          ),
        }),
        ...model.itemRows.map(
          (row) =>
            new TableRow({
              children: row.cells.map((cell, i) =>
                textCell(cell.value, { width: colWidths[i], align: alignOf(cell.align) })
              ),
            })
        ),
      ],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [] })
  );

  // Totals.
  children.push(
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`Subtotal: ${model.totals.subtotal.toLocaleString()}`)] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`Tax: ${model.totals.tax.toLocaleString()}`)] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Total: ${model.totals.total.toLocaleString()}`, bold: true, size: 22 })],
    })
  );

  if (model.termsAndConditions) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: 'Terms & Conditions: ', bold: true }),
          new TextRun(model.termsAndConditions),
        ],
      })
    );
  }

  // 3-column footer: Terms & Condition / Enclosure / Special Note.
  if (model.footerGroups.length > 0) {
    const footerColWidth = Math.floor(TABLE_WIDTH_DXA / model.footerGroups.length);
    children.push(
      new Table({
        columnWidths: model.footerGroups.map(() => footerColWidth),
        rows: [
          new TableRow({
            children: model.footerGroups.map((group) => {
              const paragraphs = [
                new Paragraph({
                  children: [new TextRun({ text: group.title, bold: true, size: 18 })],
                }),
                ...(group.freeText
                  ? [new Paragraph({ children: [new TextRun({ text: group.text || '', size: 18 })] })]
                  : (group.fields || []).map(
                      (f) =>
                        new Paragraph({
                          children: [new TextRun({ text: `${f.label}: ${f.value}`, size: 18 })],
                        })
                    )),
              ];
              return new TableCell({
                borders: CELL_BORDERS,
                width: { size: footerColWidth, type: WidthType.DXA },
                children: paragraphs,
              });
            }),
          }),
        ],
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${po.po_number}.docx`);
}
