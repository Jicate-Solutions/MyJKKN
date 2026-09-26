// lib/utils/bos/po-pso-print-html.ts
//
// Print layout for the downloadable "Programme Outcomes & Programme Specific
// Outcomes" document of one programme + regulation (/bos/po-pso → Download
// PDF). The letterhead reproduces the BoS course-document download
// (course-syllabus-pdf.ts: left logo, institution name, accreditation line,
// address, right logo — branding from getInstitutionHeader) and the tables use
// the same A4 language as syllabus-print-html.ts so the two read as one set:
// letterhead, boxed programme header, PO table, PSO table, signature strip. (The Course – PO/PSO matrix stays on screen only — removed
// from the document 2026-09-25 by request.) Empty sections are omitted and
// missing fields never print as "undefined".

import { PDF_FONT_STACK, pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';

/** Letterhead lines — same fields the course-document PDF header draws. */
export interface PoPsoPrintLetterhead {
  institution_name: string;
  institution_accreditation?: string | null;
  institution_address?: string | null;
  /** `data:` URIs (inlined PNGs) — Puppeteer setContent cannot fetch /public. */
  leftLogo?: string | null;
  rightLogo?: string | null;
}

export interface PoPsoPrintOutcome {
  code: string;
  description: string | null | undefined;
}

export interface PoPsoPrintDoc {
  letterhead?: PoPsoPrintLetterhead;
  /** Institution display name for the programme header table + footer. */
  institutionName?: string | null;
  regulationCode?: string | null;
  regulationYear?: string | null;
  programmeCode: string;
  programmeName?: string | null;
  departmentName?: string | null;
  pos: PoPsoPrintOutcome[];
  psos: PoPsoPrintOutcome[];
  generatedAt?: Date;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const text = (s: unknown): string => (typeof s === 'string' ? s.trim() : s == null ? '' : String(s));

// Outcome descriptions imported from HTML/DOCX sources are stored with literal
// entities ("Problem-Solving &amp; Ethical Leadership"); decode the common ones
// once so esc() prints "&" instead of "&amp;".
const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');

const DOC_TITLE = 'Programme Outcomes (POs) &amp; Programme Specific Outcomes (PSOs)';

const CSS = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm 14mm 16mm; }
  body { font-family: ${PDF_FONT_STACK}; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; background: #fff; }
  .letterhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 4mm; margin: 0 0 6mm; }
  .letterhead .logo { width: 16mm; height: 16mm; flex: 0 0 16mm; }
  .letterhead .logo img { width: 16mm; height: 16mm; object-fit: contain; display: block; }
  .letterhead .mid { flex: 1 1 auto; text-align: center; padding-top: 1mm; }
  .letterhead .inst { font-size: 13pt; font-weight: bold; text-transform: uppercase; line-height: 1.2; }
  .letterhead .accr { font-size: 8pt; margin-top: 1.5mm; line-height: 1.25; }
  .letterhead .addr { font-size: 10pt; font-weight: bold; margin-top: 2mm; }
  .doc-title { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; margin: 6px 0 10px; }
  table { border-collapse: collapse; width: 100%; }
  table.prog-head { margin: 0 0 12px; font-size: 10.5pt; }
  table.prog-head th, table.prog-head td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
  table.prog-head th { background: #f2f2f2; font-weight: bold; text-align: left; white-space: nowrap; width: 18%; }
  table.prog-head td.title { font-weight: bold; text-transform: uppercase; }
  h2.sec { font-size: 11.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #111; page-break-after: avoid; }
  table.grid { margin: 4px 0 8px; font-size: 10.5pt; }
  table.grid th, table.grid td { border: 1px solid #111; padding: 4px 7px; vertical-align: top; text-align: left; }
  table.grid th { background: #f2f2f2; font-weight: bold; text-align: center; }
  table.grid td.c, table.grid th.c { text-align: center; }
  table.grid td.b { font-weight: bold; white-space: nowrap; }
  table.grid td.j { text-align: justify; }
  table.grid tr { page-break-inside: avoid; }
  .empty { font-size: 10pt; color: #444; font-style: italic; margin: 2px 0 6px; }
  table.sign { margin: 26px 0 0; font-size: 10pt; page-break-inside: avoid; }
  table.sign td { width: 33.33%; text-align: center; padding: 26px 6px 0; border: 0; }
  table.sign td .line { border-top: 1px solid #111; padding-top: 4px; font-weight: bold; }
  .doc-meta { font-size: 8.5pt; color: #444; margin-top: 14px; border-top: 1px solid #bbb; padding-top: 4px; }
`;

function letterhead(doc: PoPsoPrintDoc): string {
  const lh = doc.letterhead;
  if (!lh) return '';
  const logo = (src: string | null | undefined) =>
    `<div class="logo">${src ? `<img src="${src}" alt="">` : ''}</div>`;
  return `<div class="letterhead">
  ${logo(lh.leftLogo)}
  <div class="mid">
    <div class="inst">${esc(lh.institution_name)}</div>
    ${text(lh.institution_accreditation) ? `<div class="accr">${esc(lh.institution_accreditation)}</div>` : ''}
    ${text(lh.institution_address) ? `<div class="addr">${esc(lh.institution_address)}</div>` : ''}
  </div>
  ${logo(lh.rightLogo)}
</div>`;
}

function programmeHeader(doc: PoPsoPrintDoc): string {
  const reg = [text(doc.regulationCode), text(doc.regulationYear) && `(${text(doc.regulationYear)})`]
    .filter(Boolean)
    .join(' ');
  const rows: Array<[string, string, string]> = [
    ['Programme', esc(doc.programmeName || doc.programmeCode), 'title'],
    ['Programme Code', esc(doc.programmeCode), ''],
  ];
  if (text(doc.departmentName)) rows.push(['Department', esc(doc.departmentName), '']);
  if (reg) rows.push(['Regulation', esc(reg), '']);
  if (text(doc.institutionName)) rows.push(['Institution', esc(doc.institutionName), '']);
  return `<table class="prog-head">
  <tbody>${rows.map(([k, v, cls]) => `<tr><th>${k}</th><td${cls ? ` class="${cls}"` : ''}>${v}</td></tr>`).join('')}</tbody>
</table>`;
}

function outcomeTable(title: string, colTitle: string, rows: PoPsoPrintOutcome[], emptyCopy: string): string {
  const body = rows.length
    ? `<table class="grid">
  <thead><tr><th style="width:12%">Code</th><th>${colTitle}</th></tr></thead>
  <tbody>${rows.map((r) => `<tr><td class="b c">${esc(r.code)}</td><td class="j">${esc(decodeEntities(text(r.description))) || '&ndash;'}</td></tr>`).join('')}</tbody>
</table>`
    : `<p class="empty">${emptyCopy}</p>`;
  return `<h2 class="sec">${title}</h2>\n${body}`;
}

function signatures(): string {
  return `<table class="sign"><tr>
  <td><div class="line">Head of the Department</div></td>
  <td><div class="line">Chairman, Board of Studies</div></td>
  <td><div class="line">Principal</div></td>
</tr></table>`;
}

/**
 * Full A4 document for one programme + regulation. Includes the embedded
 * font faces so the output is identical on Vercel (no Times there) and
 * locally.
 */
export function buildPoPsoPrintHtml(doc: PoPsoPrintDoc): string {
  const generated = (doc.generatedAt ?? new Date()).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const body = [
    letterhead(doc),
    `<div class="doc-title">${DOC_TITLE}</div>`,
    programmeHeader(doc),
    outcomeTable('Programme Outcomes (POs)', 'Programme Outcome', doc.pos, 'No active Programme Outcomes recorded for this programme and regulation.'),
    outcomeTable('Programme Specific Outcomes (PSOs)', 'Programme Specific Outcome', doc.psos, 'No active Programme Specific Outcomes recorded for this programme and regulation.'),
    signatures(),
    `<p class="doc-meta">${esc(doc.programmeCode)}${text(doc.programmeName) ? ` &middot; ${esc(doc.programmeName)}` : ''}${text(doc.regulationCode) ? ` &middot; Regulation ${esc(doc.regulationCode)}` : ''} &middot; generated from MyJKKN on ${generated}</p>`,
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(doc.programmeCode)} &ndash; POs &amp; PSOs</title>
<style>${pdfFontFaceCss()}${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
