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
 * Seal/sign images are NOT embedded. The college logo IS, but only on the CET
 * letterhead (buildCetLetterhead), which reproduces the printed stationery —
 * see the ImageRun + dataUrlToBytes pair there, and course-syllabus-docx.ts
 * for the same pattern loading from a URL instead of a data URL.
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
  HeightRule,
  LineRuleType,
  PageOrientation,
  ImageRun,
  VerticalAlign,
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
import { htmlToDocxBlocks, type DocxBlock } from './html-to-docx';

// Canonical ordering for BoS members in attendance / signature tables.
// Duplicated from bos-pdf-generator.ts because the PDF module pulls jsPDF
// (a browser-only dep) and importing it into this server-renderable file
// would balloon the docx bundle. If this list diverges from the PDF's, the
// two exports will silently differ — keep them in sync.
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

type AttendeeMember = {
  member_type?: BosMemberType | string | null;
  /** Catalog row joined via member_type_id — carries the coarse base_type. */
  member_type_rec?: { base_type?: BosMemberType | string | null } | null;
  sort_order?: number | null;
  display_name?: string | null;
};

function memberTypeRank(member: AttendeeMember): number {
  // Since migration 20260710150000, bos_members.member_type holds the SELECTED
  // catalog type's NAME verbatim, not the coarse enum — so matching it against
  // MEMBER_TYPE_ORDER ranked every catalog-linked row 99 and the sort collapsed
  // to sort_order alone. Rank from the catalog's base_type (the sanctioned
  // discriminator), falling back to the raw literal for legacy rows with a NULL
  // member_type_id. Mirrors meeting-minutes-html-pdf.ts — keep the two in sync.
  const rank = (v?: string | null): number | undefined =>
    v ? (MEMBER_TYPE_ORDER as Record<string, number>)[v.trim().toLowerCase()] : undefined;
  return rank(member.member_type_rec?.base_type) ?? rank(member.member_type) ?? 99;
}

function sortAttendeesForDocx(attendees: BosMeetingAttendee[]): BosMeetingAttendee[] {
  const memberOf = (a: BosMeetingAttendee): AttendeeMember =>
    ((a as unknown as { member?: AttendeeMember }).member) ?? {};
  return [...attendees].sort((a, b) => {
    const ma = memberOf(a);
    const mb = memberOf(b);
    // Chairman (1) → university nominee → experts → faculty (7) → HoD (8) → …
    const rankDiff = memberTypeRank(ma) - memberTypeRank(mb);
    if (rankDiff !== 0) return rankDiff;
    const soDiff = (ma.sort_order ?? 0) - (mb.sort_order ?? 0);
    if (soDiff !== 0) return soDiff;
    return (ma.display_name ?? '').localeCompare(mb.display_name ?? '');
  });
}

// ── Constants ────────────────────────────────────────────────────────────────
const FONT = 'Times New Roman';

/**
 * The PDF stylesheet is written in px; Word measures characters in half-points.
 * Converting (1px = 0.75pt) rather than picking round point sizes is what makes
 * the two exports print at the same physical size — the sheets were previously
 * set in 10pt Word against 10px PDF, a third larger, which is why columns that
 * fit the PDF wrapped in Word.
 */
const px = (value: number) => Math.max(2, Math.round(value * 1.5));

const SIZE_BODY = px(10);      // .meeting-details / .attendance-summary / .agenda-detail
const SIZE_SMALL = 16;         // 8pt — letterhead accreditation/contact lines
const SIZE_HEADER = 26;        // 13pt — institution name (letterhead is tuned separately)
const SIZE_SECTION = px(12);   // .section-title
const SIZE_BOARD = px(11);     // .board-info
const SIZE_TABLE = px(12);     // table / th / td
const SIZE_NARRATIVE = px(10); // .narrative

// CET's minutes are signed in ink and photocopied for the file, so its sheets
// use a larger scale. Mirrors the `${isCet ? ... }` block at the end of the
// PDF stylesheet — keep the two in step.
const SIZE_TABLE_CET = px(14);
const SIZE_NARRATIVE_CET = px(13);
const SIZE_AGENDA_CET = px(13);

const PAGE_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 12; // Matches the 12mm print margin the PDF renderer uses
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

