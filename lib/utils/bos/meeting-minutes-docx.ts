/**
 * Word (.docx) renderer for the BoS Minutes of Meeting.
 *
 * Mirrors the section order of generateMinutesPdf in bos-pdf-generator.ts so a
 * user comparing the two exports sees the same content in the same order:
 *
 *   1. Letterhead (institution name + accreditation + address + officials)
 *   2. Title — "MINUTES OF BOARD OF STUDIES MEETING"
 *   3. Meeting details table (No, Date, Start Time, Venue, Chairman)
 *   4. Attendance table
 *   5. Agenda items & resolutions
 *   6. Minutes narrative (TipTap HTML → plain text via stripHtml)
 *   7. Suggested changes table (from minutes_content.changes_log)
 *   8. Signatures of present board members (grid, 3 per row)
 *
 * Layout deliberately doesn't try to perfectly match the PDF — Word reflows
 * content based on viewer settings, so we focus on logical structure and
 * legible defaults (Times New Roman, A4 portrait, standard margins).
 *
 * Logos/seal/sign images are NOT embedded in this version: the docx library
 * supports ImageRun but base64 → ArrayBuffer + sizing fiddling adds ~80
 * lines of brittle code. If you want logos in the .docx later, mirror the
 * pattern in course-syllabus-docx.ts which already does this.
 */

import {
  Document,
  Packer,
  Paragraph,
  PageBreak,
  TextRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LineRuleType,
  PageOrientation,
  convertMillimetersToTwip,
} from 'docx';
import type {
  BosMeeting,
  BosAgendaItem,
  BosMeetingAttendee,
  BosMemberType,
} from '@/types/bos';
import type { BosPdfHeader } from './bos-pdf-generator';
import { stripHtml } from '@/components/ui/rich-text-editor';

// Canonical ordering for BoS members in attendance / signature tables.
// Duplicated from bos-pdf-generator.ts because the PDF module pulls jsPDF
// (a browser-only dep) and importing it into this server-renderable file
// would balloon the docx bundle. If this list diverges from the PDF's, the
// two exports will silently differ — keep them in sync.
const MEMBER_TYPE_ORDER: Record<BosMemberType, number> = {
  chairman: 1,
  university_nominee: 2,
  subject_expert: 3,
  industry_expert: 4,
  alumni: 5,
  internal_member: 6,
  hod: 7,
  startup: 8,
  facilitator: 9,
  principal: 10,
};

function memberTypeRank(t: string | null | undefined): number {
  if (!t) return 99;
  // Catalog-name values (20260710150000) aren't in the enum map — rank 99.
  return (MEMBER_TYPE_ORDER as Record<string, number>)[t] ?? 99;
}

function sortAttendeesForDocx(attendees: BosMeetingAttendee[]): BosMeetingAttendee[] {
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

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'Times New Roman';
const SIZE_BODY = 20;     // 10pt (docx units = half-points) — matched to PDF body text
const SIZE_SMALL = 16;    // 8pt — for accreditation/contact lines
const SIZE_HEADER = 26;   // 13pt — institution name header (matched to PDF)
const SIZE_SECTION = 24;  // 12pt — section headers like "AGENDA", "MINUTES" (matched to PDF)
const PAGE_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 12; // Reduced from 15mm to match PDF
const CONTENT_WIDTH_DXA = convertMillimetersToTwip(PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2);
// 1.5 line spacing for body/narrative paragraphs (240 twips = single line, so
// 360 = 1.5×). Applied to running text only — table cells stay single-spaced,
// otherwise the attendance/signature tables grow ~50% taller and the
// signature grid no longer fits its page.
const LINE_150 = { line: 360, lineRule: LineRuleType.AUTO } as const;

// Same normalization used by minutes-tab.tsx and bos-pdf-generator.ts —
// duplicated here to keep this module self-contained without dragging
// React/UI imports into a server-renderable doc generator.
function asArray(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v];
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '—';
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Cell / row helpers ───────────────────────────────────────────────────────
// Thin black borders, matching the PDF's autoTable look.
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const ALL_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

function cellText(
  text: string,
  opts?: { bold?: boolean; size?: number; align?: AlignmentType; shading?: string; width?: number },
): TableCell {
  return new TableCell({
    // Explicit cell width is required for Word to honor column proportions under
    // a FIXED table layout; without it Word autofits to content and the columns
    // drift out of alignment.
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    children: [
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: FONT,
            size: opts?.size ?? SIZE_BODY,
            bold: opts?.bold ?? false,
          }),
        ],
      }),
    ],
    shading: opts?.shading ? { fill: opts.shading, type: 'clear', color: 'auto' } : undefined,
    borders: ALL_BORDERS,
  });
}

