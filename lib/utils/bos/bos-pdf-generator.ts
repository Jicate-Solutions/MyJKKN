import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BosMeeting, BosMember, BosAgendaItem, BosMeetingAttendee } from '@/types/bos';

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 10;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Institution header data ───────────────────────────────────────────────────
export interface BosPdfOfficials {
  secretary_name: string;
  principal_name: string;
  contact_cell?: string;
  contact_web?: string;
  contact_email?: string;
}

export interface BosPdfHeader {
  institution_name: string;
  institution_accreditation?: string;
  institution_address?: string;
  logoImage?: string;
  rightLogoImage?: string;
  /** Letterhead-style officials line rendered below the institutional banner. */
  officials?: BosPdfOfficials;
}

// ── Shared drawing helpers ────────────────────────────────────────────────────

function detectImageFormat(src: string): string {
  if (/^data:image\/jpe?g/i.test(src)) return 'JPEG';
  if (/^data:image\/webp/i.test(src)) return 'WEBP';
  return 'PNG';
}

function drawBanner(doc: jsPDF, header: BosPdfHeader, pageWidth: number, y: number): number {
  const logoSize = 18;
  if (header.logoImage) {
    try { doc.addImage(header.logoImage, detectImageFormat(header.logoImage), MARGIN, y, logoSize, logoSize); } catch {}
  }
  if (header.rightLogoImage) {
    try { doc.addImage(header.rightLogoImage, detectImageFormat(header.rightLogoImage), pageWidth - MARGIN - logoSize, y, logoSize, logoSize); } catch {}
  }
  const hasExtra = !!(header.institution_accreditation || header.institution_address);
  const nameY = hasExtra ? y + 4 : y + 9;
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(header.institution_name, pageWidth / 2, nameY, { align: 'center' });
  if (header.institution_accreditation) {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.text(header.institution_accreditation, pageWidth / 2, y + 9.5, { align: 'center' });
  }
  if (header.institution_address) {
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.text(header.institution_address, pageWidth / 2, y + 14.5, { align: 'center' });
  }
  return y + logoSize + (header.institution_address ? 6 : 2);
}

function divider(doc: jsPDF, y: number): number {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 5;
}