/** Header-row fill, matching the PDF's `th { background: #d3d3d3 }`. */
const HEADER_FILL = 'D3D3D3';

// docx ships AlignmentType as a const object rather than an enum, so the union
// of its values is the type to annotate with.
type DocxAlignment = (typeof AlignmentType)[keyof typeof AlignmentType];

function cellText(
  text: string,
  opts?: {
    bold?: boolean;
    size?: number;
    align?: DocxAlignment;
    shading?: string;
    width?: number;
    color?: string;
  },
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
            size: opts?.size ?? SIZE_TABLE,
            bold: opts?.bold ?? false,
            color: opts?.color,
          }),
        ],
      }),
    ],
    shading: opts?.shading ? { fill: opts.shading, type: 'clear', color: 'auto' } : undefined,
    borders: ALL_BORDERS,
  });
}

/**
 * Printable member-type label — the Word twin of the same helper in
 * meeting-minutes-html-pdf.ts. Since migration 20260710150000 `member_type`
 * holds the selected catalog name ('University Nominee') and prints as-is;
 * legacy rows still hold the coarse enum, for which the joined catalog row is
 * the better name and an un-snaked enum the last resort.
 */
function memberTypeLabel(member?: {
  member_type?: string | null;
  member_type_rec?: { name?: string | null } | null;
} | null): string {
  const raw = (member?.member_type ?? '').trim();
  if (raw && !raw.includes('_')) return raw;
  const catalog = (member?.member_type_rec?.name ?? '').trim();
  if (catalog) return catalog;
  if (!raw) return '';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function para(
  text: string,
  opts?: {
    bold?: boolean;
    size?: number;
    align?: DocxAlignment;
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

// ── CET printed stationery ───────────────────────────────────────────────────
// Word twin of the letterhead in meeting-minutes-html-pdf.ts. Text is
// transcribed verbatim from the printed sheet (note "NATTRAJA" double-T and
// "Kumarapalayam"); colours match the PDF's #1a7a3d green and #c2185b/#b0135c
// magenta. Only the engineering college switches over — every other
// institution keeps the plain banner below, driven by its own header config.
const CET_LETTERHEAD = {
  name: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
  autonomous: '( An Autonomous Institution )',
  trust: '( MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST )',
  lines: [
    '(Approved by AICTE - New Delhi & Affiliated to Anna University, Chennai)',
    'Recognized by UGC Under Section 2(f) & Accredited by NAAC',
    'Natarajapuram, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
  ],
};
const CET_GREEN = '1A7A3D';
const CET_TRUST = 'C2185B';
const CET_MAGENTA = 'B0135C';
const CET_RULE = 'E0407F';

function isCetInstitution(name?: string): boolean {
  return /engineering|technology/i.test(name ?? '');
}

/** base64 data URL → bytes. Runs in the browser (the caller lazy-imports this
 * module client-side), so atob is the primary path; Buffer covers a server
 * render. Returns null for anything that isn't a data URL. */
function dataUrlToBytes(dataUrl?: string): Uint8Array | null {
  if (!dataUrl?.startsWith('data:image/')) return null;
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  try {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
}

/** Word needs explicit pixel dimensions for an image — unlike the PDF's
 * object-fit: contain — so read the PNG's own IHDR and scale it into the box
 * rather than hardcoding a ratio and stretching the mark. */
function fitPngIntoBox(
  bytes: Uint8Array,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const isPng =
    bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (!isPng) return { width: boxW, height: boxH };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  if (!w || !h) return { width: boxW, height: boxH };
  const scale = Math.min(boxW / w, boxH / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function buildCetLetterhead(header: BosPdfHeader): (Paragraph | Table)[] {
  const centred = (
    text: string,
    opts: { size: number; color: string; bold?: boolean; after?: number },
  ) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: opts.after ?? 20, line: 240, lineRule: LineRuleType.AUTO },
      children: [
        new TextRun({
          text,
          font: FONT,
          size: opts.size,
          bold: opts.bold ?? false,
          color: opts.color,
        }),
      ],
    });

  const bannerParas = [
    centred(CET_LETTERHEAD.name, { size: SIZE_HEADER, color: CET_GREEN, bold: true }),
    centred(CET_LETTERHEAD.autonomous, { size: 18, color: CET_GREEN, bold: true }),
    centred(CET_LETTERHEAD.trust, { size: 17, color: CET_TRUST }),
    ...CET_LETTERHEAD.lines.map((l) =>
      centred(l, { size: 17, color: CET_MAGENTA, bold: true }),
    ),
  ];

  // The engineering mark lives in rightLogoImage (institution-header.ts); the
  // generic trust logo is the fallback.
  const logoBytes = dataUrlToBytes(header.rightLogoImage || header.logoImage);
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  // Logo | banner | empty spacer of equal width. The mirror column is what
  // keeps the banner centred on the PAGE rather than on the leftover space.
  const logoColDxa = convertMillimetersToTwip(28);
  const bannerColDxa = CONTENT_WIDTH_DXA - logoColDxa * 2;

  const bannerTable = new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [logoColDxa, bannerColDxa, logoColDxa],
    layout: TableLayoutType.FIXED,
    borders: {
      ...noBorders,
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: logoColDxa, type: WidthType.DXA },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              logoBytes
                ? new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [
                      new ImageRun({
                        type: 'png',
                        data: logoBytes,
                        transformation: fitPngIntoBox(logoBytes, 104, 66),
                      }),
                    ],
                  })
                : new Paragraph({ children: [new TextRun({ text: '' })] }),
            ],
          }),
          new TableCell({
            width: { size: bannerColDxa, type: WidthType.DXA },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: bannerParas,
          }),
          new TableCell({
            width: { size: logoColDxa, type: WidthType.DXA },
            borders: noBorders,
            children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
          }),
        ],
      }),
    ],
  });

  return [bannerTable, ...buildOfficialsBlock(header, CET_RULE)];
}