function para(
  text: string,
  opts?: {
    bold?: boolean;
    size?: number;
    align?: AlignmentType;
    spacingAfter?: number;
    spacingBefore?: number;
  },
): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.LEFT,
    spacing: {
      after: opts?.spacingAfter ?? 80,
      before: opts?.spacingBefore ?? 0,
      ...LINE_150,
    },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts?.size ?? SIZE_BODY,
        bold: opts?.bold ?? false,
      }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 80, after: 60, ...LINE_150 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        font: FONT,
        size: SIZE_SECTION,
        bold: true,
      }),
    ],
  });
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildLetterhead(header: BosPdfHeader): (Paragraph | Table)[] {
  const paras: (Paragraph | Table)[] = [];

  paras.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: (header.institution_name ?? '').toUpperCase(),
          font: FONT,
          size: SIZE_HEADER,
          bold: true,
        }),
      ],
    }),
  );

  if (header.institution_accreditation) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: header.institution_accreditation,
            font: FONT,
            size: SIZE_SMALL,
          }),
        ],
      }),
    );
  }

  if (header.institution_address) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: header.institution_address,
            font: FONT,
            size: SIZE_SMALL,
            bold: true,
          }),
        ],
      }),
    );
  }

  // Officials block — Secretary on left, Principal on right. We render as one
  // 2-column table without borders so it sits naturally below the centered
  // institution banner.
  if (header.officials) {
    const o = header.officials;
    const contactBits: string[] = [];
    if (o.contact_cell) contactBits.push(`Cell: ${o.contact_cell}`);
    if (o.contact_web) contactBits.push(`Web: ${o.contact_web}`);
    if (o.contact_email) contactBits.push(`E-Mail: ${o.contact_email}`);

    const noBorders = {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };

    const halfWidth = Math.round(CONTENT_WIDTH_DXA / 2);
    const officialsTable = new Table({
      width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: [halfWidth, halfWidth],
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: halfWidth, type: WidthType.DXA },
              borders: noBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({ text: o.secretary_name, font: FONT, size: SIZE_BODY, bold: true }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({ text: 'Secretary', font: FONT, size: SIZE_SMALL }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: halfWidth, type: WidthType.DXA },
              borders: noBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: o.principal_name, font: FONT, size: SIZE_BODY, bold: true }),
                  ],
                }),
                ...(contactBits.length > 0
                  ? [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({ text: contactBits.join('   '), font: FONT, size: SIZE_SMALL }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
          ],
        }),
      ],
    });

    // Push the officials table directly into the letterhead block. (docx allows
    // Paragraph and Table siblings in a section's children list, so no marker /
    // stash indirection is needed — the previous marker-swap relied on reading
    // the docx library's private Paragraph internals and silently dropped this
    // whole Secretary/Principal block when that access didn't resolve.)
    paras.push(officialsTable);
  }

  return paras;
}

function buildDetailsLine(meeting: BosMeeting, chairmanName: string): Paragraph {
  // Match PDF's inline pipe-separated format:
  // "Meeting No. 3 / 2026-2027 | Date: 22 May 2026 | Start Time: 10:30 AM | Venue: Zoology Department | Chairman: Dr. S. Umavathi"
  const parts = [
    `Meeting No. ${meeting.meeting_number} / ${meeting.academic_year}`,
    `Date: ${fmtDate(meeting.actual_date || meeting.scheduled_date)}`,
    `Start Time: ${fmtTime(meeting.actual_start_time || meeting.scheduled_time)}`,
    `Venue: ${meeting.venue || '—'}`,
    `Chairman: ${chairmanName}`,
  ];

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 80, after: 80, ...LINE_150 },
    children: [
      new TextRun({
        text: parts.join('   |   '),
        font: FONT,
        size: SIZE_BODY,
      }),
    ],
  });
}

