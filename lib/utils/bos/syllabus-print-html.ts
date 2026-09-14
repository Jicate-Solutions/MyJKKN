// lib/utils/bos/syllabus-print-html.ts
//
// Print layout for the downloadable course document (the PDF the API-key
// routes stream to COE and the `?as=pdf` path can reuse). A4-first: institution
// letterhead, boxed course header, numbered objectives, CO table, unit-wise
// content in the Anna University "UNIT I  TITLE  9" style, books, CO-PO matrix,
// signature strip. Empty sections are omitted and missing fields never print
// as "undefined".
//
// The legacy on-screen HTML export (generatePdfHtml in syllabus-pdf-html.ts)
// is untouched; this file is only reached through buildSyllabusHtml(forPrint).

import type {
  BosCourseSyllabus,
  BosCourseObjectivesContent,
  BosCourseLearnOutcomesContent,
  BosCourseContentData,
  BosBooksData,
  BosWebResourcesData,
  BosPedagogyData,
  BosPOMappingsData,
  BosAssessmentStructure,
  BosTextbook,
  BosUnit,
} from '@/types/bos';
import { PDF_FONT_STACK, pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';

export interface PrintInstitution {
  name: string;
  city?: string | null;
  state?: string | null;
  institutionType?: string | null;
  accreditedBy?: string | null;
}

export interface SyllabusPrintOptions {
  institution?: PrintInstitution;
  regulationCode?: string | null;
  boardName?: string | null;
  includeMappings: boolean;
  includeReferences: boolean;
  includePedagogy: boolean;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const text = (s: unknown): string => (typeof s === 'string' ? s.trim() : s == null ? '' : String(s));

// Printed document title (uppercased by CSS). Hoisted so the printed word is
// a single identifier-like literal.
const DOC_TITLE = 'Syllabus';

const CSS = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm 14mm 16mm; }
  body { font-family: ${PDF_FONT_STACK}; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; background: #fff; }
  .letterhead { text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 12px; }
  .letterhead .inst { font-size: 15pt; font-weight: bold; letter-spacing: 0.02em; text-transform: uppercase; }
  .letterhead .sub { font-size: 9.5pt; color: #333; margin-top: 2px; }
  .letterhead .reg { font-size: 10pt; font-weight: bold; margin-top: 4px; }
  .doc-title { text-align: center; font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; margin: 6px 0 8px; }
  table { border-collapse: collapse; width: 100%; }
  table.course-head { margin: 0 0 12px; font-size: 10.5pt; }
  table.course-head th, table.course-head td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
  table.course-head th { background: #f2f2f2; font-weight: bold; text-align: center; white-space: nowrap; }
  table.course-head td.center { text-align: center; }
  table.course-head td.title { font-weight: bold; font-size: 12pt; text-transform: uppercase; }
  h2.sec { font-size: 11.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.03em; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #111; page-break-after: avoid; }
  ol.plain { margin: 0 0 4px 22px; padding: 0; }
  ol.plain li { margin: 0 0 3px; }
  table.grid { margin: 4px 0 8px; font-size: 10.5pt; }
  table.grid th, table.grid td { border: 1px solid #111; padding: 4px 7px; vertical-align: top; text-align: left; }
  table.grid th { background: #f2f2f2; font-weight: bold; text-align: center; }
  table.grid td.c, table.grid th.c { text-align: center; }
  table.grid td.b { font-weight: bold; white-space: nowrap; }
  .unit { margin: 8px 0 6px; page-break-inside: avoid; }
  .unit-head { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; font-size: 11pt; border-bottom: 1px dotted #666; padding-bottom: 1px; margin-bottom: 3px; }
  .unit-head .hrs { font-weight: bold; white-space: nowrap; margin-left: 12px; }
  .unit p { margin: 2px 0 2px 14px; text-align: justify; }
  .unit p.ch-title { font-weight: bold; margin-left: 14px; }
  .unit p.remarks { font-style: italic; color: #333; }
  .totals { text-align: right; font-weight: bold; margin: 4px 0 2px; }
  ol.biblio { margin: 0 0 4px 22px; padding: 0; font-size: 10.5pt; }
  ol.biblio li { margin: 0 0 3px; }
  table.map { margin: 4px 0 4px; font-size: 9.5pt; text-align: center; }
  table.map th, table.map td { border: 1px solid #111; padding: 3px 4px; }
  table.map th { background: #f2f2f2; }
  table.map td.co { font-weight: bold; text-align: left; padding-left: 6px; white-space: nowrap; }
  .legend { font-size: 9pt; color: #333; margin: 0 0 6px; }
  .note { font-size: 10pt; margin: 4px 0; }
  table.sign { margin: 26px 0 0; font-size: 10pt; page-break-inside: avoid; }
  table.sign td { width: 33.33%; text-align: center; padding: 26px 6px 0; border: 0; }
  table.sign td .line { border-top: 1px solid #111; padding-top: 4px; font-weight: bold; }
  .doc-meta { font-size: 8.5pt; color: #444; margin-top: 14px; border-top: 1px solid #bbb; padding-top: 4px; }
`;

function letterhead(opts: SyllabusPrintOptions): string {
  const inst = opts.institution;
  if (!inst) return '';
  const place = [text(inst.city), text(inst.state)].filter(Boolean).join(', ');
  const tags = [
    inst.institutionType && /autonomous/i.test(inst.institutionType) ? 'An Autonomous Institution' : '',
    inst.accreditedBy ? `Accredited by ${text(inst.accreditedBy)}` : '',
  ].filter(Boolean);
  const sub = [tags.join(' | '), place].filter(Boolean).join(' &middot; ');
  return `<div class="letterhead">
  <div class="inst">${esc(inst.name)}</div>
  ${sub ? `<div class="sub">${sub}</div>` : ''}
  ${opts.regulationCode ? `<div class="reg">Regulation ${esc(opts.regulationCode)}</div>` : ''}
</div>`;
}

function courseHeader(doc: BosCourseSyllabus, opts: SyllabusPrintOptions): string {
  const content = doc.course_content as BosCourseContentData | undefined;
  const periods = text(content?.total_hours) || (doc.total_hours != null ? String(doc.total_hours) : '');
  const placement =
    doc.semester != null ? `Semester ${doc.semester}` : doc.academic_year != null ? `Year ${doc.academic_year}` : '';
  const kind = content?.is_practical ? 'Practical' : content?.is_project ? 'Project' : 'Theory';
  const extraCells: string[] = [];
  if (placement) extraCells.push(`<th>Placement</th><td class="center">${esc(placement)}</td>`);
  if (text(doc.stream)) extraCells.push(`<th>Stream</th><td class="center">${esc(doc.stream)}</td>`);
  if (text(opts.boardName)) extraCells.push(`<th>Board</th><td class="center">${esc(opts.boardName)}</td>`);

  return `<table class="course-head">
  <tr><th style="width:16%">Course Code</th><td class="center b" style="width:18%">${esc(doc.course_code)}</td><th style="width:14%">Course Title</th><td class="title">${esc(doc.course_name)}</td></tr>
  <tr><th>Credits</th><td class="center">${doc.course_credits ?? '&ndash;'}</td><th>Total Periods</th><td class="center">${periods ? esc(periods) : '&ndash;'}${doc.contact_hours != null ? ` &nbsp;(${esc(doc.contact_hours)} contact hrs/week)` : ''}</td></tr>
  <tr><th>Course Type</th><td class="center">${kind}</td><th>Version</th><td class="center">v${doc.version_number}${doc.is_latest ? ' (current)' : ''}${doc.last_modified_at ? ` &middot; ${new Date(doc.last_modified_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</td></tr>
  ${extraCells.length ? `<tr>${extraCells.slice(0, 2).join('')}${extraCells.length === 1 ? '<th></th><td></td>' : ''}</tr>` : ''}
</table>`;
}

function objectives(doc: BosCourseSyllabus): string {
  const items = ((doc.course_objectives as BosCourseObjectivesContent | undefined)?.objectives ?? []).filter((o) => text(o.description));
  if (!items.length) return '';
  return `<h2 class="sec">Course Objectives</h2>
<ol class="plain">${items.map((o) => `<li>${esc(o.description)}</li>`).join('')}</ol>`;
}

function outcomes(doc: BosCourseSyllabus): string {
  const clos = ((doc.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined)?.clos ?? []).filter((c) => text(c.description));
  if (!clos.length) return '';
  const hasK = clos.some((c) => (c.k_values ?? []).length > 0);
  return `<h2 class="sec">Course Learning Outcomes (COs)</h2>
<p class="note">On successful completion of the course, learners will be able to:</p>
<table class="grid">
  <thead><tr><th style="width:11%">CO</th><th>Outcome</th>${hasK ? '<th style="width:16%">Bloom\'s Level</th>' : ''}</tr></thead>
  <tbody>${clos.map((c) => `<tr><td class="c b">CO${c.clo_number}</td><td>${esc(c.description)}</td>${hasK ? `<td class="c">${esc((c.k_values ?? []).join(', '))}</td>` : ''}</tr>`).join('')}</tbody>
</table>`;
}

function unitBlock(u: BosUnit): string {
  const title = [text(u.unit_id) ? `UNIT ${esc(u.unit_id)}` : '', text(u.unit_title) ? esc(u.unit_title) : ''].filter(Boolean).join(' &nbsp;&ndash;&nbsp; ');
  const hrs = text(u.hours);
  const bodies = (u.chapters ?? []).map((ch) => {
    const title = text(ch.title);
    const sections = text(ch.sections);
    const topics = (ch.subtopics ?? []).map((s) => text(s.title)).filter(Boolean);
    // CAS rows keep the whole unit text in `title` ("Blood: Blood components,
    // …"); engineering rows keep a short chapter label plus `subtopics`. A long
    // title with no subtopics is prose: bold only its leading "Label:" run.
    let head = '';
    const prose = [title, sections].filter(Boolean).join(' – ');
    if (prose) {
      const colon = prose.indexOf(':');
      if (!topics.length && prose.length > 60 && colon > 0 && colon < 60) {
        head = `<p><strong>${esc(prose.slice(0, colon + 1))}</strong>${esc(prose.slice(colon + 1))}</p>`;
      } else if (!topics.length && prose.length > 60) {
        head = `<p>${esc(prose)}</p>`;
      } else {
        head = `<p class="ch-title">${esc(prose)}</p>`;
      }
    }
    return `${head}${topics.length ? `<p>${topics.map(esc).join(' &ndash; ')}</p>` : ''}`;
  }).join('');
  const nursing = [
    (u.learning_outcomes ?? []).length ? `<p><strong>Learning outcomes:</strong> ${u.learning_outcomes!.map(esc).join('; ')}</p>` : '',
    (u.teaching_activities ?? []).length ? `<p><strong>Teaching / learning activities:</strong> ${u.teaching_activities!.map(esc).join('; ')}</p>` : '',
    (u.assessment_methods ?? []).length ? `<p><strong>Assessment methods:</strong> ${u.assessment_methods!.map(esc).join('; ')}</p>` : '',
  ].join('');
  return `<div class="unit">
  <div class="unit-head"><span>${title || 'UNIT'}</span>${hrs ? `<span class="hrs">${esc(hrs)} periods</span>` : ''}</div>
  ${bodies}${nursing}${text(u.remarks) ? `<p class="remarks">${esc(u.remarks)}</p>` : ''}
</div>`;
}

function contentSection(doc: BosCourseSyllabus): string {
  const c = doc.course_content as BosCourseContentData | undefined;
  if (!c) return '';
  const parts: string[] = [];

  if (c.is_practical && (c.topics?.length ?? 0) > 0) {
    const numbered = c.number_practical_topics !== false;
    parts.push(`<h2 class="sec">List of Experiments</h2>
<table class="grid">
  <thead><tr><th style="width:9%">S.No</th><th>Experiment</th></tr></thead>
  <tbody>${(c.topics ?? []).map((t, i) => `<tr><td class="c">${numbered ? t.number ?? i + 1 : i + 1}</td><td>${esc(t.title)}${(t.subtopics?.length ?? 0) ? `<ol class="plain">${t.subtopics!.map((s) => `<li>${esc(s.title)}</li>`).join('')}</ol>` : ''}</td></tr>`).join('')}</tbody>
</table>`);
  } else if (c.is_project && (c.project_units?.length ?? 0) > 0) {
    parts.push(`<h2 class="sec">Project Guidelines</h2>${(c.project_units ?? []).map((pu) => `<div class="unit">
  <div class="unit-head"><span>${[text(pu.unit_id) ? `UNIT ${esc(pu.unit_id)}` : '', esc(pu.unit_title)].filter(Boolean).join(' &nbsp;&ndash;&nbsp; ')}</span></div>
  ${(pu.rules ?? []).map((r) => `<p><strong>${esc(r.unit_of_experiment)}</strong>${text(r.content) ? ` &ndash; ${esc(r.content)}` : ''}</p>`).join('')}
</div>`).join('')}`);
  } else if ((c.units?.length ?? 0) > 0) {
    parts.push(`<h2 class="sec">Course Content</h2>${c.units.map(unitBlock).join('')}`);
    // Closing total only when the units themselves carry periods (engineering
    // "9 / 9+3" markers) or the content block states one. doc.total_hours is
    // already in the header and for CAS rows it is a weekly figure.
    const unitHours = c.units.map((u) => Number(String(u.hours ?? '').split('+')[0])).filter((n) => Number.isFinite(n) && n > 0);
    const total = text(c.total_hours) || (unitHours.length === c.units.length && unitHours.length ? String(unitHours.reduce((a, b) => a + b, 0)) : '');
    if (total) parts.push(`<p class="totals">Total: ${esc(total)} periods</p>`);
  }

  if (text(c.instruction)) parts.push(`<p class="note"><strong>Instruction:</strong> ${esc(c.instruction)}</p>`);
  return parts.join('');
}

function bookLine(b: BosTextbook): string {
  const title = text(b.title);
  const year = b.publication_year ? String(b.publication_year) : '';
  // Imported rows often carry "Title, Edition, Publisher, 2017" in the title
  // itself — don't print the year (or publisher) a second time.
  const bits = [
    title,
    text(b.author),
    text(b.publisher) && !title.toLowerCase().includes(text(b.publisher).toLowerCase()) ? text(b.publisher) : '',
    year && !title.includes(year) ? year : '',
  ].filter(Boolean);
  return esc(bits.join(', '));
}

function books(doc: BosCourseSyllabus, opts: SyllabusPrintOptions): string {
  if (!opts.includeReferences) return '';
  const data = doc.textbooks as BosBooksData | undefined;
  const primary = (data?.primary ?? []).filter((b) => text(b.title));
  const refs = (data?.references ?? []).filter((b) => text(b.title));
  const web = ((doc.web_resources as BosWebResourcesData | undefined)?.resources ?? []).filter((r) => text(r.title) || text(r.url));
  const parts: string[] = [];
  if (primary.length) parts.push(`<h2 class="sec">Text Books</h2><ol class="biblio">${primary.map((b) => `<li>${bookLine(b)}</li>`).join('')}</ol>`);
  if (refs.length) parts.push(`<h2 class="sec">Reference Books</h2><ol class="biblio">${refs.map((b) => `<li>${bookLine(b)}</li>`).join('')}</ol>`);
  if (web.length) parts.push(`<h2 class="sec">Web Resources</h2><ol class="biblio">${web.map((r) => `<li>${esc(text(r.title) || r.url)}${text(r.title) && text(r.url) ? ` &ndash; ${esc(r.url)}` : ''}</li>`).join('')}</ol>`);
  return parts.join('');
}

function pedagogy(doc: BosCourseSyllabus, opts: SyllabusPrintOptions): string {
  if (!opts.includePedagogy) return '';
  const methods = ((doc.pedagogy as BosPedagogyData | undefined)?.methods ?? []).map(text).filter(Boolean);
  if (!methods.length) return '';
  return `<h2 class="sec">Pedagogy</h2><p class="note">${methods.map(esc).join('; ')}.</p>`;
}

function assessment(doc: BosCourseSyllabus): string {
  const a = doc.assessment_structure as BosAssessmentStructure | undefined;
  const comps = (a?.components ?? []).filter((c) => text(c.component));
  if (!comps.length) return '';
  const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0);
  return `<h2 class="sec">Assessment</h2>
<table class="grid">
  <thead><tr><th style="width:9%">S.No</th><th>Component</th><th style="width:14%">Marks</th></tr></thead>
  <tbody>${comps.map((c, i) => `<tr><td class="c">${c.sno ?? i + 1}</td><td>${esc(c.component)}</td><td class="c">${c.marks ?? '&ndash;'}</td></tr>`).join('')}
  <tr><td colspan="2" style="text-align:right;font-weight:bold;">Total</td><td class="c b">${total}</td></tr></tbody>
</table>`;
}

function mappingMatrix(doc: BosCourseSyllabus, opts: SyllabusPrintOptions): string {
  if (!opts.includeMappings) return '';
  const rows = ((doc.po_mappings as BosPOMappingsData | undefined)?.mappings ?? []).filter((m) => text(m.co_id));
  if (!rows.length) return '';
  const byNum = (a: string, b: string) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0) || a.localeCompare(b);
  const poKeys = [...new Set(rows.flatMap((m) => Object.keys(m.pos ?? {})))].sort(byNum);
  const psoKeys = [...new Set(rows.flatMap((m) => Object.keys(m.psos ?? {})))].sort(byNum);
  if (!poKeys.length && !psoKeys.length) return '';
  const values = rows.flatMap((m) => [...Object.values(m.pos ?? {}), ...Object.values(m.psos ?? {})]).map((v) => String(v ?? '').trim().toUpperCase());
  const numeric = values.some((v) => /^[123]$/.test(v));
  const legend = numeric ? '3 &ndash; High &nbsp;|&nbsp; 2 &ndash; Medium &nbsp;|&nbsp; 1 &ndash; Low' : 'H &ndash; High &nbsp;|&nbsp; M &ndash; Medium &nbsp;|&nbsp; L &ndash; Low';
  const cell = (v: unknown) => { const s = String(v ?? '').trim(); return s ? esc(s.toUpperCase()) : '&ndash;'; };
  return `<h2 class="sec">CO &ndash; PO / PSO Mapping</h2>
<table class="map">
  <thead><tr><th>CO</th>${poKeys.map((k) => `<th>${esc(k)}</th>`).join('')}${psoKeys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((m) => `<tr><td class="co">${esc(m.co_id.toUpperCase())}</td>${poKeys.map((k) => `<td>${cell(m.pos?.[k])}</td>`).join('')}${psoKeys.map((k) => `<td>${cell(m.psos?.[k])}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
<p class="legend">${legend}</p>`;
}

function signatures(): string {
  return `<table class="sign"><tr>
  <td><div class="line">Course Designer</div></td>
  <td><div class="line">Chairman, Board of Studies</div></td>
  <td><div class="line">Principal</div></td>
</tr></table>`;
}

/**
 * Full A4 document for one course. Includes the embedded font faces so the
 * output is identical on Vercel (no Times there) and locally.
 */
export function buildSyllabusPrintHtml(doc: BosCourseSyllabus, opts: SyllabusPrintOptions): string {
  const body = [
    letterhead(opts),
    `<div class="doc-title">${DOC_TITLE}</div>`,
    courseHeader(doc, opts),
    objectives(doc),
    outcomes(doc),
    contentSection(doc),
    books(doc, opts),
    pedagogy(doc, opts),
    assessment(doc),
    mappingMatrix(doc, opts),
    text(doc.notes) && !/^Imported from/i.test(text(doc.notes)) ? `<h2 class="sec">Notes</h2><p class="note">${esc(doc.notes)}</p>` : '',
    signatures(),
    `<p class="doc-meta">${esc(doc.course_code)} &middot; ${esc(doc.course_name)} &middot; version ${doc.version_number} &middot; generated from MyJKKN on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>`,
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(doc.course_code)} &ndash; ${esc(doc.course_name)}</title>
<style>${pdfFontFaceCss()}${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