function buildLetterhead(header: BosPdfHeader): (Paragraph | Table)[] {
  if (isCetInstitution(header.institution_name)) return buildCetLetterhead(header);

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

  paras.push(...buildOfficialsBlock(header, '000000'));

  return paras;
}

/** Officials block — Secretary on left, Principal on right. Rendered as one
 * 2-column borderless table so it sits naturally below the institution banner;
 * its bottom border doubles as the letterhead's divider rule, hence the
 * caller-supplied colour (black for the plain banner, pink for CET). */
function buildOfficialsBlock(
  header: BosPdfHeader,
  ruleColor: string,
): (Paragraph | Table)[] {
  const paras: (Paragraph | Table)[] = [];

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
        bottom: { style: BorderStyle.SINGLE, size: 8, color: ruleColor },
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
    // Centred, like the PDF's `.meeting-details`.
    alignment: AlignmentType.CENTER,
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

/**
 * Page 1's summary strip — the PDF's `.attendance-summary`, where each label is
 * bold and its value plain, so the bold/plain alternation is built run by run.
 */
function buildAttendanceSummary(
  meeting: BosMeeting,
  presentCount: number,
  total: number,
): Paragraph {
  const fields: Array<[string, string]> = [
    ['Meeting No.:', ` ${meeting.meeting_number} / ${meeting.academic_year}`],
    ['Date:', ` ${fmtDate(meeting.actual_date || meeting.scheduled_date)}`],
    ['Venue:', ` ${meeting.venue || '—'}`],
    ['Present:', ` ${presentCount} / ${total}`],
  ];

  const runs: TextRun[] = [];
  fields.forEach(([label, value], i) => {
    runs.push(new TextRun({ text: label, font: FONT, size: SIZE_BODY, bold: true }));
    runs.push(new TextRun({ text: value, font: FONT, size: SIZE_BODY }));
    if (i < fields.length - 1) {
      runs.push(new TextRun({ text: ' | ', font: FONT, size: SIZE_BODY }));
    }
  });

  return new Paragraph({
    spacing: { before: 60, after: 100, ...LINE_150 },
    children: runs,
  });
}

function buildAttendanceTable(attendees: BosMeetingAttendee[], isCet: boolean): Table {
  // 5-column attendance table, mirroring the PDF's page-1 attendance sheet:
  // S.No | Name | Designation | Status | Signature, at 5% | 28% | 28% | 12% | 27%.
  const pageWidth = CONTENT_WIDTH_DXA;
  const colWidths = [
    Math.round(pageWidth * 0.05),   // S.No — 5%
    Math.round(pageWidth * 0.28),   // Name — 28%
    Math.round(pageWidth * 0.28),   // Designation / Member Type — 28%
    Math.round(pageWidth * 0.12),   // Status — 12%
    Math.round(pageWidth * 0.27),   // Signature — 27%
  ];
  const size = isCet ? SIZE_TABLE_CET : SIZE_TABLE;

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('S.No', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[0], size }),
      cellText('Name', { bold: true, shading: HEADER_FILL, width: colWidths[1], size }),
      // CET's sheet identifies members by their role on the board rather than
      // their job title; every other college prints the designation.
      cellText(isCet ? 'Member Type' : 'Designation', { bold: true, shading: HEADER_FILL, width: colWidths[2], size }),
      cellText('Status', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[3], size }),
      cellText('Signature', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[4], size }),
    ],
  });

  // Sort canonically (chairman → external experts → internal members).
  const sorted = sortAttendeesForDocx(attendees);
  const body = sorted.map((a, i) => {
    const m = (a as unknown as {
      member?: {
        display_name?: string;
        display_designation?: string;
        member_type?: string | null;
        member_type_rec?: { name?: string | null } | null;
      };
    }).member;
    const isPresent = a.attendance_status === 'present';
    return new TableRow({
      // The PDF leaves a 40px-tall signature cell to sign in; 40px ≈ 10.6mm.
      height: { value: convertMillimetersToTwip(10.6), rule: HeightRule.ATLEAST },
      children: [
        cellText(String(i + 1), { align: AlignmentType.CENTER, width: colWidths[0], size }),
        cellText(m?.display_name ?? '—', { width: colWidths[1], size }),
        cellText(isCet ? memberTypeLabel(m) : (m?.display_designation ?? ''), { width: colWidths[2], size }),
        cellText(isPresent ? 'Present' : 'Absent', {
          align: AlignmentType.CENTER,
          width: colWidths[3],
          size,
          bold: true,
          // .status-present / .status-absent in the PDF stylesheet.
          color: isPresent ? '008000' : 'C00000',
        }),
        cellText('', { align: AlignmentType.CENTER, width: colWidths[4], size }), // blank — signed in person
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
        size: SIZE_BOARD,
        bold: true,
      }),
    ],
  });
}

