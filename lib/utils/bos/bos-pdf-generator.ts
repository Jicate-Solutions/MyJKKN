import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BosMeeting, BosMember, BosAgendaItem, BosMeetingAttendee, BosMemberType } from '@/types/bos';
import { stripHtml } from '@/components/ui/rich-text-editor';
import {
  drawCetLetterhead,
  isCetInstitution,
} from '@/lib/utils/internal-marks/internal-marks-pdf';

// Canonical order in which BoS members appear in attendance / signature
// blocks. Per the academic protocol JKKN follows, the chairman leads, then
// the externally-nominated experts in order of statutory weight, then the
// internal "board members" (and a long tail of fringe roles after). Any
// member_type not listed here sorts to the end via fallback rank 99.
const MEMBER_TYPE_ORDER: Record<BosMemberType, number> = {
  chairman: 1,
  university_nominee: 2,
  subject_expert: 3,
  academic_expert: 4,
  industry_expert: 5,
  alumni: 6,
  internal_member: 7,
  faculty_member: 7,
  hod: 8,
  startup: 9,
  facilitator: 10,
  principal: 11,
  member_secretary: 12,
  student: 13,
};

function memberTypeRank(t: string | null | undefined): number {
  if (!t) return 99;
  // Catalog-name values (20260710150000) aren't in the enum map — rank 99.
  return (MEMBER_TYPE_ORDER as Record<string, number>)[t] ?? 99;
}

// Sort attendees by member-type rank first, then by the existing per-member
// sort_order, then by display name — so two members of the same type appear
// in the same order users see them in the Members tab. Returns a new array;
// the input is left untouched (PDF generation should never mutate its caller's
// data).
function sortAttendeesForPdf(
  attendees: BosMeetingAttendee[],
): BosMeetingAttendee[] {
  type AttendeeMember = {
    member_type?: BosMemberType | null;
    sort_order?: number | null;
    display_name?: string | null;
  };
  const memberOf = (a: BosMeetingAttendee): AttendeeMember =>
    ((a as unknown as { member?: AttendeeMember }).member) ?? {};
  return [...attendees].sort((a, b) => {
    const ma = memberOf(a);
    const mb = memberOf(b);
    const rankDiff = memberTypeRank(ma.member_type) - memberTypeRank(mb.member_type);
    if (rankDiff !== 0) return rankDiff;
    const soDiff = (ma.sort_order ?? 0) - (mb.sort_order ?? 0);
    if (soDiff !== 0) return soDiff;
    return (ma.display_name ?? '').localeCompare(mb.display_name ?? '');
  });
}

// Normalize the multi-select shape used by changes_log rows for topic and
// sub_topic. The editor stores arrays now but legacy rows may still hold a
// single string. Mirrors asTopicArray() in minutes-tab.tsx — duplicated here
// so the PDF generator doesn't pull a React file into its module graph.
function asArray(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v];
}

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
  /**
   * Bottom-left circular college seal (base64 data URL). Mirrors the call
   * letter PDF — when present the meeting-notice signature block uses
   * seal + signature image; when absent it falls back to the text-only
   * "Principal" line so engineering institutions (no seal asset) still
   * render cleanly.
   */
  sealImage?: string;
  /**
   * Bottom-right principal signature PNG (signature + "PRINCIPAL" + college
   * line baked-in). Loaded as base64 data URL by the caller.
   */
  signImage?: string;
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