function buildAttendanceTable(attendees: BosMeetingAttendee[]): Table {
  // 5-column attendance table, mirroring the PDF's page-1 attendance sheet:
  // S.No | Name | Designation | Status | Signature.
  // Proportions: 5% | 28% | 28% | 12% | 27% (matching PDF redesign)
  const pageWidth = CONTENT_WIDTH_DXA;
  const colWidths = [
    Math.round(pageWidth * 0.05),   // S.No — 5%
    Math.round(pageWidth * 0.28),   // Name — 28%
    Math.round(pageWidth * 0.28),   // Designation — 28%
    Math.round(pageWidth * 0.12),   // Status — 12%
    Math.round(pageWidth * 0.27),   // Signature — 27%
  ];

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('S.No', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[0] }),
      cellText('Name', { bold: true, shading: 'E6E6E6', width: colWidths[1] }),
      cellText('Designation', { bold: true, shading: 'E6E6E6', width: colWidths[2] }),
      cellText('Status', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[3] }),
      cellText('Signature', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[4] }),
    ],
  });

  // Sort canonically (chairman → external experts → internal members).
  const sorted = sortAttendeesForDocx(attendees);
  const body = sorted.map((a, i) => {
    const m = (a as unknown as { member?: { display_name?: string; display_designation?: string } }).member;
    const isPresent = a.attendance_status === 'present';
    return new TableRow({
      children: [
        cellText(String(i + 1), { align: AlignmentType.CENTER, width: colWidths[0] }),
        cellText(m?.display_name ?? '—', { width: colWidths[1] }),
        cellText(m?.display_designation ?? '', { width: colWidths[2] }),
        cellText(isPresent ? 'Present' : 'Absent', { align: AlignmentType.CENTER, width: colWidths[3] }),
        cellText('', { align: AlignmentType.CENTER, width: colWidths[4] }), // blank — signed in person
      ],
    });
  });

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    rows: [header, ...body],
  });
}

// Board type + name as a simple bold line, matching the PDF format.
// Replaces the old formal "ATTENDANCE SHEET" heading.
function buildBoardLine(
  meeting: BosMeeting,
  boardName: string | undefined,
): Paragraph {
  const boardType = (meeting.board_type ?? '').trim().toUpperCase();
  const boardNameUpper = (boardName ?? '').trim().toUpperCase();
  const parts: string[] = [];
  if (boardType) parts.push(boardType);
  if (boardNameUpper) parts.push(boardNameUpper);
  const boardLabel = parts.length ? parts.join(' - ') : 'Board';

  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 80, after: 80, ...LINE_150 },
    children: [
      new TextRun({
        text: `Board: ${boardLabel}`,
        font: FONT,
        size: SIZE_BODY,
        bold: true,
      }),
    ],
  });
}

