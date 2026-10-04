// lib/procurement/requirement-list-pdf.ts
//
// Client-side generator for the Purchase Requirement List (PRD step 3): the PDF
// an RFQ is issued to vendors so they can prepare quotations. jspdf +
// jspdf-autotable, no server round-trip.
//
// Layout: institution letterhead, one addressed copy per vendor (a single PDF),
// shaded fill-in columns for the vendor's make/rate/GST/amount, a commercial
// terms block, instructions, and signature blocks.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RfqWithDetails, ProcurementRfqVendor } from '@/types/procurement';
import { formatDateDMY } from '@/lib/utils/date-format';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/** Vendors get this many days from the RFQ date to reply (RFQs carry no due date). */
const QUOTE_WINDOW_DAYS = 7;
/** Pad the item table so vendors have room to add alternatives. */
const MIN_TABLE_ROWS = 4;

type Rgb = [number, number, number];
const ACCENT: Rgb = [14, 122, 69]; // JKKN green (--primary)
const INK: Rgb = [17, 24, 22];
const SOFT: Rgb = [77, 90, 85];
const FAINT: Rgb = [138, 150, 144];
const RULE: Rgb = [201, 211, 207];
const ZEBRA: Rgb = [243, 246, 245];
const FIELD: Rgb = [248, 250, 249];

interface Letterhead {
  name: string;
  address: string;
  contact: string;
  email: string | null;
  logo: string | null; // PNG data URL
}

async function loadLogo(url: string): Promise<string | null> {
  // Draw through a canvas so any browser-decodable format (webp, svg, jpeg) ends up PNG.
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null); // tainted canvas (no CORS) — print without the logo
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadLetterhead(institutionId: string): Promise<Letterhead> {
  const fallback: Letterhead = { name: 'JKKN Institutions', address: '', contact: '', email: null, logo: null };
  try {
    const { data } = await createClientSupabaseClient()
      .from('institutions')
      .select(
        'name, display_name, address_line1, address_line2, address_line3, city, state, pin_code, phone, email, website, logo_url'
      )
      .eq('id', institutionId)
      .maybeSingle();
    if (!data) return fallback;
    const place = [data.address_line1, data.address_line2, data.address_line3, data.city, data.state]
      .map((p: string | null) => p?.trim())
      .filter(Boolean)
      .join(', ');
    const website = data.website?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      name: data.display_name || data.name || fallback.name,
      address: [place, data.pin_code].filter(Boolean).join(' – '),
      contact: [data.email, website, data.phone].filter(Boolean).join('  ·  '),
      email: data.email || null,
      logo: data.logo_url ? await loadLogo(data.logo_url) : null,
    };
  } catch {
    return fallback;
  }
}

