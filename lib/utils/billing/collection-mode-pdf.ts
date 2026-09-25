// Collection report → one landscape PDF per payment mode (Cash, Online) for
// /billing/reports?tab=collection.
//
// LAYOUT (per mode file)
//  - One section per institution, each starting on a fresh page with that
//    institution's letterhead (logo + name + affiliation + address), then the
//    report title ("CASH COLLECTION REPORT") and the date / period line.
//  - Then ONE autoTable for the section: receipts grouped by day with a Day
//    Total row after each day, and a Grand Total at the end. A single table
//    keeps the column header repeating across page breaks.
//  - Cash lists "Collected By"; Online lists "Reference / Txn No" — the one
//    column a counter reconciles each mode against.
//  - "MYJKKN ID" is the learner's jkkn_identities.jkkn_id (RPC column jkkn_id).
//
// Letterhead data comes from the institutions table (name, logo_url, address,
// university_affiliation_name) looked up by the institution name the report
// RPC returns. A missing/unloadable logo falls back to the branding mark, and a
// logo is never allowed to abort the export.
//
// jsPDF's default export is the constructor only in a browser bundle; this file
// is imported dynamically from a client component, matching receipt-pdf.ts.

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { CollectionDaywiseRow } from '@/types/billing-schedule';
import { groupByDay, learnerName } from '@/lib/services/billing/reports/collection-daywise';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';

type RGB = [number, number, number];

// Print-style: no cell fills, black grid.
const GRID: RGB = [0, 0, 0];

const MARGIN = 10;

const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

/** "Rs." rather than "₹": jsPDF's built-in fonts have no rupee glyph. */
const money = (n: number) => `Rs. ${inr.format(n)}`;

const num = (v: unknown) => Number(v) || 0;

/** 25.09.2026 — the format the accounts office prints. */
function dotDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export interface CollectionPdfInstitution {
  name: string;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  pin_code?: string | null;
  university_affiliation_name?: string | null;
  counselling_code?: string | null;
}

export type CollectionPdfMode = 'cash' | 'online';

const MODE_TITLE: Record<CollectionPdfMode, string> = {
  cash: 'CASH COLLECTION REPORT',
  online: 'ONLINE COLLECTION REPORT'
};

export interface CollectionModePdfOptions {
  mode: CollectionPdfMode;
  /** Rows already filtered to this payment mode. */
  rows: CollectionDaywiseRow[];
  /** From/To of the report (ISO). Equal → a single "Date:" line. */
  dateFrom: string;
  dateTo: string;
  /** Institution details keyed by institutions.name. */
  institutions: Map<string, CollectionPdfInstitution>;
}

