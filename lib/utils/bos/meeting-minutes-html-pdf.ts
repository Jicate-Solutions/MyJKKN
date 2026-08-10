import puppeteerCore, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import DOMPurify from 'isomorphic-dompurify';
import { BosMeeting, BosMeetingAttendee, BosAgendaItem, BosMemberType } from '@/types/bos';
import { PDF_FONT_STACK, pdfFontFaceCss } from './pdf-fonts';

const MEMBER_TYPE_ORDER: Record<BosMemberType, number> = {
  chairman: 1, university_nominee: 2, subject_expert: 3, academic_expert: 4,
  industry_expert: 5, alumni: 6, internal_member: 7, faculty_member: 7, hod: 8,
  startup: 9, facilitator: 10, principal: 11, member_secretary: 12, student: 13,
};

/** The `member:bos_members(...)` embed the attendance route sends us. */
interface AttendeeMember {
  member_type?: BosMemberType | string | null;
  /** Catalog row joined via member_type_id — carries the coarse base_type. */
  member_type_rec?: { base_type?: BosMemberType | string | null } | null;
  sort_order?: number | null;
  display_name?: string;
}

function memberTypeRank(member: AttendeeMember): number {
  // Since migration 20260710150000, bos_members.member_type stores the SELECTED
  // catalog type's NAME verbatim ("Nominated by the Governing Body"), not the
  // coarse enum. Matching that free text against MEMBER_TYPE_ORDER missed on
  // every catalog-linked row, so all attendees ranked 99, the rank comparison
  // was always a tie, and the table fell through to sort_order — which is how
  // Assistant Professors ended up printed above the Chairman and the HoD.
  //
  // The catalog's base_type is the sanctioned discriminator (see the same rule
  // in types/bos.ts isBosChairmanRow). The raw literal stays as the fallback
  // for legacy rows whose member_type_id is NULL and which still hold enum
  // values.
  const rank = (v?: string | null): number | undefined =>
    v ? (MEMBER_TYPE_ORDER as Record<string, number>)[v.trim().toLowerCase()] : undefined;
  return rank(member.member_type_rec?.base_type) ?? rank(member.member_type) ?? 99;
}

function sortAttendeesForPdf(attendees: BosMeetingAttendee[]): BosMeetingAttendee[] {
  return [...attendees].sort((a, b) => {
    const ma = (a as unknown as { member?: AttendeeMember }).member ?? {};
    const mb = (b as unknown as { member?: AttendeeMember }).member ?? {};
    // Chairman (1) → university nominee → experts → faculty (7) → HoD (8) → …
    const rankDiff = memberTypeRank(ma) - memberTypeRank(mb);
    if (rankDiff !== 0) return rankDiff;
    // Within a type group, the roster's composition-wide rank, ascending.
    const maSort = ma.sort_order ?? 0;
    const mbSort = mb.sort_order ?? 0;
    if (maSort !== mbSort) return maSort - mbSort;
    return (ma.display_name ?? '').localeCompare(mb.display_name ?? '');
  });
}