// Member-by-member signature grid. Renders one signature box per board member
// who attended, laid out in a wrapping grid (3 per row). Each box has a thin
// signature line on top + the member's display_name + designation underneath.
// Pagination: starts a new page if the next row would overflow the page
// bottom, so a 14-member board (≈5 rows) doesn't run off the edge silently.
//
// Returns the new y after the last rendered row so the caller can continue
// laying out content below if needed (e.g. timestamp).
function memberSignatureGrid(
  doc: jsPDF,
  startY: number,
  members: Array<{ name: string; designation?: string }>,
  perRow = 3,
): number {
  if (members.length === 0) return startY;

  const colW = CONTENT_W / perRow;
  const rowH = 22; // signature space (8) + name (5) + designation (5) + padding (4)
  const lineInset = 8; // how far the signature underline sits inside the column

  let y = startY + 6;

  // Section header
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('SIGNATURES OF BOARD MEMBERS', MARGIN, y);
  y += 8;

  doc.setFont('times', 'normal');
  doc.setFontSize(8);

  for (let i = 0; i < members.length; i++) {
    const colIdx = i % perRow;

    // Wrap to next row when we fill the current one — and start a fresh page
    // if the next row would overflow the bottom margin.
    if (colIdx === 0 && i > 0) {
      y += rowH;
      if (y + rowH > PAGE_H - 18) {
        doc.addPage();
        y = MARGIN + 6;
      }
    }
    // Defensive: if the very first row of the grid won't fit, page-break.
    if (i === 0 && y + rowH > PAGE_H - 18) {
      doc.addPage();
      y = MARGIN + 6;
      // Re-print the section header on the new page so context isn't lost.
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.text('SIGNATURES OF BOARD MEMBERS (cont.)', MARGIN, y);
      y += 8;
      doc.setFont('times', 'normal');
      doc.setFontSize(8);
    }

    const colX = MARGIN + colIdx * colW;
    const cx = colX + colW / 2;

    // Signature line (top of the box, leaves ~8mm of empty space above name)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(colX + lineInset, y + 8, colX + colW - lineInset, y + 8);

    // Member name (immediately below the signature line)
    const nameLines = doc.splitTextToSize(
      members[i].name || '—',
      colW - lineInset * 2,
    );
    doc.text(nameLines[0] ?? '', cx, y + 12, { align: 'center' });

    // Designation (one more line below, lighter)
    if (members[i].designation) {
      doc.setTextColor(80, 80, 80);
      const desigLines = doc.splitTextToSize(
        members[i].designation ?? '',
        colW - lineInset * 2,
      );
      doc.text(desigLines[0] ?? '', cx, y + 16, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  }

  return y + rowH;
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

  // The engineering college's BoS paperwork goes out on its own printed
  // stationery — green "J.K.K.NATTRAJA … & TECHNOLOGY", "( An Autonomous
  // Institution )", magenta trust/AICTE/NAAC/address lines, closed by a pink
  // double rule. The minutes, the call letter and the TA/DA claim form already
  // render it; the notice was still printing the plain black banner, so the
  // same member received documents disagreeing about the college's own name.
  // That renderer draws its own rule and carries the approvals inline, so the
  // officials row + black divider are skipped for CET. Every other institution
  // keeps the generic banner unchanged.
  const cet = isCetInstitution(header.institution_name);
  let y = cet
    ? drawCetLetterhead(doc, header, PAGE_W, MARGIN)
    : drawBanner(doc, header, PAGE_W, MARGIN);
  if (!cet) {
    if (header.officials) y = drawOfficials(doc, header.officials, y);
    y = divider(doc, y);
  }

  // Title — enhanced for better visual hierarchy
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('NOTICE OF BOARD OF STUDIES MEETING', PAGE_W / 2, y, { align: 'center' });
  y += 8;

  // Ref + Date with better spacing
  const ref = `Ref: BoS/${meeting.academic_year}/${meeting.meeting_number}`;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(ref, MARGIN, y);
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // Meeting details — improved layout with better spacing
  y = detailsTable(doc, [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Meeting Type', titleCase(meeting.meeting_type ?? '')],
    ['Scheduled Date', fmtDate(meeting.scheduled_date)],
    ['Time', fmtTime(meeting.scheduled_time)],
    ['Venue', meeting.venue ?? '—'],
    ['Chairman', chairmanName],
  ], y);

  // Intro paragraph — larger, more readable font
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const intro = `All members of the Board of Studies are hereby informed that the ${titleCase(meeting.meeting_type ?? '')} Meeting of the Board of Studies will be held as per the details mentioned above. Your presence is solicited.`;
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, MARGIN, y);
  y += introLines.length * 5.5 + 8;

  // Agenda section header — enhanced typography
  if (agendaItems.length > 0 || meeting.agenda_text) {
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.text('AGENDA', MARGIN, y);
    y += 6;
  }

  // Agenda items table
  if (agendaItems.length > 0) {
    autoTable(doc, {
      head: [['No.', 'Agenda Item', 'Description']],
      body: [...agendaItems]
        .sort((a, b) => a.sort_order - b.sort_order)
        // item_description is rich-text HTML — flatten to plain text for the
        // jsPDF table cell (jsPDF can't render markup). stripHtml already
        // imported above.
        .map((item) => [item.item_number, item.item_title, stripHtml(item.item_description ?? '')]),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      theme: 'grid',
      styles: {
        font: 'times', fontSize: 10, cellPadding: 3,
        lineColor: [0, 0, 0], lineWidth: 0.3,
        textColor: [0, 0, 0], valign: 'middle', overflow: 'linebreak',
      },
      headStyles: {
        font: 'times', fontStyle: 'bold',
        fillColor: [211, 211, 211], textColor: [0, 0, 0], halign: 'center', fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 68 },
        2: { cellWidth: CONTENT_W - 82 },
      },
    });
    y = lastAutoY(doc, y + 30) + 10;
  } else if (meeting.agenda_text) {
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const agendaLines = doc.splitTextToSize(meeting.agenda_text, CONTENT_W);
    doc.text(agendaLines, MARGIN, y);
    y += agendaLines.length * 5.5 + 10;
  }

  // ── Signature block ─────────────────────────────────────────────────────
  // Two layouts:
  //   • Assets present (Arts/Science): seal image (left) + signature PNG (right),
  //     matching the call-letter PDF the user referenced. The sign PNG already
  //     has "PRINCIPAL" baked into the artwork, so no extra text line is needed.
  //   • No assets (Engineering etc.): fall back to text-only "Principal" line.
  const hasSignatureAssets = !!(header.sealImage || header.signImage);
  const signatureBlockHeight = hasSignatureAssets ? 38 : 14;
  if (y + signatureBlockHeight > PAGE_H - 18) { doc.addPage(); y = MARGIN + 10; }

  if (hasSignatureAssets) {
    const sealSize = 32;
    const signWidth = 60;
    const signHeight = 28;
    if (header.sealImage) {
      try {
        doc.addImage(header.sealImage, detectImageFormat(header.sealImage), MARGIN, y, sealSize, sealSize);
      } catch {
        // If the embedded asset can't be decoded, silently drop it — the
        // signature side still renders independently so the doc isn't lost.
      }
    }
    if (header.signImage) {
      try {
        doc.addImage(
          header.signImage,
          detectImageFormat(header.signImage),
          PAGE_W - MARGIN - signWidth,
          y + (sealSize - signHeight) / 2, // visually baseline-align with the seal
          signWidth,
          signHeight,
        );
      } catch {
        // Same defensive fallback — if the sign asset is unreadable we still
        // want the seal (if present) and the doc to be downloadable.
      }
    }
  } else {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.text(principalName, PAGE_W - MARGIN, y, { align: 'right' });
    doc.text('Principal', PAGE_W - MARGIN, y + 6, { align: 'right' });
  }

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
  /**
   * Board display name (e.g. "Computer Science"). Used to compose the page-1
   * attendance-sheet heading "<BOARD_TYPE> - <BOARD_NAME> ATTENDANCE SHEET"
   * (e.g. "UG - COMPUTER SCIENCE ATTENDANCE SHEET"). When absent, the heading
   * falls back to "ATTENDANCE SHEET" alone so the doc still renders cleanly
   * for older callers that don't pass it.
   */
  boardName?: string;
  /** @deprecated pass header instead */
  collegeName?: string;
}

