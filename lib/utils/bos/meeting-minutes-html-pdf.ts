import puppeteer, { Browser } from 'puppeteer';
import { BosMeeting, BosMeetingAttendee, BosAgendaItem, BosMemberType } from '@/types/bos';

const MEMBER_TYPE_ORDER: Record<BosMemberType, number> = {
  chairman: 1, university_nominee: 2, subject_expert: 3, industry_expert: 4,
  alumni: 5, internal_member: 6, hod: 7, startup: 8, facilitator: 9, principal: 10,
};

function memberTypeRank(t: string | null | undefined): number {
  // Catalog-name values (20260710150000) aren't in the enum map — rank 99.
  return t ? ((MEMBER_TYPE_ORDER as Record<string, number>)[t] ?? 99) : 99;
}

function sortAttendeesForPdf(attendees: BosMeetingAttendee[]): BosMeetingAttendee[] {
  return [...attendees].sort((a, b) => {
    const ma = (a as unknown as { member?: { member_type?: BosMemberType | null } }).member ?? {};
    const mb = (b as unknown as { member?: { member_type?: BosMemberType | null } }).member ?? {};
    const rankDiff = memberTypeRank(ma.member_type) - memberTypeRank(mb.member_type);
    if (rankDiff !== 0) return rankDiff;
    const maSort = (a as unknown as { member?: { sort_order?: number | null } }).member?.sort_order ?? 0;
    const mbSort = (b as unknown as { member?: { sort_order?: number | null } }).member?.sort_order ?? 0;
    if (maSort !== mbSort) return maSort - mbSort;
    const maName = (a as unknown as { member?: { display_name?: string } }).member?.display_name ?? '';
    const mbName = (b as unknown as { member?: { display_name?: string } }).member?.display_name ?? '';
    return maName.localeCompare(mbName);
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

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
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

  const boardTitle = [boardType, boardName].filter(Boolean).join(' - ').toUpperCase() || 'BOARD OF STUDIES';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Minutes of Board of Studies Meeting</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      color: #000;
      background: white;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 12mm 12mm;
      background: white;
      page-break-after: always;
      position: relative;
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
      font-size: 10px;
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
      font-size: 10px;
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

    .footer {
      margin-top: 14px;
      padding-top: 8px;
      font-size: 8px;
      color: #666;
      text-align: right;
    }
  </style>
</head>
<body>
  <!-- Page 1: Attendance Sheet -->
  <div class="page">
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
      <div class="officials">
        <div class="official-left">
          <div class="official-name">${htmlEscape(secretaryName)}</div>
          <div class="official-role">Secretary</div>
        </div>
        <div class="official-right">
          <div class="official-name">${htmlEscape(principalName)}</div>
          <div class="official-role">${htmlEscape(principalTitle)}</div>
          ${contactCell ? `<div class="official-contact">Cell: ${htmlEscape(contactCell)}</div>` : ''}
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join(' | ')}</div>` : ''}
        </div>
      </div>
    </div>

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
          <th style="width: 28%;">Designation</th>
          <th style="width: 12%;">Status</th>
          <th style="width: 27%;">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((a, i) => {
          const member = (a as unknown as { member?: { display_name?: string; display_designation?: string } }).member ?? {};
          const status = a.attendance_status === 'present' ? 'Present' : 'Absent';
          const statusClass = a.attendance_status === 'present' ? 'status-present' : 'status-absent';
          return `
            <tr>
              <td style="width: 5%;">${i + 1}</td>
              <td style="width: 28%;">${htmlEscape(member.display_name ?? '—')}</td>
              <td style="width: 28%;">${htmlEscape(member.display_designation ?? '')}</td>
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
      <div class="officials">
        <div class="official-left">
          <div class="official-name">${htmlEscape(secretaryName)}</div>
          <div class="official-role">Secretary</div>
        </div>
        <div class="official-right">
          <div class="official-name">${htmlEscape(principalName)}</div>
          <div class="official-role">${htmlEscape(principalTitle)}</div>
          ${contactCell ? `<div class="official-contact">Cell: ${htmlEscape(contactCell)}</div>` : ''}
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join(' | ')}</div>` : ''}
        </div>
      </div>
    </div>

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
        ${stripHtml(meeting.minutes_content.narrative_html)}
      </div>
    ` : ''}

    ${meeting.minutes_summary ? `
      <div class="section-title">Summary</div>
      <div class="narrative">
        ${htmlEscape(meeting.minutes_summary)}
      </div>
    ` : ''}

    <div class="footer">Generated on ${new Date().toLocaleString('en-IN')}</div>
  </div>

  <!-- Page 3: Signatures -->
  <div class="page">
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
      <div class="officials">
        <div class="official-left">
          <div class="official-name">${htmlEscape(secretaryName)}</div>
          <div class="official-role">Secretary</div>
        </div>
        <div class="official-right">
          <div class="official-name">${htmlEscape(principalName)}</div>
          <div class="official-role">${htmlEscape(principalTitle)}</div>
          ${contactCell ? `<div class="official-contact">Cell: ${htmlEscape(contactCell)}</div>` : ''}
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join(' | ')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="section-title">Signatures of Board Members</div>

    <table style="table-layout: fixed;">
      <thead>
        <tr>
          <th style="width: 8%;">S.No</th>
          <th style="width: 60%;">Members</th>
          <th style="width: 32%;">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${presentSorted.map((a, i) => {
          const m = (a as unknown as { member?: { display_name?: string; display_designation?: string; display_institution?: string; address?: string; member_type?: BosMemberType | null } }).member ?? {};
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
              <td style="height: 45px;"></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div class="footer">Generated on ${new Date().toLocaleString('en-IN')}</div>
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
    const args = process.platform !== 'win32'
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : [];

    console.log('[PDF] Launching Puppeteer browser...', { platform: process.platform, args });
    browser = await puppeteer.launch({
      headless: true,
      args,
    });
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
      console.log('[PDF] Content set, generating PDF...');

      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
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
