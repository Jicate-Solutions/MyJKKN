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

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
   * rather than internal staff. For Academic Council notices, only external
   * members get the "TA & DA will be paid…" closing lines.
   */
  is_external?: boolean;
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
  header: InstitutionPdfHeader;
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

export function buildCallLetterHtml(
  data: BosCallLetterData,
  logos: LogoBundle,
): string {
  const { meeting, agendaItems, recipient, boardName, boardType, header } = data;

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
  // Academic Council notices differ from Board of Studies notices:
  //   • title/body say "ACADEMIC COUNCIL" (no "Board of Studies" suffix)
  //   • the "TA & DA will be paid…" closing is external-members-only
  const isAc = meeting.meeting_type === 'academic_council' || boardType === 'academic_council';
  // Uppercase + turn 'academic_council' → 'ACADEMIC COUNCIL'.
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

  const boardLabel = isAc
    ? 'ACADEMIC COUNCIL'
    : [formattedType, formattedName].filter((s) => s.length > 0).join(' - ');
  // The " Board of Studies" phrase is appended after the label for BoS notices,
  // but an Academic Council is not a Board of Studies — omit it.
  const bodySuffix = isAc ? '' : ' Board of Studies';

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

  // ── Subject line ─────────────────────────────────────────────────────────
  const subjectText = `Meeting of the ${boardLabel}${bodySuffix}${
    meeting.agenda_text
      ? ' - ' + meeting.agenda_text.split('\n')[0].slice(0, 80).trim()
      : ''
  } - Intimation - Reg.`;

  // ── Inviting paragraph ───────────────────────────────────────────────────
  const meetingOrd = ordinal(meeting.meeting_number ?? 1);
  const meetingDateStr = formatBodyDate(meeting.scheduled_date);
  const meetingTimeStr = formatTime(meeting.scheduled_time);
  const venueClause = meeting.venue
    ? `at ${escapeHtml(meeting.venue)}`
    : 'in our college premises';

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
                <div class="agenda-title">${escapeHtml(item.item_title)}</div>${
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
    // to store the bare department name (e.g. "English"). Mirrors the COE
    // appointment-letter format the user referenced.
    addressLines.push(`Department of ${escapeHtml(recipient.display_department)},`);
  }
  if (recipient.display_institution) {
    addressLines.push(`${escapeHtml(recipient.display_institution)},`);
  }
  if (recipient.contact_no) {
    addressLines.push(`Mobile: ${escapeHtml(recipient.contact_no)}`);
  }

  // ── Final HTML ───────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Call Letter - ${escapeHtml(recipient.display_name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    font-family: 'Times New Roman', serif;
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
    margin-top: 22pt;
    gap: 16pt;
  }
  .signature-seal {
    flex: 0 0 auto;
    width: 110pt;
  }
  .signature-seal img {
    max-width: 100%;
    max-height: 110pt;
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
    max-width: 220pt;
    max-height: 90pt;
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
  <div class="salutation">Dear Sir/Madam,</div>

  <!-- ── Subject ───────────────────────────────────────────── -->
  <div class="subject-block">
    <div><span class="subject-label">Sub:</span> ${escapeHtml(subjectText)}</div>
    <div class="subject-sep">----------</div>
  </div>

  <!-- ── Body paragraph ────────────────────────────────────── -->
  <p class="body-para">
    We are happy to have the privilege of inviting you for the <strong>${meetingOrd}</strong> Meeting of ${escapeHtml(boardLabel)}${bodySuffix} to be conducted on <strong>${meetingDateStr}</strong>${meetingTimeStr ? ` at <strong>${escapeHtml(meetingTimeStr)}</strong>` : ''} ${venueClause}.
  </p>

  <!-- ── Agenda ────────────────────────────────────────────── -->
  <div class="agenda-label">Agenda:</div>
  <div class="agenda-list">
    ${agendaItemsHtml}
  </div>

  <!-- ── Closing ───────────────────────────────────────────── -->
  ${
    // Board of Studies → all members get the invitation + TA/DA lines.
    // Academic Council → only EXTERNAL members do; internal staff (HoDs,
    // Principal, Member Secretary) are not paid TA/DA, so both lines are omitted.
    !isAc || recipient.is_external
      ? `<p class="closing-line">Kindly accept our invitation and offer your valuable suggestions.</p>
  <p class="closing-line">TA &amp; DA will be paid as per norms.</p>`
      : ''
  }
  <p class="closing-line center">Thanking you.</p>

  <!-- ── Signature row (seal left, signature right) ────────── -->
  <div class="signature-row">
    <div class="signature-seal">${sealHtml}</div>
    <div class="signature-sign">
      <div class="regards">With Regards,                </div>
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