// ── Page 1: standalone Attendance Sheet ──────────────────────────────────────
// Rendered before the rest of the minutes content. Mirrors the existing
// banner+officials letterhead, adds a centered heading and a wide attendance
// table with a blank Signature column for members to physically sign on the
// printed copy. Column widths and minCellHeight are tuned so the signature
// cell has enough horizontal AND vertical room for a real signature.
function drawAttendanceSheet(
  doc: jsPDF,
  header: BosPdfHeader,
  meeting: BosMeeting,
  rawAttendees: BosMeetingAttendee[],
  boardName: string | undefined,
): void {
  // Sort up-front so the printed roster follows the canonical
  // chairman → external experts → internal members → tail ordering.
  const attendees = sortAttendeesForPdf(rawAttendees);
  let y = drawBanner(doc, header, PAGE_W, MARGIN);
  if (header.officials) y = drawOfficials(doc, header.officials, y);
  y = divider(doc, y);

  // Heading — always "ATTENDANCE SHEET" (centered). The board identity moves
  // to a left-aligned "Name of the board:" line directly below the heading so
  // the title stays consistent across boards and the identifier becomes a
  // labeled row instead of a prefix on the title.
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('ATTENDANCE SHEET', PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // "Name of the board: <BOARD_TYPE> - <BOARD_NAME>" — left-aligned beneath
  // the heading. board_type and board_name are denormalized on the meeting
  // (board_type via the 20260521 migration; board_name passed in by the
  // caller after a COE lookup). Either may be absent on legacy meetings, in
  // which case we render whatever is available and skip the row entirely if
  // both are blank.
  const boardType = (meeting.board_type ?? '').trim().toUpperCase();
  const boardNameUpper = (boardName ?? '').trim().toUpperCase();
  const boardLabelParts: string[] = [];
  if (boardType) boardLabelParts.push(boardType);
  if (boardNameUpper) boardLabelParts.push(boardNameUpper);
  if (boardLabelParts.length) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(`Name of the board: ${boardLabelParts.join(' - ')}`, MARGIN, y);
    y += 6;
  }

  // Compact meeting metadata strip so the attendance sheet is self-contained
  // (someone holding only this page can still identify the meeting).
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  const metaLine = [
    `Meeting No. ${meeting.meeting_number} / ${meeting.academic_year}`,
    `Date: ${fmtDate(meeting.actual_date || meeting.scheduled_date)}`,
    `Venue: ${meeting.venue || '—'}`,
  ].join('   |   ');
  doc.text(metaLine, PAGE_W / 2, y, { align: 'center' });
  y += 6;

  // Attendance table — same shape as the existing in-minutes table but with
  // an extra Signature column. Cells are intentionally tall (minCellHeight
  // 12mm) so each row gives the signer ~8-9mm of clear writing height inside
  // the cell; the Signature column gets the largest share of the page width.
  const present = attendees.filter((a) => a.attendance_status === 'present');
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(`ATTENDANCE  (${present.length} Present / ${attendees.length} Total)`, MARGIN, y);
  y += 4;

  autoTable(doc, {
    head: [['S.No', 'Name', 'Designation', 'Status', 'Signature']],
    body: attendees.map((a, i) => [
      i + 1,
      (a as { member?: { display_name?: string } }).member?.display_name ?? '—',
      (a as { member?: { display_designation?: string } }).member?.display_designation ?? '',
      a.attendance_status === 'present' ? 'Present' : 'Absent',
      '', // empty — to be signed in person on the printed copy
    ]),
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    theme: 'grid',
    styles: {
      font: 'times', fontSize: 9, cellPadding: 2.5,
      lineColor: [0, 0, 0], lineWidth: 0.3,
      textColor: [0, 0, 0], valign: 'middle', overflow: 'linebreak',
      minCellHeight: 12, // ← extra vertical room so signatures fit
    },
    headStyles: {
      font: 'times', fontStyle: 'bold',
      fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 9,
      minCellHeight: 8,
    },
    // Column widths sum to CONTENT_W (190mm). Signature gets the most space
    // (56mm) since that's the column users actually fill on the printed copy.
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 50 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 56 }, // Signature — widest
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 3) {
        const v = data.cell.raw as string;
        data.cell.styles.textColor = v === 'Present' ? [0, 120, 0] : [180, 0, 0];
      }
    },
  });
}