/** A blank or purely numeric unit (e.g. "1" typed into the unit box) prints as "Nos". */
function unitLabel(raw: string | null): string {
  const u = raw?.trim();
  return !u || /^\d+(\.\d+)?$/.test(u) ? 'Nos' : u;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function renderCopy(
  doc: jsPDF,
  rfq: RfqWithDetails,
  lh: Letterhead,
  vendor: ProcurementRfqVendor | null
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 14;
  const right = pageW - mx;
  const contentW = pageW - mx * 2;
  const gap = 6;

  // ── Letterhead ──────────────────────────────────────────────
  let textX = mx;
  if (lh.logo) {
    doc.addImage(lh.logo, 'PNG', mx, 11, 18, 18);
    textX = mx + 22;
  }
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(doc.splitTextToSize(lh.name, 100)[0], textX, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  if (lh.address) doc.text(doc.splitTextToSize(lh.address, 100)[0], textX, 22.5);
  if (lh.contact) doc.text(doc.splitTextToSize(lh.contact, 100)[0], textX, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ACCENT);
  // jsPDF's right-align ignores character spacing, so position the tracked label by hand.
  const eyebrow = 'REQUEST FOR QUOTATION';
  const track = 0.6;
  doc.setCharSpace(track);
  doc.text(eyebrow, right - doc.getTextWidth(eyebrow) - track * (eyebrow.length - 1), 15);
  doc.setCharSpace(0);
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text('Requirement List', right, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(rfq.rfq_number, right, 27, { align: 'right' });

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.line(mx, 33, right, 33);

  // ── To / RFQ details ────────────────────────────────────────
  const boxY = 38;
  const boxH = 25;
  const leftW = contentW * 0.55;
  const rightX = mx + leftW + gap;
  const rightW = contentW - leftW - gap;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.roundedRect(mx, boxY, leftW, boxH, 1, 1);
  doc.roundedRect(rightX, boxY, rightW, boxH, 1, 1);

  const label = (text: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    doc.setCharSpace(0.5);
    doc.text(text, x, y);
    doc.setCharSpace(0);
  };

  label('TO', mx + 4, boxY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.setFontSize(12);
  const vendorName = vendor ? vendor.supplier?.name ?? 'Vendor' : 'All invited vendors';
  doc.text(doc.splitTextToSize(vendorName, leftW - 8)[0], mx + 4, boxY + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  const vendorMeta = vendor
    ? [vendor.supplier?.code && `Vendor code ${vendor.supplier.code}`, vendor.supplier?.email || vendor.sent_email]
        .filter(Boolean)
        .join('  ·  ')
    : '';
  if (vendorMeta) doc.text(doc.splitTextToSize(vendorMeta, leftW - 8)[0], mx + 4, boxY + 19);

  const details: [string, string][] = [
    ['RFQ No.', rfq.rfq_number],
    ['Date', formatDateDMY(rfq.created_at)],
    ['Against request', rfq.source_request?.request_number ?? '—'],
    ['Quote by', formatDateDMY(addDays(rfq.created_at, QUOTE_WINDOW_DAYS))],
  ];
  details.forEach(([k, v], i) => {
    const y = boxY + 6 + i * 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SOFT);
    doc.text(k, rightX + 4, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(v, rightX + rightW - 4, y, { align: 'right' });
  });

  // ── Intro ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  const intro: string[] = doc.splitTextToSize(
    'Please quote your best rates for the items below. Fill in the shaded columns and the terms, then sign, stamp and return this sheet with your quotation.',
    contentW
  );
  doc.text(intro, mx, boxY + boxH + 7);
  const tableY = boxY + boxH + 7 + intro.length * 4 + 2;

  // ── Items ───────────────────────────────────────────────────
  const body: string[][] = rfq.items.map((it, i) => [
    String(i + 1),
    it.item_spec?.trim() ? `${it.item_name}\n${it.item_spec.trim()}` : it.item_name,
    String(Number(it.quantity)),
    unitLabel(it.unit_label),
    '',
    '',
    '',
    '',
  ]);
  while (body.length < MIN_TABLE_ROWS) body.push(['', '', '', '', '', '', '', '']);

  autoTable(doc, {
    startY: tableY,
    margin: { left: mx, right: mx, bottom: 22 },
    head: [['#', 'Item & specification', 'Qty', 'Unit', 'Make / model offered', 'Rate (Rs.)', 'GST %', 'Amount (Rs.)']],
    body,
    foot: [['', '', '', '', '', '', 'Total', '']],
    showFoot: 'lastPage',
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
      textColor: INK,
      lineColor: RULE,
      lineWidth: { bottom: 0.2 },
      minCellHeight: 8,
      valign: 'top',
    },
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
    footStyles: { fillColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 14 },
      4: { cellWidth: 32 },
      5: { cellWidth: 21, halign: 'right' },
      6: { cellWidth: 14, halign: 'right' },
      7: { cellWidth: 22, halign: 'right' },
    },
    didParseCell: (data) => {
      // The vendor's fill-in columns stay shaded on every row.
      if (data.section === 'body' && data.column.index >= 4) data.cell.styles.fillColor = FIELD;
      // Item name is bold; the spec (second line) is drawn lighter in didDrawCell.
      if (data.section === 'body' && data.column.index === 1 && typeof data.cell.raw === 'string') {
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'head' && [2, 5, 6, 7].includes(data.column.index)) {
        data.cell.styles.halign = 'right';
      }
      if (data.section === 'foot' && data.column.index === 6) data.cell.styles.halign = 'right';
      if (data.section === 'foot' && data.column.index === 7) {
        data.cell.styles.lineWidth = { bottom: 0.3 };
        data.cell.styles.lineColor = INK;
      }
    },
    willDrawCell: (data) => {
      // Autotable draws one style per cell. Keep the (possibly wrapped) name lines in
      // bold here and blank out the spec lines, which didDrawCell paints lighter.
      if (data.section !== 'body' || data.column.index !== 1 || typeof data.cell.raw !== 'string') return;
      const nl = data.cell.raw.indexOf('\n');
      if (nl < 0) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const nameLines = (doc.splitTextToSize(data.cell.raw.slice(0, nl), data.cell.width - 4) as string[]).length;
      const cell = data.cell as typeof data.cell & { specLines?: string[]; nameLines?: number };
      cell.specLines = data.cell.text.slice(nameLines);
      cell.nameLines = nameLines;
      data.cell.text = data.cell.text.map((t, i) => (i < nameLines ? t : ''));
    },
    didDrawCell: (data) => {
      // Hairlines between the vendor's fill-in columns so each box reads as a field.
      if (data.section === 'body' && data.column.index >= 4) {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
      }
      const cell = data.cell as typeof data.cell & { specLines?: string[]; nameLines?: number };
      if (data.section !== 'body' || data.column.index !== 1 || !cell.specLines?.length) return;
      const lineH = 8.5 * 0.3528 * 1.15; // pt -> mm × jsPDF line-height factor
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(cell.specLines, cell.x + 2, cell.y + 2.2 + lineH * (cell.nameLines ?? 1) + 2.4);
    },
  });

  // ── Terms + instructions ────────────────────────────────────
  // @ts-expect-error lastAutoTable is added by the autotable plugin at runtime
  let y: number = (doc.lastAutoTable?.finalY ?? tableY + 30) + 7;
  const blockH = 50;
  const signH = 22;
  if (y + blockH + signH > pageH - 14) {
    doc.addPage();
    y = 18;
  }
  const colW = (contentW - gap) / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.roundedRect(mx, y, colW, blockH, 1, 1);
  doc.roundedRect(mx + colW + gap, y, colW, blockH, 1, 1);

  label('YOUR COMMERCIAL TERMS', mx + 4, y + 6);
  const terms = ['GSTIN', 'Quote valid until', 'Delivery within (days)', 'Warranty', 'Freight & installation', 'Payment terms'];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  terms.forEach((t, i) => {
    const ly = y + 13 + i * 6.3;
    doc.setTextColor(...SOFT);
    doc.text(t, mx + 4, ly);
    const lx = mx + 4 + doc.getTextWidth(t) + 3;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(lx, ly + 0.6, mx + colW - 4, ly + 0.6);
  });

  const ix = mx + colW + gap + 4;
  label('INSTRUCTIONS', ix, y + 6);
  const instructions = [
    'Quote rates per unit shown, excluding GST; enter GST separately.',
    'Mention make and model for every item; mark any alternative as such.',
    lh.email
      ? `Send your quotation to ${lh.email} quoting ${rfq.rfq_number}.`
      : `Quote ${rfq.rfq_number} on your quotation.`,
    'The institution may order all, part or none of the items listed.',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...SOFT);
  let iy = y + 12;
  instructions.forEach((line, i) => {
    const wrapped: string[] = doc.splitTextToSize(line, colW - 14);
    doc.text(`${i + 1}.`, ix, iy);
    doc.text(wrapped, ix + 4, iy);
    iy += wrapped.length * 3.8 + 1.6;
  });

  // ── Signatures (bottom of the copy's last page) ─────────────
  const sy = Math.max(y + blockH + 16, pageH - 34);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(mx, sy, mx + colW - 10, sy);
  doc.line(mx + colW + gap + 10, sy, right, sy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(`For ${lh.name}`, colW - 10)[0], mx, sy + 4.5);
  doc.text("Vendor's signature & seal", mx + colW + gap + 10, sy + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...SOFT);
  doc.text('Authorised signatory', mx, sy + 9);
  doc.text('Name  ·  Date', mx + colW + gap + 10, sy + 9);
}

/**
 * Build and download the requirement-list PDF: one addressed copy per invited
 * vendor (or a single generic copy when none are attached yet).
 */
export async function downloadRequirementListPdf(rfq: RfqWithDetails): Promise<void> {
  const lh = await loadLetterhead(rfq.institution_id);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const copies: (ProcurementRfqVendor | null)[] = rfq.vendors.length ? rfq.vendors : [null];
  const copyOfPage: number[] = []; // page index (0-based) -> copy index

  copies.forEach((vendor, ci) => {
    if (ci > 0) doc.addPage();
    const start = doc.getNumberOfPages();
    renderCopy(doc, rfq, lh, vendor);
    for (let p = start; p <= doc.getNumberOfPages(); p++) copyOfPage[p - 1] = ci;
  });

  // Footer on every page: RFQ reference + copy / page position within that copy.
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const ci = copyOfPage[p - 1];
    const pagesOfCopy = copyOfPage.filter((c) => c === ci).length;
    const pageInCopy = copyOfPage.slice(0, p).filter((c) => c === ci).length;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(14, pageH - 13, pageW - 14, pageH - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(`${rfq.rfq_number}  ·  Requirement List`, 14, pageH - 8.5);
    const pos =
      copies.length > 1
        ? `Copy ${ci + 1} of ${copies.length}  ·  Page ${pageInCopy} of ${pagesOfCopy}`
        : `Page ${pageInCopy} of ${pagesOfCopy}`;
    doc.text(pos, pageW - 14, pageH - 8.5, { align: 'right' });
  }

  doc.save(`${rfq.rfq_number}-requirement-list.pdf`);
}