// New signatures table replacing the old 3-per-row signature grid. Matches
// the PDF's "S.No | Members | Signature" layout where the Members cell stacks
// Name / Designation / Institution / Address. Only present members are
// listed, in canonical sort order.
function buildSignaturesTable(attendees: BosMeetingAttendee[], isCet: boolean): Table | null {
  type MemberRow = {
    display_name?: string;
    display_designation?: string;
    display_institution?: string;
    address?: string;
    member_type?: string | null;
    member_type_rec?: { name?: string | null } | null;
  };

  const presentRows = sortAttendeesForDocx(attendees)
    .filter((a) => a.attendance_status === 'present')
    .map((a) => ((a as unknown as { member?: MemberRow }).member) ?? {});

  if (presentRows.length === 0) return null;

  // CET's sheet carries a Member Type column, so its proportions are
  // 8 | 46 | 22 | 24; everyone else runs 8 | 60 | 32. Same split as the PDF.
  const pageWidth = CONTENT_WIDTH_DXA;
  const size = isCet ? SIZE_TABLE_CET : SIZE_TABLE;
  const colWidths = isCet
    ? [
        Math.round(pageWidth * 0.08),
        Math.round(pageWidth * 0.46),
        Math.round(pageWidth * 0.22),
        Math.round(pageWidth * 0.24),
      ]
    : [
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
            children: [new TextRun({ text, font: FONT, size })],
          }),
      ),
    });
  };

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('S.No', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[0], size }),
      cellText('Members', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[1], size }),
      ...(isCet
        ? [cellText('Member Type', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, width: colWidths[2], size })]
        : []),
      cellText('Signature', {
        bold: true,
        align: AlignmentType.CENTER,
        shading: HEADER_FILL,
        width: colWidths[colWidths.length - 1],
        size,
      }),
    ],
  });

  const body = presentRows.map(
    (m, idx) =>
      new TableRow({
        // The PDF leaves a 45px-tall signature cell; 45px ≈ 11.9mm.
        height: { value: convertMillimetersToTwip(11.9), rule: HeightRule.ATLEAST },
        children: [
          cellText(String(idx + 1), { align: AlignmentType.CENTER, width: colWidths[0], size, bold: true }),
          memberCell(m),
          ...(isCet ? [cellText(memberTypeLabel(m), { width: colWidths[2], size })] : []),
          // Blank signature cell — needs visible borders so the user can see
          // where to sign on a printed copy.
          new TableCell({
            width: { size: colWidths[colWidths.length - 1], type: WidthType.DXA },
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

function buildAgendaParagraphs(agendaItems: BosAgendaItem[], isCet: boolean): Paragraph[] {
  const sorted = [...agendaItems].sort((a, b) => a.sort_order - b.sort_order);
  const size = isCet ? SIZE_AGENDA_CET : SIZE_BODY;
  const out: Paragraph[] = [];

  // Details sit flush with their title, as `.agenda-detail { margin-left: 0 }`
  // does in the PDF — the old 8mm Word indent was a visible difference between
  // the two exports.
  const detail = (label: string, text: string): Paragraph =>
    new Paragraph({
      spacing: { after: 40, ...LINE_150 },
      children: [
        new TextRun({ text: `${label} `, font: FONT, size, italics: true }),
        new TextRun({ text, font: FONT, size }),
      ],
    });

  for (const item of sorted) {
    out.push(
      new Paragraph({
        spacing: { before: 80, after: 40, ...LINE_150 },
        children: [
          new TextRun({
            text: `${item.item_number}. ${item.item_title}`,
            font: FONT,
            size,
            bold: true,
          }),
        ],
      }),
    );
    if (item.discussion_notes) out.push(detail('Discussion:', item.discussion_notes));
    if (item.resolution_text) out.push(detail('Resolution:', item.resolution_text));
  }

  return out;
}

/**
 * The narrative's bordered box.
 *
 * The PDF draws `.narrative` as a 1px black box with 6px/8px of padding around
 * the content. Word has no block-level border that behaves the same way across
 * a page break, so the box is a single-cell table — which is also what keeps
 * the author's own tables from butting against the frame.
 */
function narrativeBox(children: DocxBlock[]): Table {
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
            borders: ALL_BORDERS,
            margins: {
              top: convertMillimetersToTwip(1.6),
              bottom: convertMillimetersToTwip(1.6),
              left: convertMillimetersToTwip(2.1),
              right: convertMillimetersToTwip(2.1),
            },
            children: children.length > 0 ? children : [new Paragraph({ children: [new TextRun({ text: '' })] })],
          }),
        ],
      }),
    ],
  });
}

