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
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageOrientation,
  convertMillimetersToTwip,
} from 'docx';
import type {
  BosMeeting,
  BosAgendaItem,
  BosMeetingAttendee,
} from '@/types/bos';
import type { BosPdfHeader } from './bos-pdf-generator';
import { stripHtml } from '@/components/ui/rich-text-editor';

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'Times New Roman';
const SIZE_BODY = 22;     // 11pt (docx units = half-points)
const SIZE_SMALL = 18;    // 9pt
const SIZE_TITLE = 28;    // 14pt
const SIZE_SECTION = 22;  // 11pt — section headers
const PAGE_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 15;
const CONTENT_WIDTH_DXA = convertMillimetersToTwip(PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2);

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
  opts?: { bold?: boolean; size?: number; align?: AlignmentType; shading?: string },
): TableCell {
  return new TableCell({
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
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: SIZE_SECTION,
        bold: true,
      }),
    ],
  });
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildLetterhead(header: BosPdfHeader): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: (header.institution_name ?? '').toUpperCase(),
          font: FONT,
          size: SIZE_TITLE,
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

    const officialsTable = new Table({
      width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
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

    // Wrap the table in a paragraph reference container — docx wants these
    // top-level in the section children list, so caller appends officialsTable
    // separately via the extras returned below. For now we leave a marker
    // paragraph; the document assembly stitches the parts together.
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: '__OFFICIALS_TABLE__', font: FONT, size: 1 })],
      }),
    );
    // Stash the actual table reference on a global symbol — gross but tidy
    // alternatives require a bigger refactor. The caller swaps the marker.
    (paras as unknown as { _officialsTable?: Table })._officialsTable = officialsTable;
  }

  return paras;
}

function buildDetailsTable(meeting: BosMeeting, chairmanName: string): Table {
  const labelW = convertMillimetersToTwip(40);
  const valueW = CONTENT_WIDTH_DXA - labelW;

  const rows: Array<[string, string]> = [
    ['Meeting No.', `${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date', fmtDate(meeting.actual_date || meeting.scheduled_date)],
    ['Start Time', fmtTime(meeting.actual_start_time || meeting.scheduled_time)],
    ['Venue', meeting.venue || '—'],
    ['Chairman', chairmanName],
  ];

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: labelW, type: WidthType.DXA },
              shading: { fill: 'F5F5F5', type: 'clear', color: 'auto' },
              borders: ALL_BORDERS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: label, font: FONT, size: SIZE_BODY, bold: true }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: valueW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: value, font: FONT, size: SIZE_BODY }),
                  ],
                }),
              ],
            }),
          ],
        }),
    ),
  });
}

function buildAttendanceTable(attendees: BosMeetingAttendee[]): Table {
  const colWidths = [
    convertMillimetersToTwip(15),
    convertMillimetersToTwip(70),
    convertMillimetersToTwip(60),
    convertMillimetersToTwip(35),
  ];

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('S.No', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6' }),
      cellText('Name', { bold: true, shading: 'E6E6E6' }),
      cellText('Designation', { bold: true, shading: 'E6E6E6' }),
      cellText('Status', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6' }),
    ],
  });

  const body = attendees.map((a, i) => {
    const m = (a as unknown as { member?: { display_name?: string; display_designation?: string } }).member;
    const isPresent = a.attendance_status === 'present';
    return new TableRow({
      children: [
        cellText(String(i + 1), { align: AlignmentType.CENTER }),
        cellText(m?.display_name ?? '—'),
        cellText(m?.display_designation ?? ''),
        cellText(isPresent ? 'Present' : 'Absent', { align: AlignmentType.CENTER }),
      ],
    });
  });

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [header, ...body],
  });
}

function buildAgendaParagraphs(agendaItems: BosAgendaItem[]): Paragraph[] {
  const sorted = [...agendaItems].sort((a, b) => a.sort_order - b.sort_order);
  const out: Paragraph[] = [];

  for (const item of sorted) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
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
          indent: { left: convertMillimetersToTwip(6) },
          children: [
            new TextRun({
              text: `Discussion: ${item.discussion_notes}`,
              font: FONT,
              size: SIZE_BODY,
              italics: true,
            }),
          ],
        }),
      );
    }
    if (item.resolution_text) {
      out.push(
        new Paragraph({
          indent: { left: convertMillimetersToTwip(6) },
          children: [
            new TextRun({
              text: `Resolution: ${item.resolution_text}`,
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
        spacing: { after: 100 },
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

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('#', { bold: true, align: AlignmentType.CENTER, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Course', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Unit', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Topics', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Sub-topics', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Suggested by', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
      cellText('Change', { bold: true, shading: 'E6E6E6', size: SIZE_SMALL }),
    ],
  });

  const body = changesLog.map(
    (row, idx) =>
      new TableRow({
        children: [
          cellText(String(idx + 1), { align: AlignmentType.CENTER, size: SIZE_SMALL }),
          cellText(row.syllabus_code ?? '—', { size: SIZE_SMALL }),
          cellText(row.unit ?? '—', { size: SIZE_SMALL }),
          cellText(asArray(row.topic).join(' · ') || '—', { size: SIZE_SMALL }),
          cellText(asArray(row.sub_topic).join(' · ') || '—', { size: SIZE_SMALL }),
          // Multi-suggestor support: join co-suggestor names with ', ' for
          // the Word table cell. Mirrors the PDF cell formatting.
          cellText(asArray(row.suggested_by_name).join(', ') || '—', { size: SIZE_SMALL }),
          cellText(row.suggestion_text ?? '', { size: SIZE_SMALL }),
        ],
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
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
}

export function buildMinutesDocxDoc(params: MinutesDocxParams): Document {
  const { header, meeting, attendees, agendaItems, chairmanName } = params;

  // Letterhead: returns paragraphs + a stashed officials table reference.
  const letterheadParas = buildLetterhead(header);
  const officialsTable = (letterheadParas as unknown as { _officialsTable?: Table })
    ._officialsTable;

  // Replace the marker paragraph with… nothing here. We splice it out and
  // splice the actual Table into the section children list below.
  const children: (Paragraph | Table)[] = [];
  for (const p of letterheadParas) {
    const text =
      (p.options as unknown as { children?: Array<{ text?: string }> })?.children?.[0]?.text;
    if (text === '__OFFICIALS_TABLE__') {
      if (officialsTable) children.push(officialsTable);
      continue;
    }
    children.push(p);
  }

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: 'MINUTES OF BOARD OF STUDIES MEETING',
          font: FONT,
          size: SIZE_TITLE,
          bold: true,
        }),
      ],
    }),
  );

  // Details
  children.push(buildDetailsTable(meeting, chairmanName));

  // Attendance
  const present = attendees.filter((a) => a.attendance_status === 'present').length;
  children.push(sectionHeading(`ATTENDANCE  (${present} Present / ${attendees.length} Total)`));
  children.push(buildAttendanceTable(attendees));

  // Agenda
  if (agendaItems.length > 0) {
    children.push(sectionHeading('AGENDA ITEMS & RESOLUTIONS'));
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

  // Signatures
  const presentMembers = attendees
    .filter((a) => a.attendance_status === 'present')
    .map((a) => {
      const m = (a as unknown as { member?: { display_name?: string; display_designation?: string } })
        .member;
      return {
        name: m?.display_name ?? '—',
        designation: m?.display_designation ?? undefined,
      };
    });
  const sigGrid = buildSignatureGrid(presentMembers, 3);
  if (sigGrid) {
    children.push(sectionHeading('SIGNATURES OF BOARD MEMBERS'));
    children.push(sigGrid);
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