export function generateMinutesPdf({
  header,
  meeting,
  attendees,
  agendaItems,
  chairmanName,
  boardName,
}: MinutesParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');

  // ── Page 1: Standalone Attendance Sheet ────────────────────────────────
  // Has its own banner + custom heading + table-with-Signature-column. The
  // members are sorted by canonical board-protocol order (chairman first,
  // then external experts, then internal members). The in-minutes attendance
  // block was removed below so the same data isn't printed twice.
  drawAttendanceSheet(doc, header, meeting, attendees, boardName);

  // ── Page 2+: Existing minutes content ──────────────────────────────────
  doc.addPage();
  let y = drawBanner(doc, header, PAGE_W, MARGIN);
  if (header.officials) y = drawOfficials(doc, header.officials, y);
  y = divider(doc, y);

  // Title — always "MINUTES OF BOARD OF STUDIES MEETING" (centered). The
  // board identity moves to a left-aligned "Name of the board:" line below
  // the title for the same reason as the attendance sheet on page 1 — keeps
  // the title consistent across boards and turns the identifier into a
  // labeled row instead of a prefix.
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.text('MINUTES OF BOARD OF STUDIES MEETING', PAGE_W / 2, y, { align: 'center' });
  y += 7;

  // "Name of the board: <BOARD_TYPE> - <BOARD_NAME>" — left-aligned beneath
  // the title. Falls back gracefully when board_type or board_name is missing
  // on legacy meetings; if both are blank, the row is skipped entirely.
  const titleBoardType = (meeting.board_type ?? '').trim().toUpperCase();
  const titleBoardName = (boardName ?? '').trim().toUpperCase();
  const titleBoardParts: string[] = [];
  if (titleBoardType) titleBoardParts.push(titleBoardType);
  if (titleBoardName) titleBoardParts.push(titleBoardName);
  if (titleBoardParts.length) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(`Name of the board: ${titleBoardParts.join(' - ')}`, MARGIN, y);
    y += 6;
  }

  // Meeting details.
  // Date/Start Time fall back to the scheduled values when actuals haven't
  // been recorded — the previous nullish-coalescing (`??`) wouldn't catch
  // empty-string actuals (which is what the DB stores when the meeting is
  // saved but not yet "completed"); using `||` covers both null/undefined
  // AND empty string so the printed PDF shows the schedule even before
  // the chairman fills in actual timings.
  // The Quorum row was removed per UX request — it added noise for meetings
  // that simply hadn't been marked complete yet, and the same info is
  // implied by the attendance count below.
  y = detailsTable(doc, [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date', fmtDate(meeting.actual_date || meeting.scheduled_date)],
    ['Start Time', fmtTime(meeting.actual_start_time || meeting.scheduled_time)],
    ['Venue', meeting.venue || '—'],
    ['Chairman', chairmanName],
  ], y);

  // (Attendance table intentionally omitted here — page 1 is now a
  // standalone Attendance Sheet rendered by drawAttendanceSheet(). Leaving
  // a counts-summary line here so the minutes section still mentions the
  // headcount without duplicating the full roster.)
  const present = attendees.filter((a) => a.attendance_status === 'present');
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Attendance: ${present.length} Present / ${attendees.length} Total (see attendance sheet on page 1).`,
    MARGIN,
    y,
  );
  y += 6;

  // Agenda & Resolutions
  if (agendaItems.length > 0) {
    if (y > 240) { doc.addPage(); y = MARGIN; }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('Meeting AGENDA', MARGIN, y);
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

  // ── Rich minutes narrative (TipTap HTML → plain text with line breaks) ──
  // The editor stores rich HTML; in the PDF we render it as plain paragraphs
  // because jsPDF's text engine doesn't natively render arbitrary HTML and
  // pulling in html-to-pdf machinery for this one section would balloon the
  // bundle. stripHtml() already preserves <br>, <p>, and <li> as logical
  // line breaks, so paragraphs and bulleted lists survive intact even if
  // bold/italic formatting doesn't. Users who need formatted exports can be
  // routed to a future Puppeteer-based renderer in a later phase.
  const narrativeHtml = meeting.minutes_content?.narrative_html;
  const narrativePlain = narrativeHtml ? stripHtml(narrativeHtml) : '';
  if (narrativePlain) {
    if (y > 240) { doc.addPage(); y = MARGIN; }
    // Section header above the bordered narrative table. Body sits inside
    // a single-cell autoTable so the narrative gets a visible border and
    // justified alignment — matching the visual treatment of the other
    // sections (details, suggested changes) on the page.
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.text('MINUTES NARRATIVE', MARGIN, y);
    y += 5;

    // Plain doc.text() loop instead of autoTable: autoTable doesn't expose
    // per-line line-height for a multi-line cell, and the user asked for
    // *both* a larger font AND more vertical breathing room between lines.
    // The loop gives explicit `y += LINE_HEIGHT` control. No table means
    // no outer border (matches the earlier "no need table outer border"
    // request) and left-alignment is the default — same conventional body-
    // text alignment a reader expects.
    doc.setFont('times', 'normal');
    doc.setFontSize(12); // +1 size from 11pt per UX request
    const LINE_HEIGHT = 8; // mm — 12pt body at ~1.5x line-height feels right
    const narrativeLines = doc.splitTextToSize(narrativePlain, CONTENT_W);
    for (const line of narrativeLines) {
      // Hand-paginate so a long narrative doesn't run off the bottom edge.
      if (y + LINE_HEIGHT > PAGE_H - 12) { doc.addPage(); y = MARGIN; }
      doc.text(line, MARGIN, y);
      y += LINE_HEIGHT;
    }
    y += 4;
  }

  // ── Suggested Changes (structured per-syllabus changes log) ─────────────
  // Each row in the editor's changes_log becomes one row in this table. Topic
  // and sub-topic arrays are joined with " · " for compact display; if a row
  // skipped some fields they render as em-dashes.
  const changesLog = meeting.minutes_content?.changes_log ?? [];
  if (changesLog.length > 0) {
    if (y > 240) { doc.addPage(); y = MARGIN; }
    // Font sizes here also bumped per UX request — readability over density.
    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.text('SUGGESTED CHANGES', MARGIN, y);
    y += 5;

    autoTable(doc, {
      head: [['#', 'Course', 'Unit', 'Topics', 'Sub-topics', 'Suggested by', 'Change']],
      body: changesLog.map((row, idx) => [
        idx + 1,
        row.syllabus_code ?? '—',
        row.unit ?? '—',
        asArray(row.topic).join(' · ') || '—',
        asArray(row.sub_topic).join(' · ') || '—',
        // suggested_by_name can be a single string (legacy) or string[] (new
        // multi-select shape). asArray normalizes; join with ', ' to separate
        // co-suggestors in the printed cell.
        asArray(row.suggested_by_name).join(', ') || '—',
        row.suggestion_text ?? '',
      ]),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      theme: 'grid',
      styles: {
        font: 'times', fontSize: 10, cellPadding: 2.5,
        lineColor: [0, 0, 0], lineWidth: 0.3,
        textColor: [0, 0, 0], valign: 'top', overflow: 'linebreak',
      },
      headStyles: {
        font: 'times', fontStyle: 'bold',
        fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 24 },
        2: { cellWidth: 26 },
        3: { cellWidth: 32 },
        4: { cellWidth: 32 },
        5: { cellWidth: 28 },
        // 6 (Change) takes remaining width via tableWidth.
      },
    });
    y = lastAutoY(doc, y + 30) + 8;
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

  // Signatures of the board members who attended.
  //
  // Layout (replaces the older 3-per-row signature grid per UX request):
  //   S.No | Members | Signature
  //
  // Where the "Members" cell stacks four lines per row — Name / Designation
  // / Institution / Address — so the printed copy reads like a mailing
  // sheet ("send to this address"). Only present members are listed.
  // Sorted in the canonical chairman → external experts → internal-member
  // order so this table mirrors page 1.
  //
  // Important: we BUILD the row data first, then do a height-fit check, THEN
  // draw the section heading exactly once. Drawing the heading first would
  // either (a) orphan it at the bottom of the current page if the table then
  // page-breaks, or (b) cause us to re-emit it on the new page, producing a
  // duplicate. Both happened in earlier iterations.

  type MemberRow = {
    display_name?: string;
    display_designation?: string;
    display_institution?: string;
    address?: string;
    member_type?: string | null;
    expert_id?: string | null;
  };
  // Internal (staff-sourced) members live at the JKKN campus and won't have
  // a bos_members.address filled in. For these, fall back to the
  // letterhead's institution address so the signatures cell still shows a
  // postal address. External (expert-sourced) members carry their own
  // address and need no fallback. Internal-ness derives from expert_id —
  // member_type stores the free-form catalog name since 20260710150000.
  const presentMemberCells = sortAttendeesForPdf(attendees)
    .filter((a) => a.attendance_status === 'present')
    .map((a, idx) => {
      const m = ((a as unknown as { member?: MemberRow }).member) ?? {};
      // Compose the Members cell as stacked lines: name, designation,
      // institution, address. Empty fields are skipped so a member without
      // an institution doesn't render a blank line in the middle. For
      // internal members lacking an explicit address, fall back to the
      // institution address from the letterhead (matches what the call
      // letter PDF implicitly does via its "To" address block).
      const memberAddress = (m.address ?? '').trim();
      const addressFallback =
        memberAddress ||
        (m.expert_id == null
          ? (header.institution_address ?? '').trim()
          : '');
      const lines = [
        m.display_name ?? '—',
        m.display_designation ?? '',
        m.display_institution ?? '',
        addressFallback,
      ].filter((s) => s && s.trim().length > 0);
      return [String(idx + 1), lines.join('\n'), ''];
    });

  // Page-break decision happens BEFORE the section heading is drawn — that
  // way the heading appears exactly once (either on the current page if the
  // table fits, or on the new page after the break). Earlier iterations
  // drew the heading first and re-emitted it on overflow, which produced
  // an orphan heading on the previous page AND a duplicate on the next.
  //
  // Height estimate includes:
  //   • SECTION_HEADER_H (8mm): the bold "SIGNATURES OF BOARD MEMBERS" line
  //   • TABLE_HEADER_H (10mm): the autoTable column-header row
  //   • rows × ROW_H (32mm each): generous over-estimate per data row, since
  //     Members cells with 4-line stacked content can exceed the 24mm floor
  //
  // For very large boards (~20+ present members) the table is taller than
  // a full page anyway — in that case autoTable falls back to its default
  // split-with-repeated-header behavior, which is the least bad option for
  // genuinely page-busting tables.
  if (presentMemberCells.length > 0) {
    const SECTION_HEADER_H = 8;
    const TABLE_HEADER_H = 10;
    const ROW_H = 32;
    const estimatedHeight =
      SECTION_HEADER_H + TABLE_HEADER_H + presentMemberCells.length * ROW_H;
    const remainingSpace = PAGE_H - y - 12; // 12mm bottom margin
    if (estimatedHeight > remainingSpace) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // Section heading — drawn exactly once, AFTER the page-break decision so
  // there's no orphan on the prior page.
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('SIGNATURES OF BOARD MEMBERS', MARGIN, y);
  y += 5;

  if (presentMemberCells.length === 0) {
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.text('No members were recorded as present.', MARGIN, y);
  } else {
    autoTable(doc, {
      head: [['S.No', 'Members', 'Signature']],
      body: presentMemberCells,
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: CONTENT_W,
      theme: 'grid',
      styles: {
        font: 'times', fontSize: 10, cellPadding: 3,
        lineColor: [0, 0, 0], lineWidth: 0.3,
        textColor: [0, 0, 0], valign: 'top', overflow: 'linebreak',
        // 4-line Members cell × ~5mm per line ≈ 20mm; signature column also
        // needs ~20mm of clear writing space, so this is a sensible floor.
        minCellHeight: 24,
      },
      headStyles: {
        font: 'times', fontStyle: 'bold',
        fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 10,
        minCellHeight: 8,
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', valign: 'middle' },
        1: { cellWidth: 106 },          // Members — widest because it stacks 4 lines
        2: { cellWidth: CONTENT_W - 14 - 106 }, // Signature — remaining ~70mm
      },
    });
  }

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