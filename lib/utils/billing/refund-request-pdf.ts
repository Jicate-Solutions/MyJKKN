/**
 * Refund Request PDF generator.
 *
 * Turns a RefundRequest (with its bills + approval trail) into a downloadable
 * PDF — used by the refund request detail page's "Export PDF" button.
 *
 * Layout: institution letterhead (shared banner) → request header → request /
 * learner / academic / admission detail grids → bills → approval trail →
 * supporting documents → disbursement or decline block. Built with jsPDF +
 * jspdf-autotable, mirroring lib/utils/billing/receipt-pdf.ts.
 * Browser-only: doc.save() needs `document`, so this can't run in a server action.
 */

import jsPDF from 'jspdf';
import autoTable, { type CellInput, type RowInput } from 'jspdf-autotable';
import { RefundWorkflowService } from '@/lib/services/billing/refunds/refund-workflow-service';
import { drawInstitutionBanner } from '@/lib/utils/internal-marks/internal-marks-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { loadLogoDataUrl } from '@/lib/utils/pdf-export/attendance-report-pdf';
import type {
  RefundPdfInstitution,
  RefundPdfLearner,
  RefundRequest,
  RefundRequestAction
} from '@/types/billing-refund-workflow';

export interface RefundPdfContext {
  learner?: RefundPdfLearner | null;
  institution?: RefundPdfInstitution | null;
  /** Data URLs. A missing logo degrades to a text-only letterhead. */
  logos?: { left: string | null; right: string | null };
}

const FONT = 'times';
const MARGIN_X = 10; // matches drawInstitutionBanner's logo margin
const BRAND: [number, number, number] = [37, 99, 235];
const LABEL_FILL: [number, number, number] = [243, 244, 246];
const GRID_LINE: [number, number, number] = [200, 204, 210];
const MUTED: [number, number, number] = [120, 120, 120];