// Letterhead-style officials block: Secretary on the left, Principal (with
// credentials and contact info) on the right. Sits between the institutional
// banner and the divider line on every BoS PDF.
function drawOfficials(doc: jsPDF, officials: BosPdfOfficials, y: number): number {
  const leftX = MARGIN;
  const rightX = PAGE_W - MARGIN;
  const lineGap = 4;

  // Left: Secretary name (bold) + role on the next line.
  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(officials.secretary_name, leftX, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('Secretary', leftX, y + lineGap + 0.5);
  const leftBottom = y + lineGap + 0.5;

  // Right: Principal title line, then cell, then web + email — right-aligned.
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(officials.principal_name, rightX, y, { align: 'right' });

  let rightY = y + lineGap + 0.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  if (officials.contact_cell) {
    doc.text(`Cell: ${officials.contact_cell}`, rightX, rightY, { align: 'right' });
    rightY += lineGap;
  }
  if (officials.contact_web || officials.contact_email) {
    const parts: string[] = [];
    if (officials.contact_web) parts.push(`Web: ${officials.contact_web}`);
    if (officials.contact_email) parts.push(`E-Mail: ${officials.contact_email}`);
    doc.text(parts.join('   '), rightX, rightY, { align: 'right' });
    rightY += lineGap;
  }

  return Math.max(leftBottom, rightY) + 2;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function lastAutoY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

function detailsTable(doc: jsPDF, rows: [string, string][], startY: number): number {
  const labelW = 48;
  autoTable(doc, {
    body: rows,
    startY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
    styles: {
      font: 'times', fontSize: 10, cellPadding: 2.5,
      lineColor: [0, 0, 0], lineWidth: 0.3,
      textColor: [0, 0, 0], valign: 'middle', minCellHeight: 7, overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: labelW, fontStyle: 'bold', fillColor: [245, 245, 245] },
      1: { cellWidth: CONTENT_W - labelW },
    },
  });
  return lastAutoY(doc, startY + rows.length * 8) + 6;
}

function sigRow(doc: jsPDF, y: number, labels: string[][]): void {
  const sigW = CONTENT_W / labels.length;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  labels.forEach((lines, i) => {
    const cx = MARGIN + i * sigW + sigW / 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(MARGIN + i * sigW + 8, y, MARGIN + (i + 1) * sigW - 8, y);
    lines.forEach((ln, li) => doc.text(ln, cx, y + 5 + li * 4.5, { align: 'center' }));
  });
}

function timestamp(doc: jsPDF): void {
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(new Date().toLocaleString('en-IN'), MARGIN, PAGE_H - 5);
  doc.setTextColor(0, 0, 0);
}

// ── 1. Meeting Notice ─────────────────────────────────────────────────────────

export interface MeetingNoticeParams {
  header: BosPdfHeader;
  principalName?: string;
  meeting: BosMeeting;
  agendaItems: BosAgendaItem[];
  chairmanName: string;
  /** @deprecated pass header instead */
  collegeName?: string;
}

// Shared builder — produces an in-memory jsPDF doc. Both the browser
// "save as PDF" wrapper and the server "produce a Buffer for email attach"
// helper call this so the rendered output is byte-identical.
export function buildMeetingNoticeDoc({
  header,
  principalName = 'Principal',
  meeting,
  agendaItems,
  chairmanName,
}: MeetingNoticeParams): jsPDF {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = drawBanner(doc, header, PAGE_W, MARGIN);
  if (header.officials) y = drawOfficials(doc, header.officials, y);
  y = divider(doc, y);

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('NOTICE OF BOARD OF STUDIES MEETING', PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // Ref + Date
  const ref = `Ref: BoS/${meeting.academic_year}/${meeting.meeting_number}`;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(ref, MARGIN, y);
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;

  // Meeting details
  y = detailsTable(doc, [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Meeting Type', titleCase(meeting.meeting_type ?? '')],
    ['Date', fmtDate(meeting.scheduled_date)],
    ['Time', fmtTime(meeting.scheduled_time)],
    ['Venue', meeting.venue ?? '—'],
    ['Chairman', chairmanName],
  ], y);

  // Intro paragraph
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  const intro = `All members of the Board of Studies are hereby informed that the ${titleCase(meeting.meeting_type ?? '')} Meeting of the Board of Studies will be held as per the details mentioned above. Your presence is solicited.`;
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, MARGIN, y);
  y += introLines.length * 5.5 + 6;

  // Agenda
  if (agendaItems.length > 0) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('AGENDA', MARGIN, y);
    y += 4;

    autoTable(doc, {
      head: [['No.', 'Agenda Item', 'Description']],
      body: [...agendaItems]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => [item.item_number, item.item_title, item.item_description ?? '']),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      theme: 'grid',
      styles: {
        font: 'times', fontSize: 9, cellPadding: 2.5,
        lineColor: [0, 0, 0], lineWidth: 0.3,
        textColor: [0, 0, 0], valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        font: 'times', fontStyle: 'bold',
        fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: CONTENT_W - 77 },
      },
    });
    y = lastAutoY(doc, y + 30) + 10;
  } else if (meeting.agenda_text) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('AGENDA', MARGIN, y);
    y += 5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const agendaLines = doc.splitTextToSize(meeting.agenda_text, CONTENT_W);
    doc.text(agendaLines, MARGIN, y);
    y += agendaLines.length * 5 + 10;
  }

  if (y + 20 > PAGE_H - 15) { doc.addPage(); y = MARGIN + 10; }

  // Signature (right-aligned, Principal)
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(principalName, PAGE_W - MARGIN, y, { align: 'right' });
  doc.text('Principal', PAGE_W - MARGIN, y + 5, { align: 'right' });

  timestamp(doc);
  return doc;
}

// Browser entry point — kicks off a download via the user's File Save dialog.
export function generateMeetingNoticePdf(params: MeetingNoticeParams): void {
  const doc = buildMeetingNoticeDoc(params);
  doc.save(`meeting-notice-${params.meeting.meeting_number}-${params.meeting.academic_year}.pdf`);
}

