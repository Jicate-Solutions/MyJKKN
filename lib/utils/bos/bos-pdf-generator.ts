import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BosMeeting, BosMember, BosAgendaItem, BosMeetingAttendee } from '@/types/bos';

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  // t is HH:MM or HH:MM:SS
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function addLetterhead(doc: jsPDF, collegeName: string, principalName: string, title: string): number {
  let y = MARGIN;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(collegeName, PAGE_W / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Board of Studies', PAGE_W / 2, y, { align: 'center' });
  y += 5;
  // Divider
  doc.setDrawColor(60, 60, 60);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  // Document title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PAGE_W / 2, y, { align: 'center' });
  y += 8;
  return y;
}

function addFooter(doc: jsPDF, principalName: string): void {
  const pageH = 297;
  const y = pageH - MARGIN;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(principalName, PAGE_W - MARGIN, y - 4, { align: 'right' });
  doc.text('Principal', PAGE_W - MARGIN, y, { align: 'right' });
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, MARGIN, y);
}

// ── 1. Meeting Notice ─────────────────────────────────────────────────────────

interface MeetingNoticeParams {
  collegeName: string;
  principalName: string;
  meeting: BosMeeting;
  agendaItems: BosAgendaItem[];
  chairmanName: string;
}

export function generateMeetingNoticePdf({
  collegeName,
  principalName,
  meeting,
  agendaItems,
  chairmanName,
}: MeetingNoticeParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = addLetterhead(doc, collegeName, principalName, 'Notice of Board of Studies Meeting');

  // Meeting details block
  const details: [string, string][] = [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Meeting Type', meeting.meeting_type?.replace(/_/g, ' ') ?? '—'],
    ['Date', fmtDate(meeting.scheduled_date)],
    ['Time', fmtTime(meeting.scheduled_time)],
    ['Venue', meeting.venue ?? '—'],
    ['Chairman', chairmanName],
  ];

  doc.setFontSize(10);
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, MARGIN + 38, y);
    y += LINE_H;
  }
  y += 4;

  // Intro text
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const intro = `All members of the Board of Studies are hereby informed that the ${
    meeting.meeting_type?.replace(/_/g, ' ') ?? ''
  } Meeting of the Board of Studies will be held as per the details mentioned above. Your presence is solicited.`;
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, MARGIN, y);
  y += introLines.length * LINE_H + 4;

  // Agenda table
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Agenda', MARGIN, y);
  y += 4;

  if (agendaItems.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['S.No', 'Agenda Item', 'Description']],
      body: agendaItems
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => [
          item.item_number,
          item.item_title,
          item.item_description ?? '',
        ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 60 } },
      theme: 'grid',
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  } else if (meeting.agenda_text) {
    const agendaLines = doc.splitTextToSize(meeting.agenda_text, CONTENT_W);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(agendaLines, MARGIN, y);
    y += agendaLines.length * LINE_H + 10;
  }

  addFooter(doc, principalName);
  doc.save(`meeting-notice-${meeting.meeting_number}-${meeting.academic_year}.pdf`);
}

// ── 2. Minutes of Meeting ─────────────────────────────────────────────────────

interface MinutesParams {
  collegeName: string;
  meeting: BosMeeting;
  attendees: BosMeetingAttendee[];
  agendaItems: BosAgendaItem[];
  chairmanName: string;
}