// New signatures table replacing the old 3-per-row signature grid. Matches
// the PDF's "S.No | Members | Signature" layout where the Members cell stacks
// Name / Designation / Institution / Address. Only present members are
// listed, in canonical sort order.
function buildSignaturesTable(attendees: BosMeetingAttendee[]): Table | null {
  type MemberRow = {
    display_name?: string;
    display_designation?: string;
    display_institution?: string;
    address?: string;
  };

  const presentRows = sortAttendeesForDocx(attendees)
    .filter((a) => a.attendance_status === 'present')
    .map((a) => ((a as unknown as { member?: MemberRow }).member) ?? {});

  if (presentRows.length === 0) return null;

  // Proportions: 8% | 60% | 32% (matching PDF redesign)
  const pageWidth = CONTENT_WIDTH_DXA;
  const colWidths = [
    Math.round(pageWidth * 0.08),   // S.No — 8%
    Math.round(pageWidth * 0.60),   // Members — 60% (stacks Name/Designation/Institution/Address)
    Math.round(pageWidth * 0.32),   // Signature — 32%
  ];

  // Compose the Members cell as one TableCell with multiple Paragraphs —
  // each Paragraph becomes a visible line inside the cell. Empty fields are
  // skipped to avoid a blank line in the middle of the stack.
  const memberCell = (m: MemberRow): TableCell => {
    const lines = [
      m.display_name ?? '—',
      m.display_designation ?? '',
      m.display_institution ?? '',
      m.address ?? '',
    ].filter((s) => s && s.trim().length > 0);
    return new TableCell({
      width: { size: colWidths[1], type: WidthType.DXA },
      borders: ALL_BORDERS,
      children: lines.map(
        (text) =>
          new Paragraph({
            children: [new TextRun({ text, font: FONT, size: SIZE_BODY })],
          }),
      ),
    });
  };

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('S.No', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[0] }),
      cellText('Members', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[1] }),
      cellText('Signature', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', width: colWidths[2] }),
    ],
  });

  const body = presentRows.map(
    (m, idx) =>
      new TableRow({
        children: [
          cellText(String(idx + 1), { align: AlignmentType.CENTER, width: colWidths[0] }),
          memberCell(m),
          // Blank signature cell — needs visible borders so the user can see
          // where to sign on a printed copy.
          new TableCell({
            width: { size: colWidths[2], type: WidthType.DXA },
            borders: ALL_BORDERS,
            children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
          }),
        ],
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    rows: [header, ...body],
  });
}

function buildAgendaParagraphs(agendaItems: BosAgendaItem[]): Paragraph[] {
  const sorted = [...agendaItems].sort((a, b) => a.sort_order - b.sort_order);
  const out: Paragraph[] = [];

  for (const item of sorted) {
    out.push(
      new Paragraph({
        spacing: { before: 80, after: 40, ...LINE_150 },
        children: [
          new TextRun({
            text: `${item.item_number}. ${item.item_title}`,
            font: FONT,
            size: SIZE_BODY,
            bold: true,
          }),
        ],
      }),
    );
    if (item.discussion_notes) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertMillimetersToTwip(8) },
          spacing: { after: 40, ...LINE_150 },
          children: [
            new TextRun({
              text: 'Discussion: ',
              font: FONT,
              size: SIZE_BODY,
              italics: true,
            }),
            new TextRun({
              text: item.discussion_notes,
              font: FONT,
              size: SIZE_BODY,
            }),
          ],
        }),
      );
    }
    if (item.resolution_text) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertMillimetersToTwip(8) },
          spacing: { after: 40, ...LINE_150 },
          children: [
            new TextRun({
              text: 'Resolution: ',
              font: FONT,
              size: SIZE_BODY,
              italics: true,
            }),
            new TextRun({
              text: item.resolution_text,
              font: FONT,
              size: SIZE_BODY,
            }),
          ],
        }),
      );
    }
  }

  return out;
}

function buildNarrativeParagraphs(narrativeHtml?: string): Paragraph[] {
  const text = narrativeHtml ? stripHtml(narrativeHtml) : '';
  if (!text) return [];
  // Split on blank lines into paragraph blocks; preserve single-line breaks
  // as `<br>` equivalents inside a paragraph using multiple TextRuns.
  const blocks = text.split(/\n{2,}/);
  return blocks.map(
    (block) =>
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 100, ...LINE_150 },
        children: block.split('\n').flatMap((line, idx, arr) => {
          const runs: TextRun[] = [
            new TextRun({ text: line, font: FONT, size: SIZE_BODY }),
          ];
          if (idx < arr.length - 1) {
            runs.push(new TextRun({ text: '', font: FONT, size: SIZE_BODY, break: 1 }));
          }
          return runs;
        }),
      }),
  );
}