// Server entry point — produces a Buffer suitable for email attachment etc.
export function buildMeetingNoticePdfBuffer(params: MeetingNoticeParams): Buffer {
  const doc = buildMeetingNoticeDoc(params);
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// ── 2. Minutes of Meeting ─────────────────────────────────────────────────────

export interface MinutesParams {
  header: BosPdfHeader;
  meeting: BosMeeting;
  attendees: BosMeetingAttendee[];
  agendaItems: BosAgendaItem[];
  chairmanName: string;
  /** @deprecated pass header instead */
  collegeName?: string;
}

export function generateMinutesPdf({
  header,
  meeting,
  attendees,
  agendaItems,
  chairmanName,
}: MinutesParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = drawBanner(doc, header, PAGE_W, MARGIN);
  if (header.officials) y = drawOfficials(doc, header.officials, y);
  y = divider(doc, y);

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('MINUTES OF BOARD OF STUDIES MEETING', PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // Meeting details
  y = detailsTable(doc, [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date', fmtDate(meeting.actual_date ?? meeting.scheduled_date)],
    ['Start Time', fmtTime(meeting.actual_start_time ?? meeting.scheduled_time)],
    ['End Time', fmtTime(meeting.actual_end_time)],
    ['Venue', meeting.venue ?? '—'],
    ['Chairman', chairmanName],
    ['Quorum', meeting.quorum_met ? 'Met' : 'Not Met'],
  ], y);

  // Attendance
  const present = attendees.filter((a) => a.attendance_status === 'present');
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(`ATTENDANCE  (${present.length} Present / ${attendees.length} Total)`, MARGIN, y);
  y += 4;

  autoTable(doc, {
    head: [['S.No', 'Name', 'Designation', 'Status']],
    body: attendees.map((a, i) => [
      i + 1,
      (a as any).member?.display_name ?? '—',
      (a as any).member?.display_designation ?? '',
      a.attendance_status === 'present' ? 'Present' : 'Absent',
    ]),
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
    styles: {
      font: 'times', fontSize: 9, cellPadding: 2.5,
      lineColor: [0, 0, 0], lineWidth: 0.3,
      textColor: [0, 0, 0], valign: 'middle', overflow: 'linebreak',
    },
    headStyles: {
      font: 'times', fontStyle: 'bold',
      fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 65 },
      3: { cellWidth: 22, halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 3) {
        const v = data.cell.raw as string;
        data.cell.styles.textColor = v === 'Present' ? [0, 120, 0] : [180, 0, 0];
      }
    },
  });
  y = lastAutoY(doc, y + 30) + 8;

  // Agenda & Resolutions
  if (agendaItems.length > 0) {
    if (y > 240) { doc.addPage(); y = MARGIN; }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('AGENDA ITEMS & RESOLUTIONS', MARGIN, y);
    y += 5;

    for (const item of [...agendaItems].sort((a, b) => a.sort_order - b.sort_order)) {
      if (y > 260) { doc.addPage(); y = MARGIN; }
      doc.setFont('times', 'bold');
      doc.setFontSize(9);
      const titleLines = doc.splitTextToSize(`${item.item_number}. ${item.item_title}`, CONTENT_W);
      doc.text(titleLines, MARGIN, y);
      y += titleLines.length * 5 + 2;

      if (item.discussion_notes) {
        if (y > 265) { doc.addPage(); y = MARGIN; }
        doc.setFont('times', 'italic');
        const notes = doc.splitTextToSize(`Discussion: ${item.discussion_notes}`, CONTENT_W - 6);
        doc.text(notes, MARGIN + 4, y);
        y += notes.length * 5 + 2;
      }
      if (item.resolution_text) {
        if (y > 265) { doc.addPage(); y = MARGIN; }
        doc.setFont('times', 'normal');
        const res = doc.splitTextToSize(`Resolution: ${item.resolution_text}`, CONTENT_W - 6);
        doc.text(res, MARGIN + 4, y);
        y += res.length * 5 + 4;
      }
    }
  }

  if (meeting.minutes_summary) {
    if (y > 250) { doc.addPage(); y = MARGIN; }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('SUMMARY', MARGIN, y);
    y += 5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(meeting.minutes_summary, CONTENT_W);
    doc.text(summaryLines, MARGIN, y);
    y += summaryLines.length * 5 + 8;
  }

  if (y + 22 > PAGE_H - 12) { doc.addPage(); y = MARGIN + 10; }

  sigRow(doc, y, [
    ['Signature of the Subject In-Charge'],
    ['Signature of the HOD'],
    ['Signature of the Principal'],
  ]);

  timestamp(doc);
  doc.save(`minutes-meeting-${meeting.meeting_number}-${meeting.academic_year}.pdf`);
}

// ── 3. Call Letter for External Expert ───────────────────────────────────────

export interface CallLetterParams {
  header: BosPdfHeader;
  principalName?: string;
  meeting: BosMeeting;
  agendaItems: BosAgendaItem[];
  expert: BosMember;
  chairmanName: string;
  /** @deprecated pass header instead */
  collegeName?: string;
}

export function generateCallLetterPdf({
  header,
  principalName = 'Principal',
  meeting,
  agendaItems,
  expert,
}: CallLetterParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = drawBanner(doc, header, PAGE_W, MARGIN);
  if (header.officials) y = drawOfficials(doc, header.officials, y);
  y = divider(doc, y);

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('INVITATION / CALL LETTER', PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // Ref + Date
  const ref = `Ref: BoS/${meeting.academic_year}/${meeting.meeting_number}/${expert.id.slice(0, 6).toUpperCase()}`;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(ref, MARGIN, y);
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // Addressee block
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('To,', MARGIN, y); y += 5;
  doc.setFont('times', 'normal');
  doc.text(expert.display_name, MARGIN, y); y += 5;
  if (expert.display_designation) { doc.text(expert.display_designation, MARGIN, y); y += 5; }
  if (expert.display_institution) { doc.text(expert.display_institution, MARGIN, y); y += 5; }
  if (expert.address) {
    const addrLines = doc.splitTextToSize(expert.address, 90);
    doc.text(addrLines, MARGIN, y); y += addrLines.length * 5;
  }
  y += 4;

  // Salutation
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  const salutation = `Dear ${expert.display_designation ? expert.display_designation + ' ' : ''}${expert.display_name},`;
  doc.text(salutation, MARGIN, y);
  y += 7;

  // Body
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  const body = `We are pleased to invite you to attend the ${titleCase(meeting.meeting_type ?? '')} Meeting of the Board of Studies scheduled as follows:`;
  const bodyLines = doc.splitTextToSize(body, CONTENT_W);
  doc.text(bodyLines, MARGIN, y);
  y += bodyLines.length * 5.5 + 5;

  // Meeting details
  y = detailsTable(doc, [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date', fmtDate(meeting.scheduled_date)],
    ['Time', fmtTime(meeting.scheduled_time)],
    ['Venue', meeting.venue ?? '—'],
  ], y);

  // Agenda summary
  if (agendaItems.length > 0) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text('The agenda for this meeting includes:', MARGIN, y);
    y += 5;
    for (const item of [...agendaItems].sort((a, b) => a.sort_order - b.sort_order)) {
      if (y > 260) { doc.addPage(); y = MARGIN; }
      const line = doc.splitTextToSize(`${item.item_number}. ${item.item_title}`, CONTENT_W - 6);
      doc.text(line, MARGIN + 4, y);
      y += line.length * 5 + 1;
    }
    y += 4;
  }

  // TA/DA note
  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  doc.text('Travelling Allowance and Daily Allowance will be provided as per the norms.', MARGIN, y);
  y += 8;

  // Closing
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('Kindly confirm your attendance at the earliest.', MARGIN, y);
  y += 7;
  doc.text('Yours sincerely,', MARGIN, y);
  y += 12;
  doc.setFont('times', 'bold');
  doc.text(principalName, MARGIN, y);
  y += 5;
  doc.setFont('times', 'normal');
  doc.text('Principal', MARGIN, y);

  timestamp(doc);
  doc.save(`call-letter-${expert.display_name.replace(/\s+/g, '-')}-meeting-${meeting.meeting_number}.pdf`);
}
