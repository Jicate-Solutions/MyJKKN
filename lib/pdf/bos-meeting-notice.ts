/**
 * BoS Meeting Call Letter PDF Generator
 *
 * Renders a personalised call-letter / invitation PDF for each Board-of-
 * Studies member. Mirrors the format of the JKKN sample (Capt.Dr.M.NALINI
 * signature, "Dear Sir/Madam", numbered agenda, "TA & DA will be paid as
 * per norms" etc.).
 *
 * Layout:
 *   1. JKKN letterhead — left logo, institution name + accreditation + address,
 *      officials block (Secretary | Principal+contact), right logo.
 *   2. "To" + Date row.
 *   3. Addressee block (member name, designation, department, institution, address).
 *   4. "Dear Sir/Madam," salutation.
 *   5. Indented "Sub: …" subject line.
 *   6. Indented body paragraph with the meeting date inlined.
 *   7. "Agenda:" heading + numbered list.
 *   8. Closing lines: "Kindly accept our invitation..." + "TA & DA will be paid...".
 *   9. Signature block: "With Warm Regards," / PRINCIPAL / institution name / address.
 *
 * Each recipient gets a unique PDF, so generation happens INSIDE the send loop
 * (one Puppeteer browser is shared across all renders for the batch).
 */

import puppeteerCore, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { BosMeeting, BosAgendaItem } from '@/types/bos';
import { PDF_FONT_STACK, pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';
import type { InstitutionPdfHeader } from '@/lib/utils/internal-marks/institution-header';

// =============================================================================
// IMAGE LOADER
// =============================================================================

function urlToBase64(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    if (url.startsWith('/')) {
      const filePath = join(process.cwd(), 'public', url);
      const buffer = readFileSync(filePath);
      const ext = url.split('.').pop()?.toLowerCase() || 'png';
      const mimeType =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'svg'
            ? 'image/svg+xml'
            : `image/${ext}`;
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    return null;
  } catch (e) {
    console.warn('[bos-meeting-notice] failed to load image:', url, e);
    return null;
  }
}

// =============================================================================
// FORMATTERS
// =============================================================================

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatBodyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  const month = d.toLocaleString('en-IN', { month: 'long' });
  return `${day}<sup>${suffix}</sup> ${month}, ${d.getFullYear()}`;
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** CET letter style: "27.07.2026" (dd.mm.yyyy). */
function formatDotDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** CET letter style: "10.00 AM" (h.mm AM/PM). */
function formatTimeDot(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}.${String(m).padStart(2, '0')} ${ampm}`;
}

/** Governing Body sample style: "11.15 a.m." / "2.30 p.m." */
function formatTimeGb(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  return `${h % 12 || 12}.${String(m).padStart(2, '0')} ${ampm}`;
}

const ORDINALS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth',
  'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
];
function ordinal(n: number | null | undefined): string {
  if (!n || n < 1) return 'First';
  if (n <= ORDINALS.length) return ORDINALS[n - 1];
  // Fallback for >15: "16th", "17th"
  const day = n;
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/** Numeric ordinal: 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th". */
function numOrdinal(n: number | null | undefined): string {
  const v = !n || n < 1 ? 1 : n;
  const rem100 = v % 100;
  const rem10 = v % 10;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : rem10 === 1
        ? 'st'
        : rem10 === 2
          ? 'nd'
          : rem10 === 3
            ? 'rd'
            : 'th';
  return `${v}${suffix}`;
}

/**
 * Word ordinal: 1 → "First", 2 → "Second", 11 → "Eleventh".
 * Used in the "Sub:" line, which spells the meeting number out
 * ("First Board of Studies Meeting"). Falls back to the numeric form
 * ("21st") past the spelled-out range.
 */
const ORDINAL_WORDS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth',
  'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
  'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
];

function wordOrdinal(n: number | null | undefined): string {
  const v = !n || n < 1 ? 1 : n;
  return ORDINAL_WORDS[v - 1] ?? numOrdinal(v);
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip a leading "Department of " so the renderer's own "Department of"
 * prefix never doubles up (e.g. stored value "Department of ECE" →
 * "ECE", rendered as "Department of ECE" not "Department of Department of ECE").
 * Bare values (e.g. "English") pass through unchanged.
 */
function stripDeptPrefix(s: string | null | undefined): string {
  return String(s ?? '').replace(/^\s*department\s+of\s+/i, '').trim();
}

// =============================================================================
// TYPES
// =============================================================================

export interface BosCallLetterRecipient {
  display_name: string;
  display_designation?: string | null;
  /** Rendered as "Department of <value>" in the addressee block when present. */
  display_department?: string | null;
  display_institution?: string | null;
  /** Optional postal address. Currently unused in render but kept for future. */
  address?: string | null;
  /** Rendered as "Mobile: <value>" in the addressee block when present. */
  contact_no?: string | null;
  /**
   * True when this member is an external expert (from the BoS expert directory)
   * rather than internal staff. For Academic Council / Governing Body notices,
   * only external members get the "TA & DA will be paid…" closing lines.
   */
  is_external?: boolean;
  /** Rendered as "Mail ID: <value>" on Governing Body notices when present. */
  email?: string | null;
}

export interface BosCallLetterData {
  meeting: BosMeeting;
  agendaItems: BosAgendaItem[];
  recipient: BosCallLetterRecipient;
  /**
   * Bare board name (e.g. "Computer Science"). The caller is expected to
   * strip any "Board of Studies - " prefix from bos_boards.board_name before
   * passing it in — otherwise the rendered subject line will duplicate the
   * phrase ("Meeting of the PG Board of Studies - Computer Science Board of
   * Studies"). See preview-pdf / notify-members for the canonical stripper.
   */
  boardName: string;
  /**
   * Academic level prefix (e.g. "PG", "UG"). Denormalized onto bos_meetings
   * at meeting-create time from the parent composition's board_type column.
   * When null/empty, the subject + body use boardName alone.
   */
  boardType?: string | null;
  /**
   * Board short code (e.g. "ECE") for the CET letter's Ref line. Optional —
   * falls back to the board name when absent.
   */
  boardCode?: string | null;
  /**
   * Recipient's BoS role (e.g. "University Nominee", "Subject Expert"). Used by
   * the CET letter's default Sub line + "We are happy to have you as …" body.
   */
  memberRole?: string | null;
  /**
   * Fully-composed reference number for this recipient's letter, e.g.
   * "JKKNCET/BoS/ECE/2026-2027/01". Built by the caller because the trailing
   * serial is the member's position in the meeting's roster, which needs a DB
   * round-trip (see lib/utils/bos/call-letter-ref.ts). When absent the CET
   * renderer falls back to a meeting-number-based ref.
   */
  refNo?: string | null;
  header: InstitutionPdfHeader;
  /**
   * Optional per-committee text overrides (bos_email_templates, 20260724140000).
   * The layout is identical across bodies — only these text fragments vary. Each
   * field is already placeholder-substituted by the caller. When a field is
   * absent, the renderer's computed default (meeting-type-derived) is used.
   *
   *   pdf_heading      → replaces the "Sub:" subject line
   *   pdf_intro_html   → replaces the body/intro paragraph(s) (rich HTML)
   *   pdf_closing_html → replaces the closing invitation line (rich HTML)
   *   signoff_html     → extra signature text above the signature image
   */
  bodyFormat?: {
    pdf_heading?: string | null;
    pdf_intro_html?: string | null;
    pdf_closing_html?: string | null;
    signoff_html?: string | null;
  } | null;
}

interface LogoBundle {
  leftLogo: string | null;
  rightLogo: string | null;
  /** Bottom-left circular seal — usually only set for Arts & Science. */
  sealImage: string | null;
  /** Bottom-right principal signature block (PNG with squiggle + title). */
  signImage: string | null;
}

// =============================================================================
// HTML BUILDER
// =============================================================================

/**
 * CET (engineering) BoS call-letter format — reproduces JKKNCET's own printed
 * stationery: the scanned letterhead (green college name + "( An Autonomous
 * Institution )", magenta trust/approval/NAAC/address lines, the Chairperson |
 * Principal names row, and the pink rule), a Ref line + date, "Dear Sir,", a
 * "Sub:" line, greeting + body, an explicit Date/Time block, NO agenda section,
 * and a seal + signature sign-off. Text fields honour the per-committee
 * overrides (bodyFormat) when set, else fall back to CET defaults.
 *
 * The whole letter is tuned to land on ONE A4 page — see the SINGLE-PAGE FIT
 * notes in the stylesheet before changing any vertical spacing.
 */
function buildCetCallLetterHtml(
  data: BosCallLetterData,
  logos: LogoBundle,
): string {
  const { meeting, recipient, boardName, boardCode, header } = data;
  const bodyFormat = data.bodyFormat ?? null;
  const role = (data.memberRole ?? '').trim();

  // ── Letterhead text ───────────────────────────────────────────────────────
  // Transcribed verbatim from the printed CET letterhead, including its own
  // spellings ("NATTRAJA" double-T, "Kumarapalayam") which differ from the
  // shared institution-header config. Hardcoded here rather than sourced from
  // `header.banner_lines` on purpose: those lines also drive the CET syllabus
  // banner, and this letter must not be able to change that PDF.
  const instName = 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY';
  const autonomousLine = '( An Autonomous Institution )';
  const trustLine = '( MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST )';
  const approvalLines = [
    '(Approved by AICTE - New Delhi & Affiliated to Anna University, Chennai)',
    'Recognized by UGC Under Section 2(f) & Accredited by NAAC',
    'Natarajapuram, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
  ];
  // Chairperson (left) / Principal (right) names row above the rule.
  const signatories = header.letterhead_signatories ?? null;
  // The engineering mark is loaded into rightLogo (header.rightLogoImage);
  // leftLogo is the generic trust logo, used only as a last resort.
  const logo = logos.rightLogo || logos.leftLogo;

  // Ref line: JKKNCET/BoS/ECE/2026-2027/01. The caller composes it because the
  // trailing serial is per-recipient (chairman 01, then members in catalog
  // order); this fallback only fires when the caller couldn't resolve it.
  const refNo =
    data.refNo?.trim() ||
    [
      header.ref_prefix ?? 'JKKNCET',
      'BoS',
      (boardCode || boardName || '').trim(),
      (meeting.academic_year ?? '').trim(),
      String(meeting.meeting_number ?? 1).padStart(2, '0'),
    ]
      .filter((s) => !!s)
      .join('/');
  const letterDate = formatDotDate(new Date().toISOString());

  const meetingDot = formatDotDate(meeting.scheduled_date);
  const timeDot = formatTimeDot(meeting.scheduled_time);
  const ord = numOrdinal(meeting.meeting_number);
  const venuePhrase = meeting.venue?.trim() ? escapeHtml(meeting.venue.trim()) : 'department';

  // Addressee — name / designation / Department of <dept> / institution.
  // No "Mobile:" line (CET letter omits it). stripDeptPrefix guards doubling.
  const addr: string[] = [`${escapeHtml(recipient.display_name)},`];
  if (recipient.display_designation) addr.push(`${escapeHtml(recipient.display_designation)},`);
  if (recipient.display_department) {
    addr.push(`Department of ${escapeHtml(stripDeptPrefix(recipient.display_department))},`);
  }
  if (recipient.display_institution) addr.push(`${escapeHtml(recipient.display_institution)},`);

  // Text sections: prefer per-committee overrides (already placeholder-filled),
  // else CET defaults built from the meeting.
  // "Invitation – First Board of Studies Meeting – University Nominee – Reg."
  // Meeting number is spelled out here (wordOrdinal), unlike the body text
  // below which keeps the numeric form.
  const subLine =
    bodyFormat?.pdf_heading?.trim() ||
    `Invitation – ${wordOrdinal(meeting.meeting_number)} Board of Studies Meeting${
      role ? ` – ${role}` : ''
    } – Reg.`;

  const introHtml =
    bodyFormat?.pdf_intro_html?.trim() ||
    `<p class="body-para">Greetings from the Department of ${escapeHtml(boardName)}, JKKNCET.</p>
     <div class="sep">----------------------------------------------</div>
     <p class="body-para">We are glad to inform you that the Department of ${escapeHtml(boardName)} of J.K.K. Nattraja College of Engineering and Technology (Autonomous) is planning to conduct the ${ord} Board of Studies Meeting on <strong>${meetingDot}</strong>${timeDot ? ` at <strong>${escapeHtml(timeDot)}</strong>` : ''} in the ${venuePhrase}.</p>
     <p class="body-para">${role ? `We are happy to have you as <strong>${escapeHtml(role)}</strong> for the Board of Studies. ` : ''}Kindly accept our invitation and share your expertise.</p>`;

  const closingHtml =
    bodyFormat?.pdf_closing_html?.trim() ||
    `<p class="closing">We are expecting your presence and valuable inputs and suggestions for improvement.</p>`;

  // Sign-off is three stacked parts so the signature image can sit where a real
  // one does — between the valediction and the typed designation:
  //
  //     Yours Sincerely,      ← lead (replaced wholesale by signoff_html)
  //     [signature image]     ← seal/sign asset, omitted when unset
  //     Principal – JKKNCET   ← typed designation
  //
  // The typed designation is DROPPED whenever a signature image exists: both the
  // shipped CET stamp and the Arts one already carry "PRINCIPAL" + the college
  // name baked into the scan, so printing it again reads as a duplicate. It is
  // also dropped when signoff_html wins, since an override carries its own.
  const hasSignImage = !!logos.signImage;
  const signoffLeadHtml =
    bodyFormat?.signoff_html?.trim() || `<p>Yours Sincerely,</p>`;
  const signoffTitleHtml =
    bodyFormat?.signoff_html?.trim() || hasSignImage
      ? ''
      : `<p><strong>Principal – ${escapeHtml(header.ref_prefix ?? 'JKKNCET')}</strong></p>`;

  const logoHtml = logo ? `<img src="${logo}" alt="" />` : '';
  const sealHtml = logos.sealImage ? `<img src="${logos.sealImage}" alt="" />` : '';
  const signHtml = logos.signImage
    ? `<img class="sig-img" src="${logos.signImage}" alt="" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Call Letter - ${escapeHtml(recipient.display_name)}</title>
<style>
  /* Embedded faces — see lib/utils/bos/pdf-fonts.ts. The single-page budget
     below is measured in Times; on Vercel the only installed font is Open Sans,
     whose wider glyphs blow that budget. */
  ${pdfFontFaceCss()}

  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; }
  html, body { width: 210mm; font-family: ${PDF_FONT_STACK}; font-size: 12pt; color: #000; background: #fff; line-height: 1.4; }

  /* ── SINGLE-PAGE FIT ──────────────────────────────────────────────────────
     Printable height is 297mm − 2×6mm Puppeteer margin = 285mm. The blocks
     below are budgeted against that: letterhead ≈ 34mm, ref+addressee ≈ 34mm,
     subject+body ≈ 90mm, date/time+closing ≈ 34mm, signature row ≈ 40mm —
     leaving ~50mm of slack for a long addressee or an overridden body.
     If you increase any margin here, re-check a 5-line addressee + a custom
     pdf_intro_html against page 2. */
  .page { width: 210mm; padding: 6mm 14mm 4mm; }

  /* ── Letterhead (mirrors the printed CET stationery) ────────────────────── */
  /* Logo absolutely positioned so the centred text block spans the FULL width —
     that's what keeps the college name and the address each on one line. */
  .letterhead { position: relative; display: flex; align-items: center; min-height: 60pt; }
  .lh-logo { position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 78pt; display: flex; align-items: center; justify-content: center; }
  .lh-logo img { max-width: 100%; max-height: 58pt; object-fit: contain; }
  .lh-body { flex: 1; text-align: center; padding: 1pt 0 0; }
  .lh-name { font-size: 13pt; font-weight: bold; color: #1a7a3d; line-height: 1.15; letter-spacing: 0.2pt; }
  .lh-autonomous { font-size: 9pt; font-weight: bold; color: #1a7a3d; margin-top: 1pt; }
  .lh-trust { font-size: 8.5pt; color: #c2185b; margin-top: 1.5pt; }
  .lh-line { font-size: 8.5pt; font-weight: bold; color: #b0135c; margin-top: 1pt; white-space: nowrap; }

  /* Chairperson (left) | Principal (right) names row, then the pink rule. */
  .lh-officials { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 5pt; }
  .lh-official-name { font-size: 10pt; font-weight: bold; color: #1f1f1f; }
  .lh-official-title { font-size: 9pt; color: #e0407f; }
  .lh-officials .right { text-align: right; }
  .lh-rule { border: none; border-top: 2.2pt solid #e0407f; margin-top: 3pt; }
  .lh-rule-thin { border: none; border-top: 0.8pt solid #e0407f; margin-top: 1.2pt; }

  /* ── Letter body ────────────────────────────────────────────────────────── */
  .ref-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 12pt; font-size: 11pt; }
  .ref-no { font-size: 11pt; }
  .to { margin-top: 10pt; }
  .addressee { margin-top: 2pt; margin-left: 30pt; line-height: 1.45; }
  .salutation { margin-top: 6pt; }
  .sub { margin-top: 9pt; margin-left: 30pt; }
  .sub .sub-label { font-weight: bold; }
  .sub-text { font-weight: bold; }
  .sep { text-align: center; letter-spacing: 1.5pt; margin: 3pt 0; }
  .body-para { margin-top: 7pt; text-align: justify; text-indent: 30pt; line-height: 1.55; }
  .dt { margin-top: 10pt; margin-left: 30pt; line-height: 1.5; }
  .dt-label { font-weight: bold; display: inline-block; width: 46pt; }
  .closing { margin-top: 10pt; text-align: justify; }
  .thanks { margin-top: 8pt; text-align: center; }

  /* ── Signature row: seal centred on the page, stamp at the right ────────── */
  /* The stamp is a normal flex child pushed to the right margin. The seal is
     taken OUT of flow (position:absolute, left:50% + translateX(-50%)) so it
     lands on the page's true horizontal centre — with it in flow, any change to
     the stamp's width would drag the seal off-centre.
     bottom:0 baselines the seal against the bottom of the row however tall each
     image is. break-inside:avoid keeps the seal, the signature and the
     valediction together — a page split here is the single worst-looking
     failure mode of this letter.
     The row's left/right padding is symmetric (14mm each), so the content-box
     centre coincides with the page centre — the seal is centred on both.
     Overlap check (measured at 96dpi, 210mm page = 793.7px): the 78pt seal
     spans 344.8–448.8px; the stamp is right-aligned to the 740.8px content edge
     and is at most 210pt (280px) wide, so it starts no earlier than 460.8px —
     ≥12px of clearance. Widening .sig-img past 210pt would eat into that. */
  .signature-row {
    position: relative;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    margin-top: 14pt;
    gap: 10pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .sig-seal {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: 78pt;
    text-align: center;
  }
  .sig-seal img { max-width: 100%; max-height: 78pt; object-fit: contain; }
  /* flex:0 0 auto (not 1 1 auto) so the block shrinks to the stamp's own width
     rather than stretching leftwards.
     margin-right backs the whole group (valediction + stamp) off the 14mm text
     margin — sitting flush against it reads as cramped on the printed page.
     It shifts the two together, so their mutual centring is unaffected. */
  .sig-block { flex: 0 0 auto; text-align: right; line-height: 1.45; margin-right: 18pt; }
  .sig-block p { margin: 0; }
  /* The valediction is CENTRED over the stamp, not right-aligned to the margin.
     The signature scan carries its own visually-centered content (squiggle +
     name + PRINCIPAL + college + town), so a right-aligned "Yours Sincerely,"
     parks at the column's far edge and reads as detached from the signature it
     introduces. Mirrors .signature-sign .regards in the non-CET layout. */
  .sig-block .signoff-lead { text-align: center; margin-bottom: 2pt; }
  .sig-block .signoff-lead p { margin: 0; }
  /* Sized so the scan's baked-in name + "PRINCIPAL / college / town" lines stay
     legible — it carries the designation, not just a squiggle, and is roughly
     3:2 so the height cap is what binds. */
  .sig-img { display: block; margin: 2pt 0 0 auto; max-width: 210pt; max-height: 104pt; object-fit: contain; }
</style>
</head>
<body>
<div class="page">

  <div class="letterhead">
    <div class="lh-logo">${logoHtml}</div>
    <div class="lh-body">
      <div class="lh-name">${escapeHtml(instName)}</div>
      <div class="lh-autonomous">${escapeHtml(autonomousLine)}</div>
      <div class="lh-trust">${escapeHtml(trustLine)}</div>
      ${approvalLines.map((l) => `<div class="lh-line">${escapeHtml(l)}</div>`).join('\n      ')}
    </div>
  </div>

  ${
    signatories
      ? `<div class="lh-officials">
    <div class="left">
      <div class="lh-official-name">${escapeHtml(signatories.left_name)}</div>
      <div class="lh-official-title">${escapeHtml(signatories.left_title)}</div>
    </div>
    <div class="right">
      <div class="lh-official-name">${escapeHtml(signatories.right_name)}</div>
      <div class="lh-official-title">${escapeHtml(signatories.right_title)}</div>
    </div>
  </div>`
      : ''
  }
  <hr class="lh-rule" />
  <hr class="lh-rule-thin" />

  <div class="ref-row">
    <span class="ref-no">Ref: ${escapeHtml(refNo)}</span>
    <span>${escapeHtml(letterDate)}</span>
  </div>

  <div class="to">To</div>
  <div class="addressee">
    ${addr.map((l) => `<div>${l}</div>`).join('\n    ')}
  </div>

  <div class="salutation">Dear Sir,</div>

  <div class="sub">
    <span class="sub-label">Sub:</span> <span class="sub-text">${escapeHtml(subLine)}</span>
  </div>

  ${introHtml}

  <div class="dt">
    <div><span class="dt-label">Date</span> : ${meetingDot || '—'}</div>
    ${timeDot ? `<div><span class="dt-label">Time</span> : ${escapeHtml(timeDot)}</div>` : ''}
  </div>

  ${closingHtml}

  <p class="thanks">Thanking you,</p>

  <div class="signature-row">
    <div class="sig-seal">${sealHtml}</div>
    <div class="sig-block">
      <div class="signoff-lead">${signoffLeadHtml}</div>
      ${signHtml}
      ${signoffTitleHtml}
    </div>
  </div>

</div>
</body>
</html>`;
}

export function buildCallLetterHtml(
  data: BosCallLetterData,
  logos: LogoBundle,
): string {
  // CET (engineering) uses a dedicated letter format — full letterhead with
  // Ref line, "Dear Sir,", no Agenda section, and a "Yours Sincerely / Principal
  // – JKKNCET" sign-off (matches the department's own BoS call letter). CAS and
  // every other institution keep the original layout below, untouched.
  if (/engineering|technology/i.test(data.header.institution_name || '')) {
    return buildCetCallLetterHtml(data, logos);
  }

  const { meeting, agendaItems, recipient, boardName, boardType, header } = data;
  const bodyFormat = data.bodyFormat ?? null;

  // Compose "UG - Computer Science" / "PG - Mathematics" / etc. when both are
  // present. board_type is null on legacy rows (created before the 20260521
  // migration) — in that case we render the name alone with no leading dash
  // ("Meeting of the Computer Science Board of Studies").
  //
  // Casing rules:
  //   • board_type → uppercased ("ug" → "UG") in case COE ever returns it lower.
  //   • board_name → Title Case, but acronyms (all-uppercase 2+ letter tokens
  //     like "BBA", "TFD", "MCA") are preserved as-is. Without that guard,
  //     "BBA" would become "Bba" which reads as a typo.
  // Council notices (Academic Council / Governing Body) differ from Board of
  // Studies notices:
  //   • title/body say the council name (no "Board of Studies" suffix)
  //   • the "TA & DA will be paid…" closing is external-members-only
  // Governing Body uses its own sample wording (ordinal + "Governing Body
  // Meeting", dd/mm/yyyy date, request paragraph) — see isGb branches below.
  const isGb = meeting.meeting_type === 'governing_body' || boardType === 'governing_body';
  const isAc =
    meeting.meeting_type === 'academic_council' || boardType === 'academic_council';
  const isCouncil = isAc || isGb;
  // Uppercase + turn 'academic_council' → 'ACADEMIC COUNCIL' / 'governing_body'
  // → 'GOVERNING BODY'.
  const formattedType = (boardType?.trim().toUpperCase() ?? '').replace(/_/g, ' ');
  const formattedName = (boardName ?? '')
    .trim()
    .split(/(\s+)/) // capture whitespace so multi-space sequences round-trip
    .map((part) => {
      if (/^\s+$/.test(part) || part.length === 0) return part;
      if (/^[A-Z]{2,}$/.test(part)) return part; // preserve acronym
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');

  const boardLabel = isCouncil
    ? (isGb ? 'Governing Body' : 'ACADEMIC COUNCIL')
    : [formattedType, formattedName].filter((s) => s.length > 0).join(' - ');
  // The " Board of Studies" phrase is appended after the label for BoS notices,
  // but a council body (Academic Council / Governing Body) is not a Board of
  // Studies — omit it.
  const bodySuffix = isCouncil ? '' : ' Board of Studies';

  const institutionName = (header.institution_name ?? '').toUpperCase();
  const accreditation = header.institution_accreditation ?? '';
  const address = header.institution_address ?? '';
  const officials = header.officials;

  const leftLogoHtml = logos.leftLogo
    ? `<img src="${logos.leftLogo}" alt="" />`
    : '';
  const rightLogoHtml = logos.rightLogo
    ? `<img src="${logos.rightLogo}" alt="" />`
    : '';
  // Bottom-of-letter assets — only render when the institution provided
  // them. Engineering doesn't have a seal/sign yet, so its PDF stays clean.
  const sealHtml = logos.sealImage
    ? `<img src="${logos.sealImage}" alt="" />`
    : '';
  const signHtml = logos.signImage
    ? `<img src="${logos.signImage}" alt="" />`
    : '';

  // ── Subject / body date-time / venue ─────────────────────────────────────
  // GB sample: "Meeting of the Third Governing Body - Intimation - Reg."
  //            date as 28/07/2026, time as 11.15 a.m., venue "in the …"
  const meetingOrd = ordinal(meeting.meeting_number ?? 1);
  // Per-body heading override wins over the computed meeting-type default.
  const headingOverride = bodyFormat?.pdf_heading?.trim();
  const subjectText = headingOverride
    ? headingOverride
    : isGb
      ? `Meeting of the ${meetingOrd} Governing Body - Intimation - Reg.`
      : `Meeting of the ${boardLabel}${bodySuffix}${
          meeting.agenda_text
            ? ' - ' + meeting.agenda_text.split('\n')[0].slice(0, 80).trim()
            : ''
        } - Intimation - Reg.`;

  const meetingDateStr = isGb
    ? formatShortDate(meeting.scheduled_date)
    : formatBodyDate(meeting.scheduled_date);
  const meetingTimeStr = isGb
    ? formatTimeGb(meeting.scheduled_time)
    : formatTime(meeting.scheduled_time);
  const venueClause = isGb
    ? (meeting.venue
        ? `in the ${escapeHtml(meeting.venue)} of our college premises`
        : 'in the Board Room of our college premises')
    : (meeting.venue
        ? `at ${escapeHtml(meeting.venue)}`
        : 'in our college premises');

  // ── Agenda list ──────────────────────────────────────────────────────────
  // Each bos_agenda_items row renders its title on its own line (no outer
  // numbering — the title itself often contains a context phrase like
  // "2026-27 Meeting of the PG Mathematics BoS" that's already explicit).
  // Description sits below with white-space: pre-line so internal `\n`
  // (e.g. "1. xxx\n2. yyy") shows as separate numbered sub-lines.
  const agendaSorted = [...(agendaItems ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const agendaItemsHtml =
    agendaSorted.length > 0
      ? agendaSorted
          .map(
            (item) =>
              `<div class="agenda-item">
                ${
                  item.item_title?.trim()
                    ? `<div class="agenda-title">${escapeHtml(item.item_title)}</div>`
                    : ''
                }${
                  item.item_description
                    ? // New descriptions are rich-text HTML (inject as-is so
                      // headings/lists/alignment render). Legacy descriptions are
                      // plain text with \n line breaks — escape them and wrap in
                      // a pre-line span so the breaks survive. Detect by tag.
                      /<[a-z][\s\S]*>/i.test(item.item_description)
                      ? `<div class="agenda-desc">${item.item_description}</div>`
                      : `<div class="agenda-desc agenda-desc-plain">${escapeHtml(item.item_description)}</div>`
                    : ''
                }
              </div>`,
          )
          .join('')
      : (meeting.agenda_text ?? '')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => `<div class="agenda-item">${escapeHtml(l)}</div>`)
          .join('') || '<div class="agenda-item">Any other matter</div>';

  // ── Addressee block ──────────────────────────────────────────────────────
  // Layout per the sample call letter:
  //   Name,
  //   Designation,
  //   Institution / Industry,
  //   Mobile: <contact_no>
  // Missing fields are omitted entirely (no empty lines).
  const addressLines: string[] = [];
  addressLines.push(`${escapeHtml(recipient.display_name)},`);
  if (recipient.display_designation) {
    addressLines.push(`${escapeHtml(recipient.display_designation)},`);
  }
  if (recipient.display_department) {
    // Render with the literal "Department of " prefix so the DB only needs
    // to store the bare department name (e.g. "English"). stripDeptPrefix
    // guards against values that already include "Department of" (which would
    // otherwise render "Department of Department of …").
    addressLines.push(`Department of ${escapeHtml(stripDeptPrefix(recipient.display_department))},`);
  }
  if (recipient.display_institution) {
    addressLines.push(`${escapeHtml(recipient.display_institution)},`);
  }
  if (recipient.contact_no) {
    addressLines.push(`Mobile: ${escapeHtml(recipient.contact_no)}`);
  }
  // GB sample shows Mail ID on the addressee block.
  if (isGb && recipient.email) {
    addressLines.push(`Mail ID: ${escapeHtml(recipient.email)}`);
  }

  // ── Final HTML ───────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Call Letter - ${escapeHtml(recipient.display_name)}</title>
<style>
  /* Embedded faces — see lib/utils/bos/pdf-fonts.ts. */
  ${pdfFontFaceCss()}

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    font-family: ${PDF_FONT_STACK};
    font-size: 12pt;
    color: #000;
    background: #fff;
    line-height: 1.4;
  }
  .page { width: 210mm; padding: 8mm 12mm; }

  /* ── Header ─────────────────────────────────────────────── */
  /* Logo + gap + title widths are tuned so the institution name wraps
     after "ARTS & SCIENCE" rather than after the ampersand. See
     calculation in the PR description: at 16pt bold Times Roman the
     41-char first line needs ≈ 360pt of center-column width, which we
     achieve by shrinking logos to 56pt and the gap to 8pt. */
  .header-row {
    display: flex;
    align-items: center;
    gap: 8pt;
    margin-bottom: 4pt;
  }
  .header-logo { width: 56pt; height: 56pt; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .header-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .header-center { flex: 1; text-align: center; }
  .institution-name {
    font-size: 16pt;
    font-weight: bold;
    color: #000;
    line-height: 1.2;
    letter-spacing: 0;
  }
  .institution-suffix { font-size: 11pt; font-style: italic; }
  .accreditation { font-size: 9pt; margin-top: 2pt; line-height: 1.3; }
  .address-line { font-size: 9pt; font-weight: bold; margin-top: 1pt; }

  /* Officials row — FULL PAGE WIDTH (Secretary flush left edge, Principal flush right edge) */
  .officials-row-full {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 6pt;
    width: 100%;
  }
  .officials-left { text-align: left; font-size: 10pt; }
  .officials-right { text-align: right; font-size: 10pt; }
  .officials-name { font-weight: bold; }
  .officials-title { font-size: 10pt; }
  .officials-contact { font-size: 9pt; margin-top: 1pt; }

  .header-rule { border: none; border-top: 2px solid #000; margin: 6pt 0 10pt 0; }

  /* ── To + Date row ──────────────────────────────────────── */
  .to-date-row {
    display: flex;
    justify-content: space-between;
    margin-top: 6pt;
    font-size: 12pt;
  }
  .date { font-size: 12pt; }

  /* ── Addressee ──────────────────────────────────────────── */
  .addressee {
    margin-top: 4pt;
    margin-left: 24pt;
    line-height: 1.5;
  }
  .addressee .name { font-size: 12pt; }

  /* ── Salutation ─────────────────────────────────────────── */
  .salutation { margin-top: 14pt; }

  /* ── Subject ────────────────────────────────────────────── */
  .subject-block {
    margin-top: 8pt;
    margin-left: 36pt;
    line-height: 1.4;
  }
  .subject-label { font-weight: bold; }
  .subject-sep {
    text-align: center;
    margin-top: 2pt;
    font-size: 12pt;
    letter-spacing: 1.5pt;
  }

  /* ── Body paragraph ─────────────────────────────────────── */
  .body-para {
    margin-top: 8pt;
    text-indent: 28pt;
    text-align: justify;
    line-height: 1.55;
  }

  /* ── Agenda ─────────────────────────────────────────────── */
  .agenda-label {
    margin-top: 10pt;
    font-weight: bold;
  }
  .agenda-list {
    margin-top: 4pt;
    padding-left: 24pt;
    line-height: 1.55;
  }
  .agenda-item {
    margin-bottom: 8pt;
  }
  .agenda-item .agenda-title {
    /* Title shown bare (no outer numbering) on its own line. */
  }
  .agenda-item .agenda-desc {
    margin-top: 2pt;
    text-align: justify;
  }
  /* Legacy plain-text descriptions: preserve \n line breaks. */
  .agenda-item .agenda-desc-plain {
    white-space: pre-line;
  }
  /* Rich-text (HTML) descriptions: normalise the injected editor markup so it
     aligns with the notice body. Inline text-align from the editor overrides
     the container's justify default. */
  .agenda-item .agenda-desc p { margin: 0 0 4pt 0; }
  .agenda-item .agenda-desc ul { margin: 0 0 4pt 0; padding-left: 18pt; list-style: disc; }
  .agenda-item .agenda-desc ol { margin: 0 0 4pt 0; padding-left: 18pt; list-style: decimal; }
  .agenda-item .agenda-desc li { margin: 0 0 2pt 0; }
  .agenda-item .agenda-desc h1,
  .agenda-item .agenda-desc h2,
  .agenda-item .agenda-desc h3 { margin: 4pt 0 2pt 0; font-weight: bold; text-align: left; }
  .agenda-item .agenda-desc h1 { font-size: 13pt; }
  .agenda-item .agenda-desc h2 { font-size: 12pt; }
  .agenda-item .agenda-desc h3 { font-size: 11pt; }
  .agenda-item .agenda-desc:last-child > *:last-child { margin-bottom: 0; }

  /* ── Closing lines ──────────────────────────────────────── */
  .closing-line { margin-top: 8pt; text-align: justify; }

  /* ── Utility: center-align text on any line ─────────────── */
  /* Composed with .closing-line on "Thanking you." so it inherits
     the same vertical rhythm as the other closing paragraphs but
     overrides text-align: justify → center. */
  .center { text-align: center; }

  /* ── Signature row: seal (left) + signature image (right) ─
     The seal is the round green stamp; the signature PNG carries the
     squiggle + PRINCIPAL + college + address text baked-in, so we
     don't repeat those as separate text lines. align-items:flex-end
     keeps both elements baselined at the bottom regardless of their
     individual heights. */
  .signature-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 10pt;
    gap: 16pt;
    /* Keep the whole signature block together on the same page — never let a
       page break split the seal from the signature (or push it to page 2). */
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .signature-seal {
    flex: 0 0 auto;
    width: 82pt;
  }
  .signature-seal img {
    max-width: 100%;
    max-height: 82pt;
    object-fit: contain;
  }
  .signature-sign {
    flex: 0 0 auto;
    text-align: right;
    padding-right: 0;
    line-height: 1.4;
  }
  .signature-sign .regards {
    font-style: italic;
    margin-bottom: 2pt;
    /* Override the parent's text-align: right so the salutation sits above
       the signature PNG's visually-centered content (squiggle + PRINCIPAL +
       college + address). Without this, the salutation parks at the column's
       far-right edge while the signature content is centered — making the
       two read as detached. */
    text-align: center;
  }
  .signature-sign img {
    display: block;
    margin-left: auto;
    max-width: 200pt;
    max-height: 72pt;
    object-fit: contain;
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── Letterhead ────────────────────────────────────────── -->
  <!-- Row 1: logos + institution name (center column constrained by logo widths). -->
  <div class="header-row">
    <div class="header-logo">${leftLogoHtml}</div>
    <div class="header-center">
      <div class="institution-name">${escapeHtml(institutionName)}</div>
      ${accreditation ? `<div class="accreditation">${escapeHtml(accreditation)}</div>` : ''}
      ${address ? `<div class="address-line">${escapeHtml(address)}</div>` : ''}
    </div>
    <div class="header-logo">${rightLogoHtml}</div>
  </div>

  <!-- Row 2: officials block spanning FULL page width (Secretary flush left, Principal flush right). -->
  ${
    officials
      ? `
    <div class="officials-row-full">
      <div class="officials-left">
        <div class="officials-name">${escapeHtml(officials.secretary_name)}</div>
        <div class="officials-title">Secretary</div>
      </div>
      <div class="officials-right">
        <div class="officials-name">${escapeHtml(officials.principal_name)}</div>
        ${officials.contact_cell ? `<div class="officials-contact">Cell: ${escapeHtml(officials.contact_cell)}</div>` : ''}
        ${
          officials.contact_web || officials.contact_email
            ? `<div class="officials-contact">${
                officials.contact_web ? `Web: ${escapeHtml(officials.contact_web)}` : ''
              }${officials.contact_web && officials.contact_email ? '&nbsp;&nbsp;&nbsp;' : ''}${
                officials.contact_email ? `E-Mail: ${escapeHtml(officials.contact_email)}` : ''
              }</div>`
            : ''
        }
      </div>
    </div>
  `
      : ''
  }

  <hr class="header-rule" />

  <!-- ── To + Date ─────────────────────────────────────────── -->
  <div class="to-date-row">
    <span>To</span>
    <span class="date">Date: ${escapeHtml(formatShortDate(new Date().toISOString()))}</span>
  </div>

  <!-- ── Addressee ─────────────────────────────────────────── -->
  <div class="addressee">
    ${addressLines.map((line) => `<div>${line}</div>`).join('\n    ')}
  </div>

  <!-- ── Salutation ────────────────────────────────────────── -->
  <div class="salutation">${isGb ? 'Respected Sir/Madam,' : 'Dear Sir/Madam,'}</div>

  <!-- ── Subject ───────────────────────────────────────────── -->
  <div class="subject-block">
    <div><span class="subject-label">Sub:</span> ${escapeHtml(subjectText)}</div>
    <div class="subject-sep">----------</div>
  </div>

  <!-- ── Body paragraph(s) ─────────────────────────────────── -->
  ${
    // Per-body intro override (rich HTML, already placeholder-substituted)
    // replaces the computed meeting-type paragraph while keeping the layout.
    bodyFormat?.pdf_intro_html?.trim()
      ? `<div class="body-para">${bodyFormat.pdf_intro_html}</div>`
      : isGb
        ? `<p class="body-para">
    We are happy to have the privilege of inviting you for the <strong>${meetingOrd} Governing Body Meeting</strong> to be conducted on <strong>${meetingDateStr}</strong>${meetingTimeStr ? ` at <strong>${escapeHtml(meetingTimeStr)}</strong>` : ''} ${venueClause}.
  </p>
  <p class="body-para">
    We request you to spare your valuable time to attend the meeting and give your suggestions for the development of the college and the students.
  </p>`
        : `<p class="body-para">
    We are happy to have the privilege of inviting you for the <strong>${meetingOrd}</strong> Meeting of ${escapeHtml(boardLabel)}${bodySuffix} to be conducted on <strong>${meetingDateStr}</strong>${meetingTimeStr ? ` at <strong>${escapeHtml(meetingTimeStr)}</strong>` : ''} ${venueClause}.
  </p>`
  }

  <!-- ── Agenda ────────────────────────────────────────────── -->
  <div class="agenda-label">Agenda:</div>
  <div class="agenda-list">
    ${agendaItemsHtml}
  </div>

  <!-- ── Closing ───────────────────────────────────────────── -->
  ${
    // Per-body closing override (rich HTML) wins over the computed defaults.
    // Board of Studies → all members get the invitation line.
    // Academic Council / Governing Body → invitation line only for EXTERNAL
    // members (internal staff don't get the courtesy invitation wording).
    // GB already has its own "spare your valuable time" request paragraph,
    // so skip the shared "Kindly accept our invitation…" line for GB.
    //
    // TEMP: "TA & DA will be paid as per norms." is hidden for all meeting
    // types — restore the TA/DA <p> below when ready to re-enable.
    bodyFormat?.pdf_closing_html?.trim()
      ? `<div class="closing-line">${bodyFormat.pdf_closing_html}</div>`
      : isGb
        ? ''
        : !isCouncil || recipient.is_external
          ? `<p class="closing-line">Kindly accept our invitation and offer your valuable suggestions.</p>`
          : ''
  }
  <p class="closing-line center">Thanking you.</p>

  <!-- ── Signature row (seal left, signature right) ────────── -->
  <div class="signature-row">
    <div class="signature-seal">${sealHtml}</div>
    <div class="signature-sign">
      <div class="regards">With Regards,                </div>
      ${bodyFormat?.signoff_html?.trim() ? `<div class="signoff-text">${bodyFormat.signoff_html}</div>` : ''}
      ${signHtml}
    </div>
  </div>

</div>
</body>
</html>`;
}

// =============================================================================
// PUPPETEER LAUNCHER
// =============================================================================

async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isVercel) {
    const executablePath = await chromium.executablePath();
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1024 },
      executablePath,
      headless: true,
    });
  }
  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  }) as unknown as Promise<Browser>;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Render ONE call-letter PDF. Useful for one-off sends.
 * For batches of N recipients, prefer renderBosCallLetterBatch which shares
 * a single browser instance across all renders.
 */
export async function generateBosCallLetterPdf(
  data: BosCallLetterData,
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    return await renderCallLetterInBrowser(browser, data);
  } finally {
    await browser.close();
  }
}

/**
 * Returned by openBosCallLetterRenderer(). The caller owns the lifecycle —
 * call `render(data)` once per recipient, then `close()` once after the loop.
 */
export interface BosCallLetterRenderer {
  render: (data: BosCallLetterData) => Promise<Buffer>;
  close: () => Promise<void>;
}

/**
 * Open a Puppeteer browser, return a renderer that can produce multiple PDFs
 * before closing. Use this when sending a batch — keeps the browser warm
 * between renders for ~200-500ms per recipient instead of full cold-start.
 */
export async function openBosCallLetterRenderer(): Promise<BosCallLetterRenderer> {
  const browser = await launchBrowser();
  return {
    render: (data) => renderCallLetterInBrowser(browser, data),
    close: () => browser.close(),
  };
}

async function renderCallLetterInBrowser(
  browser: Browser,
  data: BosCallLetterData,
): Promise<Buffer> {
  const leftLogo = urlToBase64('/logo.png');
  const rightLogo = urlToBase64(data.header.rightLogoImage ?? null);
  // Seal + sign are institution-scoped (Arts/Science populates them; engineering
  // doesn't). urlToBase64 returns null for missing/unreadable paths so the
  // HTML builder can conditionally skip the elements.
  const sealImage = urlToBase64(data.header.sealImage ?? null);
  const signImage = urlToBase64(data.header.signImage ?? null);
  const html = buildCallLetterHtml(data, { leftLogo, rightLogo, sealImage, signImage });

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // The embedded faces decode off the main parse; printing before they are
    // ready would lay the single-page budget out against fallback metrics.
    await page.evaluate(() => document.fonts.ready);
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '6mm', bottom: '6mm', left: '6mm', right: '6mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}