function buildChangesLogTable(
  changesLog: Array<{
    syllabus_code?: string | null;
    unit?: string | null;
    topic?: string | string[] | null;
    sub_topic?: string | string[] | null;
    suggested_by_name?: string | string[] | null;
    suggestion_text?: string | null;
  }>,
): Table {
  const colWidths = [
    convertMillimetersToTwip(10),
    convertMillimetersToTwip(22),
    convertMillimetersToTwip(28),
    convertMillimetersToTwip(28),
    convertMillimetersToTwip(28),
    convertMillimetersToTwip(28),
    convertMillimetersToTwip(36),
  ];

  // Font size bumped from SIZE_SMALL (9pt) to SIZE_BODY (11pt) per UX
  // request — the smaller font was hard to read on a printed copy. Mirrors
  // the same bump applied to the PDF generator's Suggested Changes table.
  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('#', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Course', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Unit', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Topics', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Sub-topics', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Suggested by', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
      cellText('Change', { bold: true, shading: 'E6E6E6', size: SIZE_BODY }),
    ],
  });

  const body = changesLog.map(
    (row, idx) =>
      new TableRow({
        children: [
          cellText(String(idx + 1), { align: AlignmentType.CENTER, size: SIZE_BODY }),
          cellText(row.syllabus_code ?? '—', { size: SIZE_BODY }),
          cellText(row.unit ?? '—', { size: SIZE_BODY }),
          cellText(asArray(row.topic).join(' · ') || '—', { size: SIZE_BODY }),
          cellText(asArray(row.sub_topic).join(' · ') || '—', { size: SIZE_BODY }),
          // Multi-suggestor support: join co-suggestor names with ', ' for
          // the Word table cell. Mirrors the PDF cell formatting.
          cellText(asArray(row.suggested_by_name).join(', ') || '—', { size: SIZE_BODY }),
          cellText(row.suggestion_text ?? '', { size: SIZE_BODY }),
        ],
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    rows: [header, ...body],
  });
}

function buildSignatureGrid(
  members: Array<{ name: string; designation?: string }>,
  perRow = 3,
): Table | null {
  if (members.length === 0) return null;
  const colWidth = Math.floor(CONTENT_WIDTH_DXA / perRow);

  // Pad members so the last row has empty cells if needed.
  const padded = [...members];
  while (padded.length % perRow !== 0) padded.push({ name: '' });

  const rows: TableRow[] = [];
  for (let i = 0; i < padded.length; i += perRow) {
    const slice = padded.slice(i, i + perRow);
    rows.push(
      new TableRow({
        children: slice.map((m) => {
          const isEmpty = !m.name;
          return new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            borders: {
              top: BORDER, // signature line goes on the TOP of the cell
              bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            children: isEmpty
              ? [new Paragraph({ children: [new TextRun({ text: '' })] })]
              : [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 240, after: 0 },
                    children: [
                      new TextRun({
                        text: m.name,
                        font: FONT,
                        size: SIZE_SMALL,
                        bold: true,
                      }),
                    ],
                  }),
                  ...(m.designation
                    ? [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new TextRun({
                              text: m.designation,
                              font: FONT,
                              size: 16, // 8pt
                              color: '505050',
                            }),
                          ],
                        }),
                      ]
                    : []),
                ],
          });
        }),
      }),
    );
  }

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    rows,
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface MinutesDocxParams {
  header: BosPdfHeader;
  meeting: BosMeeting;
  attendees: BosMeetingAttendee[];
  agendaItems: BosAgendaItem[];
  chairmanName: string;
  /**
   * Board display name (e.g. "Computer Science"). Drives both the page-1
   * attendance-sheet heading ("<BOARD_TYPE> - <BOARD_NAME> ATTENDANCE
   * SHEET") and the page-2 title ("<BOARD_TYPE> - <BOARD_NAME> - MINUTES OF
   * BOARD OF STUDIES MEETING"). Falls back to a generic heading if absent.
   */
  boardName?: string;
}