/**
 * Editor HTML → the blocks that go inside the narrative box.
 *
 * The rich path (htmlToDocxBlocks) needs a DOM, which the browser callers have.
 * On a server render it returns null and we fall back to the old flattened
 * text so the export still succeeds, just without formatting.
 */
function buildNarrativeContent(narrativeHtml: string, isCet: boolean): DocxBlock[] {
  const size = isCet ? SIZE_NARRATIVE_CET : SIZE_NARRATIVE;
  const innerWidth = CONTENT_WIDTH_DXA - convertMillimetersToTwip(4.2);

  const rich = htmlToDocxBlocks(narrativeHtml, {
    font: FONT,
    size,
    contentWidthDxa: innerWidth,
    line: LINE_150.line,
  });
  if (rich) return rich;

  const text = stripHtml(narrativeHtml);
  if (!text) return [];
  return text.split(/\n{2,}/).map(
    (block) =>
      new Paragraph({
        spacing: { after: 100, ...LINE_150 },
        children: block.split('\n').flatMap((line, idx, arr) => {
          const runs: TextRun[] = [new TextRun({ text: line, font: FONT, size })];
          if (idx < arr.length - 1) {
            runs.push(new TextRun({ text: '', font: FONT, size, break: 1 }));
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
  isCet: boolean,
): Table {
  // Proportional widths summing to exactly the content width — the previous
  // fixed millimetre columns totalled 180mm inside a 186mm frame, so the table
  // sat narrower than every other table on the page.
  const share = [0.055, 0.12, 0.15, 0.15, 0.15, 0.15, 0.225];
  const colWidths = share.map((f) => Math.round(CONTENT_WIDTH_DXA * f));
  colWidths[colWidths.length - 1] += CONTENT_WIDTH_DXA - colWidths.reduce((a, b) => a + b, 0);

  const size = isCet ? SIZE_TABLE_CET : SIZE_TABLE;

  const header = new TableRow({
    tableHeader: true,
    children: [
      cellText('#', { bold: true, align: AlignmentType.CENTER, shading: HEADER_FILL, size, width: colWidths[0] }),
      cellText('Course', { bold: true, shading: HEADER_FILL, size, width: colWidths[1] }),
      cellText('Unit', { bold: true, shading: HEADER_FILL, size, width: colWidths[2] }),
      cellText('Topics', { bold: true, shading: HEADER_FILL, size, width: colWidths[3] }),
      cellText('Sub-topics', { bold: true, shading: HEADER_FILL, size, width: colWidths[4] }),
      cellText('Suggested by', { bold: true, shading: HEADER_FILL, size, width: colWidths[5] }),
      cellText('Change', { bold: true, shading: HEADER_FILL, size, width: colWidths[6] }),
    ],
  });

  const body = changesLog.map(
    (row, idx) =>
      new TableRow({
        children: [
          cellText(String(idx + 1), { align: AlignmentType.CENTER, size, width: colWidths[0] }),
          cellText(row.syllabus_code ?? '—', { size, width: colWidths[1] }),
          cellText(row.unit ?? '—', { size, width: colWidths[2] }),
          cellText(asArray(row.topic).join(' · ') || '—', { size, width: colWidths[3] }),
          cellText(asArray(row.sub_topic).join(' · ') || '—', { size, width: colWidths[4] }),
          // Multi-suggestor support: join co-suggestor names with ', ' for
          // the Word table cell. Mirrors the PDF cell formatting.
          cellText(asArray(row.suggested_by_name).join(', ') || '—', { size, width: colWidths[5] }),
          cellText(row.suggestion_text ?? '', { size, width: colWidths[6] }),
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
  // CET prints on its own stationery at a larger scale — same switch the PDF
  // renderer makes, so both exports pick the same variant for a given board.
  const isCet = isCetInstitution(header.institution_name);

  // ── Page 1: Attendance Sheet ───────────────────────────────────────────
  children.push(...renderLetterhead());
  children.push(buildBoardLine(meeting, boardName));
  children.push(buildAttendanceSummary(meeting, presentTotal, attendees.length));
  children.push(buildAttendanceTable(attendees, isCet));

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
    children.push(...buildAgendaParagraphs(agendaItems, isCet));
  }

  // Minutes narrative — authored HTML, rendered into the same bordered box the
  // PDF draws.
  const narrativeHtml = meeting.minutes_content?.narrative_html;
  if (narrativeHtml) {
    const narrativeBlocks = buildNarrativeContent(narrativeHtml, isCet);
    if (narrativeBlocks.length > 0) {
      children.push(sectionHeading('MINUTES NARRATIVE'));
      children.push(narrativeBox(narrativeBlocks));
    }
  }

  // Legacy summary (for backwards-compat with rows saved before minutes_content).
  // Boxed like the narrative, matching the PDF's second `.narrative` block.
  if (meeting.minutes_summary) {
    children.push(sectionHeading('SUMMARY'));
    children.push(
      narrativeBox([
        new Paragraph({
          spacing: { after: 0, ...LINE_150 },
          children: [
            new TextRun({
              text: meeting.minutes_summary,
              font: FONT,
              size: isCet ? SIZE_NARRATIVE_CET : SIZE_NARRATIVE,
            }),
          ],
        }),
      ]),
    );
  }

  // Suggested changes — last on the minutes page in both exports.
  const changesLog = meeting.minutes_content?.changes_log ?? [];
  if (changesLog.length > 0) {
    children.push(sectionHeading('SUGGESTED CHANGES'));
    children.push(buildChangesLogTable(changesLog, isCet));
  }

  // ── Page 3+: Signatures ────────────────────────────────────────────────
  const sigTable = buildSignaturesTable(attendees, isCet);
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