// jsPDF's built-in fonts (helvetica/times/courier) are WinAnsi/CP1252 only —
// the rupee sign ₹ (U+20B9) is NOT in that range and renders as garbage (same
// gotcha documented in receipt-pdf.ts / ims-receipt-pdf.ts). Format money
// with an ASCII "Rs." prefix instead of relying on Intl's ₹ glyph.
function formatINR(amount: number | null | undefined): string {
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
  return `Rs. ${value}`;
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

const ACRONYMS = new Set(['dd', 'upi', 'neft', 'rtgs', 'imps', 'utr', 'ifsc', 'id']);

/**
 * 'withdrawal_pending' → 'Withdrawal Pending', 'cheque_dd_number' → 'Cheque DD Number'.
 * Values already stored in capitals ('FIRST YEAR', 'PMS SCHOLARSHIP') are free
 * text, so they are left alone rather than mangled into 'Pms Scholarship'.
 */
function humanize(value?: string | null): string {
  const s = (value ?? '').toString().replace(/_/g, ' ').trim();
  if (!s) return '-';
  if (!/[a-z]/.test(s)) return s;
  return s
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

const text = (value?: string | number | null): string => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s || '-';
};

const ACTION_LABEL: Record<RefundRequestAction['action_type'], string> = {
  initiated: 'Initiated',
  approved: 'Approved',
  declined: 'Declined',
  disbursed: 'Disbursed',
  flow_reapplied: 'Flow Re-applied'
};

function institutionAddress(inst?: RefundPdfInstitution | null): string {
  if (!inst) return '';
  const line = [inst.address_line1, inst.address_line2, inst.address_line3, inst.city, inst.state]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const pin = (inst.pin_code ?? '').trim();
  return pin ? (line ? `${line} - ${pin}` : pin) : line;
}

interface Field {
  label: string;
  value: string;
  /** Value spans the whole row (long text such as institution or program). */
  wide?: boolean;
}

/**
 * Build (but do not save) the refund request PDF document.
 * Exported separately so callers can reuse the same layout without forcing
 * a download.
 */
export function buildRefundRequestPdf(request: RefundRequest, ctx: RefundPdfContext = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN_X * 2;
  const bottomMargin = 16; // keeps tables clear of the page footer
  const tableMargin = { left: MARGIN_X, right: MARGIN_X, bottom: bottomMargin };
  let y = MARGIN_X;

  const learner = ctx.learner ?? null;
  const institution = ctx.institution ?? null;
  const actions = [...(request.actions || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const actorOf = (type: RefundRequestAction['action_type']) =>
    actions.find((a) => a.action_type === type);

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = MARGIN_X;
    }
  };
  const afterTable = (gap = 5) => {
    y = (doc as any).lastAutoTable.finalY + gap;
  };

  // ─── 1. Letterhead ───────────────────────────────────────────────────────
  // getInstitutionHeader() falls back to the Arts & Science letterhead when it
  // has no name — never let that print on another college's document. With no
  // institution record (RLS hid it), use the group name and omit the rest.
  const branding = institution
    ? getInstitutionHeader(institution.name, institution.counselling_code)
    : null;
  y = drawInstitutionBanner(
    doc,
    {
      institution_name: (institution?.name || 'JKKN Educational Institutions').toUpperCase(),
      institution_accreditation: institution?.university_affiliation_name
        ? `(Affiliated to ${institution.university_affiliation_name})`
        : branding?.institution_accreditation,
      institution_address: institutionAddress(institution) || branding?.institution_address,
      logoImage: ctx.logos?.left || undefined,
      rightLogoImage: ctx.logos?.right || undefined
    },
    pageWidth,
    y
  );
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, pageWidth - MARGIN_X, y);
  y += 6;

  // ─── 2. Document title + request number / status ────────────────────────
  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('REFUND REQUEST', pageWidth / 2, y, { align: 'center' });
  y += 6.5;

  doc.setFontSize(10);
  doc.text(`Request No: ${request.request_number}`, MARGIN_X, y);
  doc.text(`Status: ${humanize(request.status)}`, pageWidth - MARGIN_X, y, { align: 'right' });
  y += 5;

  // ─── helpers: section bar + aligned key/value grid ──────────────────────
  // `minSpace` keeps a heading from being stranded above a single table row at
  // the foot of a page.
  const sectionTitle = (title: string, minSpace = 20) => {
    ensureSpace(minSpace);
    doc.setFillColor(...BRAND);
    doc.rect(MARGIN_X, y, contentWidth, 6, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(title.toUpperCase(), MARGIN_X + 2, y + 4.2);
    doc.setTextColor(0);
    y += 6;
  };

  const label = (content: string): CellInput => ({
    content,
    styles: { fontStyle: 'bold', fillColor: LABEL_FILL }
  });

  // Four equal-weight columns (label | value | label | value) so every block on
  // the page lines up on the same vertical grid.
  const kvSection = (title: string, fields: Field[], minSpace?: number) => {
    sectionTitle(title, minSpace);
    const body: RowInput[] = [];
    let pending: Field | null = null;
    // A field left without a partner takes the full row rather than leaving
    // two empty bordered cells.
    const full = (f: Field): RowInput => [label(f.label), { content: f.value, colSpan: 3 }];
    for (const f of fields) {
      if (f.wide) {
        if (pending) {
          body.push(full(pending));
          pending = null;
        }
        body.push(full(f));
      } else if (pending) {
        body.push([label(pending.label), pending.value, label(f.label), f.value]);
        pending = null;
      } else {
        pending = f;
      }
    }
    if (pending) body.push(full(pending));

    autoTable(doc, {
      startY: y,
      margin: tableMargin,
      theme: 'grid',
      styles: {
        font: FONT,
        fontSize: 9,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        lineColor: GRID_LINE,
        lineWidth: 0.2,
        textColor: 20,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 34 },
        1: { cellWidth: 61 },
        2: { cellWidth: 34 },
        3: { cellWidth: 61 }
      },
      body
    });
    afterTable();
  };

  // ─── 3. Request details ─────────────────────────────────────────────────
  const initiated = actorOf('initiated');
  kvSection('Request Details', [
    { label: 'Refund Type', value: humanize(request.refund_type) },
    { label: 'Total Refund', value: formatINR(request.total_refund_amount) },
    { label: 'Initiated On', value: formatDateTime(request.initiated_at) },
    {
      label: 'Initiated By',
      value: initiated?.actor?.full_name
        ? `${initiated.actor.full_name}${initiated.actor_role_name ? ` (${initiated.actor_role_name})` : ''}`
        : '-'
    }
  ]);

  // ─── 4. Academic details (learner identity + academic placement) ────────
  const studentName =
    `${learner?.first_name || request.student?.first_name || ''} ${learner?.last_name || request.student?.last_name || ''}`.trim();
  kvSection('Academic Details', [
    { label: 'Learner Name', value: text(studentName) },
    { label: 'Application ID', value: text(learner?.application_id) },
    { label: 'Mobile', value: text(learner?.student_mobile) },
    { label: 'Current Status', value: humanize(learner?.lifecycle_status ?? request.student?.lifecycle_status) },
    { label: 'Institution', value: text(institution?.name), wide: true },
    { label: 'Degree', value: text(learner?.degree?.degree_name || learner?.degree?.display_name) },
    { label: 'Program', value: text(learner?.program?.program_name || learner?.program?.display_name) },
    { label: 'Department', value: text(learner?.department?.department_name || learner?.department?.display_name) },
    { label: 'Regulation', value: text(learner?.regulation?.regulation_code) },
    { label: 'Academic Year', value: text(learner?.academic_year?.academic_year_name) },
    { label: 'Batch', value: text(learner?.batch?.batch_name || learner?.batch?.batch_code) },
    { label: 'Semester', value: text(learner?.semester?.semester_name) },
    { label: 'Section', value: text(learner?.section?.section_name) }
  ]);

  // ─── 5. Bills ───────────────────────────────────────────────────────────
  const bills = request.bills || [];
  const paidTotal = bills.reduce((s, b) => s + (Number(b.paid_amount_snapshot) || 0), 0);
  const right = (content: string): CellInput => ({ content, styles: { halign: 'right' } });
  sectionTitle('Bills');
  autoTable(doc, {
    startY: y,
    margin: tableMargin,
    theme: 'grid',
    head: [[
      { content: 'S.No', styles: { halign: 'center' } },
      'Bill Description',
      right('Amount Paid'),
      right('Refund Amount')
    ]],
    headStyles: { fillColor: LABEL_FILL, textColor: 20, fontStyle: 'bold' },
    styles: {
      font: FONT,
      fontSize: 9,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      lineColor: GRID_LINE,
      lineWidth: 0.2,
      textColor: 20,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 38, halign: 'right' }
    },
    body: bills.length
      ? bills.map((b, i) => [
          String(i + 1),
          b.bill?.bill_description || 'Bill',
          formatINR(b.paid_amount_snapshot),
          formatINR(b.refund_amount)
        ])
      : [[{ content: 'No bills on this request.', colSpan: 4, styles: { halign: 'center', textColor: MUTED } }]],
    foot: [[
      { content: 'Total', colSpan: 2, styles: { halign: 'right' } },
      right(formatINR(paidTotal)),
      right(formatINR(request.total_refund_amount))
    ]],
    footStyles: { fillColor: LABEL_FILL, textColor: 20, fontStyle: 'bold' }
  });
  afterTable(6);

  // ─── 6. Approval trail ──────────────────────────────────────────────────
  const pendingStages = request.status === 'pending_review'
    ? (request.flow_snapshot?.stages ?? []).slice(request.current_stage_index)
    : [];
  const showDisbursementTail = request.status === 'pending_review' || request.status === 'pending_disbursement';
  const pendingCell = (content: string): CellInput => ({ content, styles: { textColor: MUTED } });

  const trailRows: RowInput[] = actions.map((a, i) => [
    String(i + 1),
    a.stage_name,
    ACTION_LABEL[a.action_type] ?? humanize(a.action_type),
    a.actor?.full_name
      ? `${a.actor.full_name}${a.actor_role_name ? `\n(${a.actor_role_name})` : ''}`
      : '-',
    formatDateTime(a.created_at),
    a.notes?.trim() || '-'
  ]);
  const pendingRow = (name: string): RowInput => [
    '', pendingCell(name), pendingCell('Pending'), pendingCell('-'), pendingCell('-'), pendingCell('-')
  ];
  pendingStages.forEach((s) => trailRows.push(pendingRow(s.name)));
  if (showDisbursementTail) trailRows.push(pendingRow('Disbursement'));

  sectionTitle('Approval Trail', 50);
  autoTable(doc, {
    startY: y,
    margin: tableMargin,
    theme: 'grid',
    head: [[{ content: 'S.No', styles: { halign: 'center' } }, 'Stage', 'Action', 'By', 'Date & Time', 'Remarks']],
    headStyles: { fillColor: LABEL_FILL, textColor: 20, fontStyle: 'bold' },
    styles: {
      font: FONT,
      fontSize: 8.5,
      cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
      lineColor: GRID_LINE,
      lineWidth: 0.2,
      textColor: 20,
      valign: 'top'
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 22 },
      3: { cellWidth: 40 },
      4: { cellWidth: 34 },
      5: { cellWidth: 'auto' }
    },
    body: trailRows.length
      ? trailRows
      : [[{ content: 'No actions recorded.', colSpan: 6, styles: { halign: 'center', textColor: MUTED } }]]
  });
  afterTable(6);

  // ─── 7. Supporting documents (names are clickable links) ────────────────
  const docs = actions.flatMap((a) =>
    (a.attachments ?? []).map((att) => ({
      stage: a.stage_name,
      action: ACTION_LABEL[a.action_type] ?? humanize(a.action_type),
      name: att.name,
      url: att.drive_url
    }))
  );
  if (docs.length > 0) {
    sectionTitle('Supporting Documents');
    autoTable(doc, {
      startY: y,
      margin: tableMargin,
      theme: 'grid',
      head: [[{ content: 'S.No', styles: { halign: 'center' } }, 'Stage', 'Action', 'Document']],
      headStyles: { fillColor: LABEL_FILL, textColor: 20, fontStyle: 'bold' },
      styles: {
        font: FONT,
        fontSize: 8.5,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        lineColor: GRID_LINE,
        lineWidth: 0.2,
        textColor: 20,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 40 },
        2: { cellWidth: 26 },
        3: { cellWidth: 'auto' }
      },
      body: docs.map((d, i) => [String(i + 1), d.stage, d.action, d.name]),
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) data.cell.styles.textColor = BRAND;
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const url = docs[data.row.index]?.url;
          if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
        }
      }
    });
    afterTable(6);
  }

  // ─── 8. Disbursement (only when disbursed) ─────────────────────────────
  if (request.status === 'disbursed') {
    const disbursed = actorOf('disbursed');
    const fields: Field[] = [
      { label: 'Payment Mode', value: humanize(request.payment_mode) },
      { label: 'Disbursed On', value: formatDateTime(request.disbursed_at) },
      {
        label: 'Disbursed By',
        value: disbursed?.actor?.full_name
          ? `${disbursed.actor.full_name}${disbursed.actor_role_name ? ` (${disbursed.actor_role_name})` : ''}`
          : '-',
        wide: true
      }
    ];
    Object.entries(request.payment_details || {}).forEach(([k, v]) => {
      fields.push({ label: humanize(k), value: text(v as string | number | null) });
    });
    kvSection('Disbursement', fields, 50);
  }

  // ─── 9. Decline (only when declined) ───────────────────────────────────
  if (request.status === 'declined') {
    const declined = actorOf('declined');
    kvSection('Decline', [
      { label: 'Declined Stage', value: text(request.declined_stage_name) },
      { label: 'Declined On', value: formatDateTime(request.declined_at) },
      { label: 'Declined By', value: text(declined?.actor?.full_name), wide: true },
      { label: 'Reason', value: text(request.decline_reason), wide: true }
    ]);
  }

  // ─── Footer on every page ───────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, MARGIN_X, pageHeight - 6);
    doc.text(request.request_number, pageWidth / 2, pageHeight - 6, { align: 'center' });
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN_X, pageHeight - 6, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
}

/**
 * Fetch the learner / institution context and logos, then generate the refund
 * request PDF and trigger a browser download.
 */
export async function generateRefundRequestPdf(request: RefundRequest): Promise<void> {
  const { learner, institution } = await RefundWorkflowService.getPdfContext(
    request.student_id,
    request.institution_id
  );

  // Same logo sourcing as the attendance / internal-marks reports: trust mark on
  // the left, the college's own mark on the right.
  const branding = institution
    ? getInstitutionHeader(institution.name, institution.counselling_code)
    : null;
  const [left, right] = await Promise.all([
    loadLogoDataUrl(branding?.logoImage || '/logo.png'),
    loadLogoDataUrl(institution?.logo_url || branding?.rightLogoImage)
  ]);

  const doc = buildRefundRequestPdf(request, { learner, institution, logos: { left, right } });
  doc.save(`${request.request_number}.pdf`);
}