export function buildMinutesDocxDoc(params: MinutesDocxParams): Document {
  const { header, meeting, attendees, agendaItems, chairmanName, boardName } = params;

  // Materialize the letterhead block (institution banner + officials table).
  // Called once per printed page (attendance sheet, minutes, signatures) so each
  // page carries the institution header. buildLetterhead now returns the mixed
  // Paragraph/Table list ready to splice into the section children.
  const renderLetterhead = (): (Paragraph | Table)[] => buildLetterhead(header);

  const children: (Paragraph | Table)[] = [];
  const presentTotal = attendees.filter((a) => a.attendance_status === 'present').length;

  // ── Page 1: Attendance Sheet ───────────────────────────────────────────
  children.push(...renderLetterhead());
  children.push(buildBoardLine(meeting, boardName));
  children.push(buildDetailsLine(meeting, chairmanName));
  children.push(sectionHeading('ATTENDANCE'));
  children.push(buildAttendanceTable(attendees));

  // ── Page break — Word renders subsequent content from a fresh page ────
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  // ── Page 2: Minutes Content ──────────────────────────────────────────
  children.push(...renderLetterhead());
  children.push(buildBoardLine(meeting, boardName));
  children.push(buildDetailsLine(meeting, chairmanName));

  // Attendance summary line — full roster is on page 1, so this is just a
  // pointer for someone reading the minutes section in isolation.
  children.push(
    new Paragraph({
      spacing: { before: 60, after: 120, ...LINE_150 },
      children: [
        new TextRun({
          text: `Attendance: ${presentTotal} Present / ${attendees.length} Total (see attendance sheet on page 1).`,
          font: FONT,
          size: SIZE_BODY,
        }),
      ],
    }),
  );

  // Agenda
  if (agendaItems.length > 0) {
    children.push(sectionHeading('MEETING AGENDA'));
    children.push(...buildAgendaParagraphs(agendaItems));
  }

  // Minutes narrative
  const narrativeParas = buildNarrativeParagraphs(meeting.minutes_content?.narrative_html);
  if (narrativeParas.length > 0) {
    children.push(sectionHeading('MINUTES NARRATIVE'));
    children.push(...narrativeParas);
  }

  // Suggested changes
  const changesLog = meeting.minutes_content?.changes_log ?? [];
  if (changesLog.length > 0) {
    children.push(sectionHeading('SUGGESTED CHANGES'));
    children.push(buildChangesLogTable(changesLog));
  }

  // Legacy summary (for backwards-compat with rows saved before minutes_content)
  if (meeting.minutes_summary) {
    children.push(sectionHeading('SUMMARY'));
    children.push(para(meeting.minutes_summary));
  }

  // ── Page 3+: Signatures ────────────────────────────────────────────────
  const sigTable = buildSignaturesTable(attendees);
  if (sigTable) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
    );
    children.push(...renderLetterhead());
    children.push(sectionHeading('SIGNATURES OF BOARD MEMBERS'));
    children.push(sigTable);
  }

  return new Document({
    creator: 'MyJKKN — Board of Studies',
    title: `Minutes ${meeting.meeting_number} / ${meeting.academic_year}`,
    description: 'BoS Minutes of Meeting',
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: {
              top: convertMillimetersToTwip(PAGE_MARGIN_MM),
              right: convertMillimetersToTwip(PAGE_MARGIN_MM),
              bottom: convertMillimetersToTwip(PAGE_MARGIN_MM),
              left: convertMillimetersToTwip(PAGE_MARGIN_MM),
            },
          },
        },
        children,
      },
    ],
  });
}

/**
 * Browser entry point — packs the document and triggers a download via the
 * user's File Save dialog. Async because docx.Packer.toBlob returns a Promise.
 */
export async function generateMinutesDocx(params: MinutesDocxParams): Promise<void> {
  const doc = buildMinutesDocxDoc(params);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minutes-meeting-${params.meeting.meeting_number}-${params.meeting.academic_year}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Safari has time to start the download before the URL goes
  // stale — chromium/firefox revoke immediately is fine, Safari needs a tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Re-export for callers (mirrors the PDF generator's buffer entry point shape).
export { Packer };
