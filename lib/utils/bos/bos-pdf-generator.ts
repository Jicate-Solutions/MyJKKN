import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BosMeeting, BosMember, BosAgendaItem, BosMeetingAttendee } from '@/types/bos';
import { stripHtml } from '@/components/ui/rich-text-editor';

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

  // ── Signature block ─────────────────────────────────────────────────────
  // Two layouts:
  //   • Assets present (Arts/Science): seal image (left) + signature PNG (right),
  //     matching the call-letter PDF the user referenced. The sign PNG already
  //     has "PRINCIPAL" baked into the artwork, so no extra text line is needed.
  //   • No assets (Engineering etc.): fall back to text-only "Principal" line.
  const hasSignatureAssets = !!(header.sealImage || header.signImage);
  const signatureBlockHeight = hasSignatureAssets ? 38 : 12;
  if (y + signatureBlockHeight > PAGE_H - 15) { doc.addPage(); y = MARGIN + 10; }

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
    doc.setFontSize(10);
    doc.text(principalName, PAGE_W - MARGIN, y, { align: 'right' });
    doc.text('Principal', PAGE_W - MARGIN, y + 5, { align: 'right' });
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
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('MINUTES NARRATIVE', MARGIN, y);
    y += 5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const narrativeLines = doc.splitTextToSize(narrativePlain, CONTENT_W);
    // Hand-paginate so a long narrative doesn't run off the page silently.
    for (const line of narrativeLines) {
      if (y > 270) { doc.addPage(); y = MARGIN; }
      doc.text(line, MARGIN, y);
      y += 5;
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
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text('SUGGESTED CHANGES', MARGIN, y);
    y += 4;

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
        font: 'times', fontSize: 8, cellPadding: 2,
        lineColor: [0, 0, 0], lineWidth: 0.3,
        textColor: [0, 0, 0], valign: 'top', overflow: 'linebreak',
      },
      headStyles: {
        font: 'times', fontStyle: 'bold',
        fillColor: [230, 230, 230], textColor: [0, 0, 0], halign: 'center', fontSize: 8,
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

  if (y + 22 > PAGE_H - 12) { doc.addPage(); y = MARGIN + 10; }

  // Signatures of the board members who attended. Replaces the generic
  // 3-role row (Subject In-Charge / HOD / Principal) per UX request — the
  // actual approvers of these minutes are the present board members, so the
  // PDF now reflects who signed off.
  const presentMembers = attendees
    .filter((a) => a.attendance_status === 'present')
    .map((a) => {
      const m = (a as unknown as { member?: { display_name?: string; display_designation?: string } }).member;
      return {
        name: m?.display_name ?? '—',
        designation: m?.display_designation ?? undefined,
      };
    });
  memberSignatureGrid(doc, y, presentMembers);

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