/** Fetch an image and inline it as a data URL; undefined on any failure. */
async function toDataUrl(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g)$/i.test(blob.type)) return undefined; // jsPDF: no SVG/WebP
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Natural size of a data-URL image, for aspect-correct placement. */
function imageSize(dataUrl: string): Promise<{ w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

interface Letterhead {
  name: string;
  affiliation: string;
  address: string;
  logo?: { data: string; w: number; h: number };
}

async function resolveLetterhead(
  name: string,
  inst: CollectionPdfInstitution | undefined
): Promise<Letterhead> {
  const brand = getInstitutionHeader(name, inst?.counselling_code);
  const addressParts = [inst?.address_line1, inst?.address_line2, inst?.address_line3]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  let address = addressParts.join(', ');
  if (address && inst?.pin_code) address += ` - ${inst.pin_code}`;

  const data =
    (await toDataUrl(inst?.logo_url)) ??
    (await toDataUrl(brand.logoImage)) ??
    (await toDataUrl('/logo.png'));
  const size = data ? await imageSize(data) : undefined;

  return {
    name: (inst?.name || name).toUpperCase(),
    affiliation: inst?.university_affiliation_name
      ? `(Affiliated to ${inst.university_affiliation_name})`
      : brand.institution_accreditation,
    address: address || brand.institution_address,
    logo: data && size ? { data, ...size } : undefined
  };
}

/** Draws the letterhead + report title + date; returns the Y to start the table. */
function drawHeader(
  doc: jsPDF,
  lh: Letterhead,
  title: string,
  dateLine: string,
  pageWidth: number
): number {
  const top = MARGIN;
  const logoBox = 22;

  if (lh.logo) {
    const scale = Math.min(logoBox / lh.logo.w, logoBox / lh.logo.h);
    const w = lh.logo.w * scale;
    const h = lh.logo.h * scale;
    const fmt = lh.logo.data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(lh.logo.data, fmt, MARGIN, top + (logoBox - h) / 2, w, h);
  }

  // Text is centred on the page but kept clear of the logo on both sides.
  const textWidth = pageWidth - 2 * (MARGIN + logoBox + 4);
  const cx = pageWidth / 2;
  let y = top + 6;

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  const nameLines = doc.splitTextToSize(lh.name, textWidth);
  doc.text(nameLines, cx, y, { align: 'center' });
  y += nameLines.length * 6;

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  for (const line of [lh.affiliation, lh.address]) {
    if (!line) continue;
    const lines = doc.splitTextToSize(line, textWidth);
    doc.text(lines, cx, y, { align: 'center' });
    y += lines.length * 4;
  }

  y = Math.max(y, top + logoBox + 2);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 6;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text(title, cx, y, { align: 'center' });
  y += 5.5;

  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(dateLine, pageWidth - MARGIN, y, { align: 'right' });
  return y + 3;
}

const COLUMNS = (mode: CollectionPdfMode) => [
  'S.No',
  'Receipt No',
  'Learner',
  'MYJKKN ID',
  'Roll No',
  'Program',
  'Sem / Year',
  'Fee Category',
  mode === 'cash' ? 'Collected By' : 'Reference / Txn No',
  'Receipt Amount'
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const ROMAN_RE = /^(?:X{0,1}(?:IX|IV|V?I{0,3}))$/i;

/**
 * "Semester 1" / "Semester I" / "Sem-1" / "1st Semester" / "Year 2" / "II Year"
 * / "First Year" → "I", "II", … so the column can be narrow (2026-09-25).
 * Anything it cannot read is returned unchanged.
 */
export function shortSemesterLabel(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return '';
  const words: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  };
  const stripped = raw
    .replace(/\b(semester|sem|year|yr)\b\.?/gi, ' ')
    .replace(/[-_/:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "4th" → "4"; a word like "First" keeps its letters.
  const token = stripped.replace(/(\d)(st|nd|rd|th)$/i, '$1').trim();
  if (!token) return raw;
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return ROMAN[n] ?? raw;
  }
  if (ROMAN_RE.test(token)) return token.toUpperCase();
  const w = words[token.toLowerCase()];
  return w ? ROMAN[w] : raw;
}

/** Build the PDF for one payment mode; the caller saves it. */
export async function generateCollectionModePdf(opts: CollectionModePdfOptions): Promise<jsPDF> {
  const { mode, rows, dateFrom, dateTo, institutions } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const dateLine =
    dateFrom === dateTo
      ? `DATE : ${dotDate(dateFrom)}`
      : `DATE : ${dotDate(dateFrom)} TO ${dotDate(dateTo)}`;

  const byInstitution = new Map<string, CollectionDaywiseRow[]>();
  for (const r of rows) {
    const k = r.institution_name || 'Unknown Institution';
    const list = byInstitution.get(k);
    if (list) list.push(r);
    else byInstitution.set(k, [r]);
  }
  const instNames = Array.from(byInstitution.keys()).sort((a, b) => a.localeCompare(b));
  const letterheads = await Promise.all(
    instNames.map((n) => resolveLetterhead(n, institutions.get(n)))
  );

  const header = COLUMNS(mode);
  const lastCol = header.length - 1;

  instNames.forEach((instName, idx) => {
    if (idx > 0) doc.addPage();
    const startY = drawHeader(doc, letterheads[idx], MODE_TITLE[mode], dateLine, pageWidth);

    const sections = groupByDay(byInstitution.get(instName)!);
    const multiDay = sections.length > 1;
    const body: RowInput[] = [];
    let sno = 0;
    let grandCount = 0;
    let grandAmount = 0;

    for (const day of sections) {
      if (multiDay) {
        body.push([
          {
            content: `DATE : ${dotDate(day.date)}`,
            colSpan: header.length,
            styles: { fontStyle: 'bold'}
          }
        ]);
      }
      let dayAmount = 0;
      for (const r of day.rows) {
        sno += 1;
        const amount = num(r.payment_amount);
        dayAmount += amount;
        body.push([
          String(sno),
          r.receipt_number || '',
          learnerName(r),
          r.jkkn_id || '',
          r.roll_number || '',
          r.program_name || '',
          shortSemesterLabel(r.semester_name),
          r.categories || '',
          mode === 'cash' ? r.collected_by || 'System' : r.payment_reference_number || '',
          money(amount)
        ]);
      }
      body.push([
        { content: '', colSpan: 2, styles: {} },
        {
          content: `Day Total (${day.rows.length})`,
          colSpan: lastCol - 2,
          styles: { fontStyle: 'bold'}
        },
        {
          content: money(dayAmount),
          styles: { fontStyle: 'bold', halign: 'right'}
        }
      ]);
      grandCount += day.rows.length;
      grandAmount += dayAmount;
    }

    body.push([
      { content: '', colSpan: 2, styles: {} },
      {
        content: `Grand Total (${grandCount})`,
        colSpan: lastCol - 2,
        styles: { fontStyle: 'bold', fontSize: 10}
      },
      {
        content: money(grandAmount),
        styles: { fontStyle: 'bold', fontSize: 10, halign: 'right'}
      }
    ]);

    // Widths as fractions of the usable width (277mm on A4 landscape).
    const usable = pageWidth - 2 * MARGIN;
    // 2026-09-25: S.No, Roll No and Sem/Year (roman numerals) trimmed so
    // Receipt No and Reference / Txn No get the room a full number needs.
    const frac = [0.03, 0.12, 0.13, 0.065, 0.06, 0.16, 0.045, 0.14, 0.15, 0.10];

    autoTable(doc, {
      startY,
      head: [header],
      body,
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 14 },
      styles: {
        font: 'times',
        fontSize: 9,
        cellPadding: 1.5,
        lineColor: GRID,
        lineWidth: 0.25,
        textColor: [0, 0, 0],
        valign: 'middle',
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: false,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: Object.fromEntries(
        frac.map((f, i) => [
          i,
          {
            cellWidth: usable * f,
            ...(i === 0 ? { halign: 'center' as const } : {}),
            ...(i === lastCol ? { halign: 'right' as const } : {})
          }
        ])
      ),
      showHead: 'everyPage'
    });
  });

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  const generated = `Generated on ${new Date().toLocaleString('en-IN')}`;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(generated, MARGIN, pageHeight - 6);
    doc.text(`Page ${p} of ${pages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
  }

  return doc;
}
