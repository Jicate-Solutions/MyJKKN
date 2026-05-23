import puppeteer, { Browser } from 'puppeteer';
import { BosMeeting, BosMeetingAttendee, BosAgendaItem, BosMemberType } from '@/types/bos';

const MEMBER_TYPE_ORDER: Record<BosMemberType, number> = {
  chairman: 1, university_nominee: 2, subject_expert: 3, industry_expert: 4,
  alumni: 5, internal_member: 6, hod: 7, startup: 8, facilitator: 9, principal: 10,
};

function memberTypeRank(t: BosMemberType | null | undefined): number {
  return t ? (MEMBER_TYPE_ORDER[t] ?? 99) : 99;
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
      line-height: 1.5;
      color: #000;
      background: white;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 12mm 15mm;
      background: white;
      page-break-after: always;
    }

    .header {
      text-align: center;
      margin-bottom: 14px;
      padding-bottom: 8px;
      position: relative;
      border-bottom: 1px solid #ddd;
    }

    .header-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15mm;
      margin-bottom: 10px;
      padding-bottom: 8px;
    }

    .header-logo {
      width: 20mm;
      height: 20mm;
      flex-shrink: 0;
    }

    .header-center {
      flex: 0 1 auto;
      text-align: center;
      min-width: 0;
    }

    .header-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 3px;
      letter-spacing: 0.5px;
      color: #000;
    }

    .header-accreditation {
      font-size: 8px;
      margin-bottom: 2px;
      line-height: 1.3;
      color: #333;
    }

    .header-address {
      font-size: 9px;
      font-weight: bold;
      margin-top: 3px;
      color: #000;
    }

    .officials {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0;
      padding: 8px 0;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      font-size: 9px;
      gap: 20px;
    }

    .official-left {
      text-align: left;
      flex: 1;
      padding-right: 10mm;
    }

    .official-right {
      text-align: right;
      flex: 1;
      padding-left: 10mm;
    }

    .official-name {
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 1px;
    }

    .official-role {
      font-size: 9px;
    }

    .official-contact {
      font-size: 8px;
      margin-top: 0.5px;
    }

    .section-title {
      font-size: 13px;
      font-weight: bold;
      margin-top: 10px;
      margin-bottom: 8px;
    }

    .section-subtitle {
      font-size: 12px;
      font-weight: bold;
      margin-top: 12px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      page-break-after: avoid;
    }

    .metadata-table {
      width: 100%;
      margin-bottom: 12px;
      margin-top: 10px;
      border-collapse: collapse;
    }

    .metadata-table td {
      padding: 5px 6px;
      border: 1px solid #000;
      font-size: 10px;
    }

    .metadata-table td:first-child {
      font-weight: bold;
      width: 25%;
      background: #f0f0f0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10px;
      page-break-inside: avoid;
    }

    tr {
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #000;
      padding: 8px 8px;
      text-align: left;
      font-family: 'Times New Roman', serif;
      page-break-inside: avoid;
      height: auto;
      vertical-align: top;
    }

    th {
      background: #c0c0c0;
      font-weight: bold;
      height: 24px;
      text-align: center;
      padding: 8px 4px;
      font-size: 10px;
    }

    tbody tr {
      height: auto;
    }

    tbody tr td:first-child {
      text-align: center;
      font-weight: 500;
    }

    tbody tr td:nth-child(4) {
      text-align: center;
      font-weight: 600;
    }

    tbody tr td:nth-child(5) {
      text-align: center;
    }

    .status-present { color: #008000; font-weight: bold; }
    .status-absent { color: #b40000; font-weight: bold; }

    .attendance-title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin: 12px 0 10px 0;
      letter-spacing: 0.3px;
    }

    .board-name {
      font-weight: bold;
      margin-bottom: 10px;
      font-size: 10px;
    }

    .narrative {
      margin: 15px 0;
      padding: 10px;
      border: 1px solid #000;
      font-size: 11px;
      line-height: 1.6;
      text-align: justify;
      font-family: 'Times New Roman', serif;
    }

    .agenda-item {
      margin: 10px 0;
      padding: 8px;
      background: #f9f9f9;
      font-size: 10px;
    }

    .agenda-number {
      font-weight: bold;
    }

    .attendance-note {
      font-size: 10px;
      margin: 10px 0 12px 0;
      padding: 8px 0;
      border-bottom: 1px solid #ddd;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <!-- Page 1: Attendance Sheet -->
  <div class="page">
    <div class="header">
      <div class="header-banner">
        ${logoImage ? `<img src="${logoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
        <div class="header-center">
          <div class="header-title">${htmlEscape(institutionName)}</div>
          ${institutionAccreditation ? `<div class="header-accreditation">${htmlEscape(institutionAccreditation)}</div>` : ''}
          <div class="header-address">${htmlEscape(institutionAddress)}</div>
        </div>
        ${rightLogoImage ? `<img src="${rightLogoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
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
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join('   ')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="attendance-title">ATTENDANCE SHEET</div>

    <div class="board-name">Name of the board: ${htmlEscape(boardTitle)}</div>
    <div class="attendance-note">
      Meeting No. ${meeting.meeting_number} / ${meeting.academic_year} | Date: ${formatDate(meeting.actual_date || meeting.scheduled_date)} | Venue: ${htmlEscape(meeting.venue || '—')}
    </div>

    <div class="section-subtitle" style="margin-top: 8px;">ATTENDANCE (${present.length} Present / ${attendees.length} Total)</div>
    <table>
      <thead>
        <tr>
          <th style="width: 8%;">S.No</th>
          <th style="width: 24%;">Name</th>
          <th style="width: 28%;">Designation</th>
          <th style="width: 13%;">Status</th>
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
              <td>${i + 1}</td>
              <td>${htmlEscape(member.display_name ?? '—')}</td>
              <td>${htmlEscape(member.display_designation ?? '')}</td>
              <td><span class="${statusClass}">${status}</span></td>
              <td></td>
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
        ${logoImage ? `<img src="${logoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
        <div class="header-center">
          <div class="header-title">${htmlEscape(institutionName)}</div>
          ${institutionAccreditation ? `<div class="header-accreditation">${htmlEscape(institutionAccreditation)}</div>` : ''}
          <div class="header-address">${htmlEscape(institutionAddress)}</div>
        </div>
        ${rightLogoImage ? `<img src="${rightLogoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
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
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join('   ')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="attendance-title">MINUTES OF BOARD OF STUDIES MEETING</div>

    <div class="board-name">Name of the board: ${htmlEscape(boardTitle)}</div>

    <table class="metadata-table">
      <tr><td>Meeting No.</td><td>${meeting.meeting_number} / ${meeting.academic_year}</td></tr>
      <tr><td>Date</td><td>${formatDate(meeting.actual_date || meeting.scheduled_date)}</td></tr>
      <tr><td>Start Time</td><td>${formatTime(meeting.actual_start_time || meeting.scheduled_time)}</td></tr>
      <tr><td>Venue</td><td>${htmlEscape(meeting.venue || '—')}</td></tr>
      <tr><td>Chairman</td><td>${htmlEscape(chairmanName)}</td></tr>
    </table>

    <div class="attendance-note">
      Attendance: ${present.length} Present / ${attendees.length} Total (see attendance sheet on page 1).
    </div>

    ${agendaItems.length > 0 ? `
      <div class="section-subtitle">MEETING AGENDA</div>
      ${agendaItems.sort((a, b) => a.sort_order - b.sort_order).map(item => `
        <div class="agenda-item">
          <span class="agenda-number">${item.item_number}. ${htmlEscape(item.item_title)}</span>
          ${item.discussion_notes ? `<br><em>Discussion: ${htmlEscape(item.discussion_notes)}</em>` : ''}
          ${item.resolution_text ? `<br>Resolution: ${htmlEscape(item.resolution_text)}` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${meeting.minutes_content?.narrative_html ? `
      <div class="section-subtitle">MINUTES NARRATIVE</div>
      <div class="narrative">
        ${stripHtml(meeting.minutes_content.narrative_html)}
      </div>
    ` : ''}

    ${meeting.minutes_summary ? `
      <div class="section-subtitle">SUMMARY</div>
      <div class="narrative">
        ${htmlEscape(meeting.minutes_summary)}
      </div>
    ` : ''}
  </div>

  <!-- Signatures Page -->
  <div class="page">
    <div class="header">
      <div class="header-banner">
        ${logoImage ? `<img src="${logoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
        <div class="header-center">
          <div class="header-title">${htmlEscape(institutionName)}</div>
          ${institutionAccreditation ? `<div class="header-accreditation">${htmlEscape(institutionAccreditation)}</div>` : ''}
          <div class="header-address">${htmlEscape(institutionAddress)}</div>
        </div>
        ${rightLogoImage ? `<img src="${rightLogoImage}" class="header-logo" alt="Logo">` : '<div style="width: 18mm;"></div>'}
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
          ${contactWeb || contactEmail ? `<div class="official-contact">${[contactWeb && `Web: ${htmlEscape(contactWeb)}`, contactEmail && `E-Mail: ${htmlEscape(contactEmail)}`].filter(Boolean).join('   ')}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="section-subtitle">SIGNATURES OF BOARD MEMBERS</div>
    <table>
      <thead>
        <tr>
          <th style="width: 8%;">S.No</th>
          <th style="width: 48%;">Members</th>
          <th style="width: 44%;">Signature</th>
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
              <td>${i + 1}</td>
              <td>${lines.map(l => htmlEscape(l)).join('<br>')}</td>
              <td></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div style="margin-top: 30px; font-size: 10px; color: #666;">
      Generated on ${new Date().toLocaleString('en-IN')}
    </div>
  </div>
</body>
</html>
  `;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    try {
      const args = process.platform !== 'win32'
        ? ['--no-sandbox', '--disable-setuid-sandbox']
        : [];

      console.log('[PDF] Launching Puppeteer browser...', { platform: process.platform, args });
      browser = await puppeteer.launch({
        headless: 'new',
        args,
      });
      console.log('[PDF] Browser launched successfully');
    } catch (err) {
      console.error('[PDF] Failed to launch browser:', err);
      throw new Error(`Browser launch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    const browser = await getBrowser();

    console.log('[PDF] Creating new page...');
    const page = await browser.newPage();

    try {
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
      await page.close();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PDF] Error during PDF generation:', errorMsg, err);
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