interface MinutesHtmlPdfParams {
  meeting: BosMeeting;
  attendees: BosMeetingAttendee[];
  agendaItems: BosAgendaItem[];
  chairmanName: string;
  boardName?: string;
  boardType?: string;
  institutionName?: string;
  institutionAddress?: string;
  institutionAccreditation?: string;
  secretaryName?: string;
  principalName?: string;
  principalTitle?: string;
  contactCell?: string;
  contactWeb?: string;
  contactEmail?: string;
  logoImage?: string;
  rightLogoImage?: string;
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The minutes narrative is authored in the Tiptap editor and persisted as HTML
 * (minutes_content.narrative_html). It used to be flattened with a tag-stripping
 * regex, which collapsed headings, indents, lists and tables into one wall of
 * text — the whole letter arrived as a single paragraph.
 *
 * Chromium renders the real markup instead. It is sanitised first: the content
 * is user-authored and this string is interpolated straight into a page we then
 * execute, so a pasted <script> or an on* handler would run inside the PDF
 * renderer. `style` is deliberately kept — it carries the editor's font family,
 * font size, colour and text-align, which are exactly the properties that were
 * being lost.
 */
function sanitizeNarrativeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'span', 'div',
      'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'hr',
      // colgroup/col carry the column widths Tiptap writes when a table is
      // resized in the editor. Drop them and every table re-flows to content
      // width in the PDF — the remuneration rates table is the visible casualty.
      'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'a',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'colspan', 'rowspan', 'start', 'type',
      'href', 'src', 'alt', 'width', 'height',
    ],
    // Images are inlined as data: URIs by the editor; no other scheme is needed
    // and the PDF renderer has no business making network requests.
    ALLOWED_URI_REGEXP: /^(?:data:image\/[a-z+]+;base64,|https?:|mailto:|#)/i,
  });
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(t?: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Letterhead ───────────────────────────────────────────────────────────────
// CET's printed BoS stationery: green college name + "( An Autonomous
// Institution )", magenta trust/approval/NAAC/address lines, logo at the left,
// pink double rule. Transcribed verbatim (including "NATTRAJA" double-T and
// "Kumarapalayam") to match lib/pdf/bos-meeting-notice.ts — the call letter and
// the minutes must not disagree about the college's own name.
//
// Only the engineering college is switched over. CAS / CNR / COP / DCH minutes
// keep the previous plain banner, which is driven by their own header config.
// Same institution test as buildCallLetterHtml().
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

function isCetInstitution(institutionName: string): boolean {
  return /engineering|technology/i.test(institutionName);
}

/**
 * Printable member-type label.
 *
 * Since 20260710150000 `bos_members.member_type` holds the SELECTED catalog
 * name ('University Nominee') and is printed as-is. Legacy rows created before
 * that migration still hold the coarse enum ('university_nominee'); for those
 * the joined catalog row is the better name, and failing that the enum is
 * un-snaked rather than printed raw on an official sheet.
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
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Topic / sub-topic / suggested-by are multi-selects stored as a string or an
 * array depending on when the row was written. */
function asList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function generateMinutesHtml({
  meeting,
  attendees,
  agendaItems,
  chairmanName,
  boardName = '',
  boardType = '',
  institutionName = 'J.K.K. NATARAJA COLLEGE',
  institutionAddress = 'Komarapalayam - 638 183, Tamil Nadu',
  institutionAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
  secretaryName = 'Secretary',
  principalName = 'Principal',
  principalTitle = 'Principal',
  contactCell = '',
  contactWeb = '',
  contactEmail = '',
  logoImage = '',
  rightLogoImage = '',
}: MinutesHtmlPdfParams): string {
  const present = attendees.filter(a => a.attendance_status === 'present');
  const sorted = sortAttendeesForPdf(attendees);
  const presentSorted = sorted.filter(a => a.attendance_status === 'present');

  // Per-syllabus change entries written on the minutes tab. Printed here so the
  // PDF carries the same section the Word export does — they were diverging,
  // with the table only ever reaching the .docx.
  const changesLog = meeting.minutes_content?.changes_log ?? [];

  const boardTitle = [boardType, boardName].filter(Boolean).join(' - ').toUpperCase() || 'BOARD OF STUDIES';

  // The header repeats on all three pages (attendance / minutes / signatures),
  // so it's built once here instead of being pasted three times.
  const isCet = isCetInstitution(institutionName);
  // CET's engineering mark is loaded into rightLogoImage by the caller; the
  // generic trust logo is the fallback.
  const cetLogo = rightLogoImage || logoImage;

  // Officials letterhead row (Secretary left, Principal right).
  //
  // Only Arts & Science carries an `officials` entry in institution-header.ts;
  // Engineering/CET has none, so the caller's fallbacks (documents-tab.tsx)
  // arrive as the LITERAL placeholder strings 'Secretary' and 'Principal'.
  // Rendering those printed a letterhead reading
  //   Secretary        Principal
  //   Secretary        Principal
  // — the name line and the role line saying the same word. Emit the block only
  // when a real name is present, so CET minutes drop it entirely and A&S
  // minutes keep their genuine names.
  const realName = (value: string, placeholder: string): string => {
    const t = (value ?? '').trim();
    return t && t.toLowerCase() !== placeholder ? t : '';
  };
  const secretaryReal = realName(secretaryName, 'secretary');
  const principalReal = realName(principalName, 'principal');

  const officialsHtml = secretaryReal || principalReal
    ? `
      <div class="officials">
        <div class="official-left">
          ${secretaryReal ? `<div class="official-name">${htmlEscape(secretaryReal)}</div><div class="official-role">Secretary</div>` : ''}
        </div>
        <div class="official-right">
          ${principalReal ? `<div class="official-name">${htmlEscape(principalReal)}</div><div class="official-role">${htmlEscape(principalTitle)}</div>` : ''}
          ${contactCell ? `<div class="official-contact">Cell: ${htmlEscape(contactCell)}</div>` : ''}
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join(' | ')}</div>` : ''}
        </div>
      </div>`
    : '';

  const headerHtml = isCet
    ? `
    <div class="header header-cet">
      <div class="lh">
        <div class="lh-logo">${cetLogo ? `<img src="${cetLogo}" alt="Logo">` : ''}</div>
        <div class="lh-body">
          <div class="lh-name">${htmlEscape(CET_LETTERHEAD.name)}</div>
          <div class="lh-autonomous">${htmlEscape(CET_LETTERHEAD.autonomous)}</div>
          <div class="lh-trust">${htmlEscape(CET_LETTERHEAD.trust)}</div>
          ${CET_LETTERHEAD.lines.map(l => `<div class="lh-line">${htmlEscape(l)}</div>`).join('\n          ')}
        </div>
      </div>
      ${officialsHtml}
      <hr class="lh-rule">
      <hr class="lh-rule-thin">
    </div>`
    : `
    <div class="header">
      <div class="header-banner">
        ${logoImage ? `<img src="${logoImage}" class="header-logo" alt="Logo">` : '<div style="width: 20mm;"></div>'}
        <div class="header-center">
          <div class="header-title">${htmlEscape(institutionName)}</div>
          ${institutionAccreditation ? `<div class="header-accreditation">${htmlEscape(institutionAccreditation)}</div>` : ''}
          <div class="header-address">${htmlEscape(institutionAddress)}</div>
        </div>
        ${rightLogoImage ? `<img src="${rightLogoImage}" class="header-logo" alt="Logo">` : '<div style="width: 20mm;"></div>'}
      </div>
      ${officialsHtml}
    </div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Minutes of Board of Studies Meeting</title>
  <style>
    /* Embedded faces — see lib/utils/bos/pdf-fonts.ts. Without these the
       deployed renderer has only Open Sans and substitutes it for Times,
       widening every column past its designed width. */
    ${pdfFontFaceCss()}

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${PDF_FONT_STACK};
      line-height: 1.6;
      color: #000;
      background: white;
    }

    /* The sheet's margins belong to the print job (see page.pdf below), NOT to
       this block. A fixed 210mm width plus 12mm of its own padding double-
       counted against the printer margin: the block was wider than the
       printable area, so the right-hand border of anything full-width — the
       narrative box most visibly — was pushed off the sheet. It also meant a
       narrative that ran onto a second sheet continued with no top margin at
       all, because padding only applies at the start and end of a block.
       Width and height now come from the printable area itself. */
    .page {
      width: auto;
      margin: 0;
      padding: 0;
      background: white;
      page-break-after: always;
      position: relative;
    }

    /* Without this Chromium emits a trailing blank sheet after the signatures. */
    .page:last-child {
      page-break-after: auto;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #000;
    }

    .header-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15mm;
      margin-bottom: 10px;
    }

    .header-logo {
      width: 20mm;
      height: 20mm;
      flex-shrink: 0;
      object-fit: contain;
    }

    .header-center {
      flex: 0 1 auto;
      text-align: center;
      min-width: 0;
    }

    .header-title {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 2px;
      letter-spacing: 0.2px;
      color: #000;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: clip;
    }

    .header-accreditation {
      font-size: 8.5px;
      margin-bottom: 3px;
      line-height: 1.3;
      color: #000;
    }

    .header-address {
      font-size: 10px;
      font-weight: bold;
      margin-top: 3px;
      color: #000;
    }

    /* ── CET printed-stationery letterhead ────────────────────────────────
       Colours and metrics mirror lib/pdf/bos-meeting-notice.ts so the minutes
       and the call letter print as the same stationery. The logo is absolutely
       positioned so the centred text block spans the FULL width — that is what
       keeps the college name and the address each on a single line. */
    .header-cet {
      border-bottom: none;
      padding-bottom: 0;
    }

    .lh {
      position: relative;
      display: flex;
      align-items: center;
      min-height: 60pt;
    }

    .lh-logo {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 78pt;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lh-logo img { max-width: 100%; max-height: 58pt; object-fit: contain; }

    .lh-body { flex: 1; text-align: center; padding: 1pt 0 0; }

    .lh-name {
      font-size: 13pt;
      font-weight: bold;
      color: #1a7a3d;
      line-height: 1.15;
      letter-spacing: 0.2pt;
    }

    .lh-autonomous { font-size: 9pt; font-weight: bold; color: #1a7a3d; margin-top: 1pt; }
    .lh-trust { font-size: 8.5pt; color: #c2185b; margin-top: 1.5pt; }
    .lh-line { font-size: 8.5pt; font-weight: bold; color: #b0135c; margin-top: 1pt; white-space: nowrap; }

    .lh-rule { border: none; border-top: 2.2pt solid #e0407f; margin-top: 3pt; }
    .lh-rule-thin { border: none; border-top: 0.8pt solid #e0407f; margin-top: 1.2pt; }

    /* The pink rules replace the black divider, so the officials row above them
       must not draw its own. */
    .header-cet .officials { border-top: none; padding-top: 3px; }

    /* Explicit black. The row sits directly under the CET banner's green and
       magenta runs, and anything that inherits colour there prints the
       Principal's name in the letterhead's green — a real bug report. */
    .officials,
    .officials * {
      color: #000;
    }

    .officials {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 8px;
      padding-top: 6px;
      font-size: 8.5px;
      gap: 10px;
      border-top: 1px solid #000;
    }

    .official-left {
      text-align: left;
      flex: 1;
      padding-right: 8mm;
    }

    .official-right {
      text-align: right;
      flex: 1;
      padding-left: 8mm;
    }

    .official-name {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 1px;
      line-height: 1.3;
    }

    .official-role {
      font-size: 8px;
      line-height: 1.3;
    }

    .official-contact {
      font-size: 7.5px;
      margin-top: 1px;
      line-height: 1.3;
    }

    .board-info {
      font-weight: bold;
      margin-bottom: 8px;
      margin-top: 6px;
      font-size: 11px;
    }

    .meeting-details {
      text-align: center;
      font-size: 10px;
      margin-bottom: 8px;
      padding: 0;
    }

    .section-title {
      font-size: 12px;
      font-weight: bold;
      margin-top: 8px;
      margin-bottom: 6px;
      letter-spacing: 0.2px;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      /* 12px Times New Roman — the 10px body was too small to read comfortably
         in the printed attendance / signature sheets. */
      font-size: 12px;
      page-break-inside: avoid;
      table-layout: fixed;
    }

    table.attendance-table {
      margin-top: 6px;
    }

    tr {
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #000;
      padding: 6px 6px;
      text-align: left;
      page-break-inside: avoid;
      vertical-align: top;
      height: auto;
    }

    th {
      background: #d3d3d3;
      font-weight: bold;
      text-align: left;
      padding: 6px 6px;
      font-size: 12px;
    }

    tbody tr td:first-child {
      text-align: center;
      font-weight: bold;
      width: 5%;
    }

    .status-present { color: #008000; font-weight: bold; }
    .status-absent { color: #c00000; font-weight: bold; }

    .narrative {
      margin: 8px 0;
      padding: 6px 8px;
      border: 1px solid #000;
      font-size: 10px;
      line-height: 1.5;
      text-align: left;
      /* A long narrative legitimately runs onto the next sheet. Cloning the
         decoration closes the border on every fragment instead of leaving one
         open-ended box straddling the break. */
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      /* An unbroken token (a pasted URL, a long code) must wrap rather than
         widen the box past its border. */
      overflow-wrap: break-word;
    }

    /* ── Narrative rich text ──────────────────────────────────────────────
       The narrative is real Tiptap markup, so it needs the block styling the
       editor gives it. Inline styles on the elements themselves (font-family,
       font-size, colour, text-align) win over everything here, which is what
       carries the author's formatting through to the page. */
    .narrative p { margin: 0 0 6px 0; }
    .narrative p:last-child { margin-bottom: 0; }
    /* Tiptap emits <p></p> for a blank line; without a height it collapses and
       the author's paragraph spacing disappears. */
    .narrative p:empty { min-height: 1em; }

    .narrative h1 { font-size: 15px; font-weight: bold; margin: 10px 0 5px; }
    .narrative h2 { font-size: 13px; font-weight: bold; margin: 9px 0 5px; }
    .narrative h3 { font-size: 12px; font-weight: bold; margin: 8px 0 4px; }
    .narrative h4,
    .narrative h5,
    .narrative h6 { font-size: 11px; font-weight: bold; margin: 7px 0 4px; }
    .narrative h1:first-child,
    .narrative h2:first-child,
    .narrative h3:first-child { margin-top: 0; }

    .narrative ul { list-style: disc; padding-left: 20px; margin: 0 0 6px; }
    .narrative ol { list-style: decimal; padding-left: 20px; margin: 0 0 6px; }
    .narrative li { margin-bottom: 2px; }
    .narrative li > p { margin: 0; }

    .narrative blockquote {
      margin: 6px 0 6px 12px;
      padding-left: 8px;
      border-left: 2px solid #999;
      color: #333;
    }

    .narrative hr { border: none; border-top: 1px solid #999; margin: 8px 0; }
    .narrative img { max-width: 100%; height: auto; }
    .narrative mark { background: #fff59d; }
    .narrative pre { white-space: pre-wrap; font-family: 'Courier New', monospace; }

    /* Narrative tables mirror the editor, where .ProseMirror table is
       table-layout: fixed at width 100% (app/globals.css) and the author's
       column widths come from colgroup. What they must NOT inherit is the
       attendance sheet's bold, centred, 5%-wide first column — those rules are
       global further up this stylesheet and would re-shape the rates table. */
    .narrative table {
      table-layout: fixed;
      width: 100%;
      /* The editor writes colgroup widths in pixels sized for the on-screen
         canvas, which is wider than the sheet; without the cap a resized table
         reaches past the narrative's right border. */
      max-width: 100%;
      font-size: inherit;
      margin: 6px 0;
    }
    .narrative th,
    .narrative td { padding: 3px 5px; }
    .narrative tbody tr td:first-child {
      text-align: inherit;
      font-weight: inherit;
      width: auto;
    }

    .agenda-section {
      margin-bottom: 8px;
      padding: 0;
      page-break-inside: avoid;
    }

    .agenda-title {
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 3px;
    }

    .agenda-detail {
      font-size: 10px;
      line-height: 1.4;
      margin-top: 2px;
      margin-left: 0;
    }

    .agenda-detail-label {
      font-style: italic;
      margin-right: 4px;
    }

    .attendance-summary {
      font-size: 10px;
      margin: 8px 0;
      padding: 0;
    }

${isCet ? `
    /* ── CET type scale ───────────────────────────────────────────────────
       The engineering college's minutes are signed in ink and then photocopied
       for the file, and the shared 10-12px Times was too small to stay legible
       through that. Last in the sheet so it overrides the base rules above.
       CET only — the other colleges keep the scale their sheets are already
       laid out for.

       The two sheet tables are named explicitly rather than bumping bare
       \`table, th, td\`: a plain \`td\` rule (0,0,1) would also beat the
       \`.narrative table { font-size: inherit }\` above and re-shape the
       author's rates table inside the narrative. */
    .attendance-table, .attendance-table th, .attendance-table td,
    .signature-table, .signature-table th, .signature-table td { font-size: 14px; }

    /* Narrative body (remuneration letter, resolutions). Its nested tables
       inherit from here, so the author's rates table scales with the prose. */
    .narrative { font-size: 13px; }

    /* Agenda items entered via "Add Item". */
    .agenda-title, .agenda-detail { font-size: 13px; }
` : ''}
  </style>
</head>
<body>
  <!-- Page 1: Attendance Sheet -->
  <div class="page">
    ${headerHtml}

    <div class="board-info">Board: ${htmlEscape(boardTitle)}</div>

    <div class="attendance-summary">
      <strong>Meeting No.:</strong> ${meeting.meeting_number} / ${meeting.academic_year} |
      <strong>Date:</strong> ${formatDate(meeting.actual_date || meeting.scheduled_date)} |
      <strong>Venue:</strong> ${htmlEscape(meeting.venue || '—')} |
      <strong>Present:</strong> ${present.length} / ${attendees.length}
    </div>

    <table class="attendance-table" style="table-layout: fixed;">
      <thead>
        <tr>
          <th style="width: 5%;">S.No</th>
          <th style="width: 28%;">Name</th>
          <th style="width: 28%;">${isCet ? 'Member Type' : 'Designation'}</th>
          <th style="width: 12%;">Status</th>
          <th style="width: 27%;">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((a, i) => {
          const member = (a as unknown as { member?: { display_name?: string; display_designation?: string; member_type?: string | null; member_type_rec?: { name?: string | null } | null } }).member ?? {};
          const status = a.attendance_status === 'present' ? 'Present' : 'Absent';
          const statusClass = a.attendance_status === 'present' ? 'status-present' : 'status-absent';
          // CET's attendance sheet identifies members by their role on the board
          // (Chairman / University Nominee / Industry Expert), not by their job
          // title. Designation is still carried on the page-3 Members block.
          const roleCell = isCet
            ? memberTypeLabel(member)
            : member.display_designation ?? '';
          return `
            <tr>
              <td style="width: 5%;">${i + 1}</td>
              <td style="width: 28%;">${htmlEscape(member.display_name ?? '—')}</td>
              <td style="width: 28%;">${htmlEscape(roleCell)}</td>
              <td style="width: 12%;"><span class="${statusClass}">${status}</span></td>
              <td style="width: 27%; height: 40px;"></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Page 2+: Minutes -->
  <div class="page">
    ${headerHtml}

    <div class="board-info">Board: ${htmlEscape(boardTitle)}</div>

    <div class="meeting-details">
      Meeting No. ${meeting.meeting_number} / ${meeting.academic_year}   |   Date: ${formatDate(meeting.actual_date || meeting.scheduled_date)}   |   Start Time: ${formatTime(meeting.actual_start_time || meeting.scheduled_time)}   |   Venue: ${htmlEscape(meeting.venue || '—')}   |   Chairman: ${htmlEscape(chairmanName)}
    </div>

    <div class="attendance-summary">
      Attendance: ${present.length} Present / ${attendees.length} Total (see attendance sheet on page 1).
    </div>

    ${agendaItems.length > 0 ? `
      <div class="section-title">Meeting Agenda</div>
      ${agendaItems.sort((a, b) => a.sort_order - b.sort_order).map(item => `
        <div class="agenda-section">
          <div class="agenda-title">${item.item_number}. ${htmlEscape(item.item_title)}</div>
          ${item.discussion_notes ? `<div class="agenda-detail"><span class="agenda-detail-label">Discussion:</span> ${htmlEscape(item.discussion_notes)}</div>` : ''}
          ${item.resolution_text ? `<div class="agenda-detail"><span class="agenda-detail-label">Resolution:</span> ${htmlEscape(item.resolution_text)}</div>` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${meeting.minutes_content?.narrative_html ? `
      <div class="section-title">Minutes Narrative</div>
      <div class="narrative">
        ${sanitizeNarrativeHtml(meeting.minutes_content.narrative_html)}
      </div>
    ` : ''}

    ${meeting.minutes_summary ? `
      <div class="section-title">Summary</div>
      <div class="narrative">
        ${htmlEscape(meeting.minutes_summary)}
      </div>
    ` : ''}

    ${changesLog.length > 0 ? `
      <div class="section-title">Suggested Changes</div>
      <table class="changes-table" style="table-layout: fixed;">
        <thead>
          <tr>
            <th style="width: 5.5%;">#</th>
            <th style="width: 12%;">Course</th>
            <th style="width: 15%;">Unit</th>
            <th style="width: 15%;">Topics</th>
            <th style="width: 15%;">Sub-topics</th>
            <th style="width: 15%;">Suggested by</th>
            <th style="width: 22.5%;">Change</th>
          </tr>
        </thead>
        <tbody>
          ${changesLog.map((row, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${htmlEscape(row.syllabus_code ?? '—')}</td>
              <td>${htmlEscape(row.unit ?? '—')}</td>
              <td>${htmlEscape(asList(row.topic).join(' · ') || '—')}</td>
              <td>${htmlEscape(asList(row.sub_topic).join(' · ') || '—')}</td>
              <td>${htmlEscape(asList(row.suggested_by_name).join(', ') || '—')}</td>
              <td>${htmlEscape(row.suggestion_text ?? '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

  </div>

  <!-- Page 3: Signatures -->
  <div class="page">
    ${headerHtml}

    <div class="section-title">Signatures of Board Members</div>

    <table class="signature-table" style="table-layout: fixed;">
      <thead>
        <tr>
          <th style="width: 8%;">S.No</th>
          <th style="width: ${isCet ? '46%' : '60%'};">Members</th>
          ${isCet ? '<th style="width: 22%;">Member Type</th>' : ''}
          <th style="width: ${isCet ? '24%' : '32%'};">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${presentSorted.map((a, i) => {
          const m = (a as unknown as { member?: { display_name?: string; display_designation?: string; display_institution?: string; address?: string; member_type?: BosMemberType | string | null; member_type_rec?: { name?: string | null } | null } }).member ?? {};
          const lines = [
            m.display_name ?? '—',
            m.display_designation ?? '',
            m.display_institution ?? '',
            m.address ?? '',
          ].filter(s => s && s.trim().length > 0);
          return `
            <tr>
              <td style="text-align: center; font-weight: bold;">${i + 1}</td>
              <td>${lines.map(l => htmlEscape(l)).join('<br>')}</td>
              ${isCet ? `<td>${htmlEscape(memberTypeLabel(m))}</td>` : ''}
              <td style="height: 45px;"></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

  </div>
</body>
</html>
  `;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch (err) {
      console.warn('[PDF] Browser connection lost, relaunching:', err);
      browser = null;
    }
  }

  try {
    // Same launcher contract as lib/pdf/bos-meeting-notice.ts — see that file
    // for the Vercel notes. Statically importing the FULL `puppeteer` package
    // here used to crash the Next dev render worker ("Jest worker encountered
    // 2 child process exceptions") because it isn't externalised from the
    // server bundle, and it has no Chrome binary on Vercel at all. Keep the
    // heavyweight import lazy and behind the local-dev branch.
    const isServerless =
      !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

    console.log('[PDF] Launching Puppeteer browser...', {
      platform: process.platform,
      isServerless,
    });

    if (isServerless) {
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 1024 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      const puppeteer = (await import('puppeteer')).default;
      browser = (await puppeteer.launch({
        headless: true,
        args:
          process.platform !== 'win32'
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : [],
      })) as unknown as Browser;
    }
    console.log('[PDF] Browser launched successfully');
  } catch (err) {
    console.error('[PDF] Failed to launch browser:', err);
    throw new Error(`Browser launch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return browser;
}

export async function generateMinutesHtmlPdf(
  params: MinutesHtmlPdfParams
): Promise<Buffer> {
  try {
    console.log('[PDF] Starting PDF generation for meeting:', params.meeting.id);

    console.log('[PDF] Generating HTML...');
    const html = generateMinutesHtml(params);
    console.log('[PDF] HTML generated, length:', html.length);

    console.log('[PDF] Getting browser...');
    const browserInstance = await getBrowser();

    let page = null;
    try {
      console.log('[PDF] Creating new page...');
      page = await browserInstance.newPage();

      console.log('[PDF] Setting page content...');
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      // The embedded faces decode off the main parse; printing before they are
      // ready would lay the page out against the fallback metrics we are trying
      // to get away from.
      await page.evaluate(() => document.fonts.ready);
      console.log('[PDF] Content set, generating PDF...');

      // Margins are given in millimetres, not as bare numbers: a bare number is
      // CSS pixels (10 ≈ 2.6mm), which is what left the sheet's own 12mm
      // gutters fighting the .page block's padding. Owning the margins here
      // means every sheet gets them, including the second sheet of a narrative
      // that spills over.
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
        printBackground: true,
      });

      console.log('[PDF] PDF generated, size:', pdf.length, 'bytes');
      return Buffer.from(pdf);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeErr) {
          console.warn('[PDF] Warning closing page:', closeErr);
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PDF] Error during PDF generation:', errorMsg, err);
    if (errorMsg.includes('Connection closed') || errorMsg.includes('Target closed')) {
      console.error('[PDF] Browser connection lost, will reconnect on next request');
      browser = null;
    }
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