export function generateMinutesPdf({
  collegeName,
  meeting,
  attendees,
  agendaItems,
  chairmanName,
}: MinutesParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = addLetterhead(doc, collegeName, 'Principal', 'Minutes of Board of Studies Meeting');

  // Meeting details
  const details: [string, string][] = [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date', fmtDate(meeting.actual_date ?? meeting.scheduled_date)],
    ['Start Time', fmtTime(meeting.actual_start_time ?? meeting.scheduled_time)],
    ['End Time', fmtTime(meeting.actual_end_time)],
    ['Venue', meeting.venue ?? '—'],
    ['Chairman', chairmanName],
    ['Quorum', meeting.quorum_met ? 'Met' : 'Not Met'],
  ];

  doc.setFontSize(10);
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, MARGIN + 38, y);
    y += LINE_H;
  }
  y += 4;

  // Attendance table
  const present = attendees.filter((a) => a.attendance_status === 'present');
  const absent = attendees.filter((a) => a.attendance_status !== 'present');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Attendance  (${present.length} Present / ${attendees.length} Total)`, MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['S.No', 'Name', 'Designation', 'Status']],
    body: attendees.map((a, i) => [
      i + 1,
      a.member?.display_name ?? '—',
      a.member?.display_designation ?? '',
      a.attendance_status === 'present' ? 'Present' : 'Absent',
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold' },
    bodyStyles: {},
    theme: 'grid',
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 3) {
        const status = data.cell.raw as string;
        data.cell.styles.textColor = status === 'Present' ? [0, 130, 0] : [180, 0, 0];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Agenda & resolutions
  if (agendaItems.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Agenda Items & Resolutions', MARGIN, y);
    y += 4;

    for (const item of agendaItems.sort((a, b) => a.sort_order - b.sort_order)) {
      // Check page overflow
      if (y > 265) { doc.addPage(); y = MARGIN; }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const itemTitle = `${item.item_number}. ${item.item_title}`;
      const titleLines = doc.splitTextToSize(itemTitle, CONTENT_W);
      doc.text(titleLines, MARGIN, y);
      y += titleLines.length * 5 + 2;

      if (item.discussion_notes) {
        doc.setFont('helvetica', 'italic');
        const notes = doc.splitTextToSize(`Discussion: ${item.discussion_notes}`, CONTENT_W - 4);
        doc.text(notes, MARGIN + 4, y);
        y += notes.length * 5 + 2;
      }

      if (item.resolution_text) {
        doc.setFont('helvetica', 'normal');
        const res = doc.splitTextToSize(`Resolution: ${item.resolution_text}`, CONTENT_W - 4);
        doc.text(res, MARGIN + 4, y);
        y += res.length * 5 + 4;
      }
    }
  }

  if (meeting.minutes_summary) {
    if (y > 250) { doc.addPage(); y = MARGIN; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(meeting.minutes_summary, CONTENT_W);
    doc.text(summaryLines, MARGIN, y);
  }

  addFooter(doc, 'Principal');
  doc.save(`minutes-meeting-${meeting.meeting_number}-${meeting.academic_year}.pdf`);
}

// ── 3. Call Letter for External Expert ───────────────────────────────────────

interface CallLetterParams {
  collegeName: string;
  principalName: string;
  meeting: BosMeeting;
  agendaItems: BosAgendaItem[];
  expert: BosMember;
  chairmanName: string;
}

export function generateCallLetterPdf({
  collegeName,
  principalName,
  meeting,
  agendaItems,
  expert,
}: CallLetterParams): void {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = addLetterhead(doc, collegeName, principalName, 'Invitation Letter — Board of Studies');

  const ref = `Ref: BoS/${meeting.academic_year}/${meeting.meeting_number}/${expert.id.slice(0, 6).toUpperCase()}`;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(ref, PAGE_W - MARGIN, y, { align: 'right' });
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, MARGIN, y);
  y += 8;

  // Addressee block
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('To,', MARGIN, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(expert.display_name, MARGIN, y); y += 5;
  if (expert.display_designation) { doc.text(expert.display_designation, MARGIN, y); y += 5; }
  if (expert.display_institution) { doc.text(expert.display_institution, MARGIN, y); y += 5; }
  if (expert.address) {
    const addrLines = doc.splitTextToSize(expert.address, 80);
    doc.text(addrLines, MARGIN, y); y += addrLines.length * 5;
  }
  y += 4;

  // Salutation
  doc.setFont('helvetica', 'bold');
  doc.text(`Dear ${expert.display_designation ? expert.display_designation + ' ' : ''}${expert.display_name},`, MARGIN, y);
  y += 7;

  // Body
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const body1 = `We are pleased to invite you to attend the ${
    meeting.meeting_type?.replace(/_/g, ' ') ?? ''
  } Meeting of the Board of Studies of ${collegeName} scheduled as follows:`;
  const body1Lines = doc.splitTextToSize(body1, CONTENT_W);
  doc.text(body1Lines, MARGIN, y);
  y += body1Lines.length * 5 + 5;

  // Meeting details table
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Detail', 'Information']],
    body: [
      ['Meeting Number', `${meeting.meeting_number} / ${meeting.academic_year}`],
      ['Date', fmtDate(meeting.scheduled_date)],
      ['Time', fmtTime(meeting.scheduled_time)],
      ['Venue', meeting.venue ?? '—'],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [40, 80, 160], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    theme: 'grid',
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Agenda summary
  if (agendaItems.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('The agenda for this meeting includes:', MARGIN, y);
    y += 5;
    for (const item of agendaItems.sort((a, b) => a.sort_order - b.sort_order)) {
      if (y > 260) { doc.addPage(); y = MARGIN; }
      const line = doc.splitTextToSize(`${item.item_number}. ${item.item_title}`, CONTENT_W - 6);
      doc.text(line, MARGIN + 4, y);
      y += line.length * 5 + 1;
    }
    y += 4;
  }

  // TA/DA note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text(
    'Travelling Allowance and Daily Allowance will be provided as per the norms.',
    MARGIN, y
  );
  y += 8;

  // Closing
  doc.setFont('helvetica', 'normal');
  doc.text('Kindly confirm your attendance at the earliest.', MARGIN, y);
  y += 7;
  doc.text('Yours sincerely,', MARGIN, y);
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.text(principalName, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Principal', MARGIN, y);

  addFooter(doc, principalName);
  doc.save(`call-letter-${expert.display_name.replace(/\s+/g, '-')}-meeting-${meeting.meeting_number}.pdf`);
}
