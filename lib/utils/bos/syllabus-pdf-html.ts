// lib/utils/bos/syllabus-pdf-html.ts
//
// HTML builders for the syllabus PDF. Lifted VERBATIM from
// app/api/bos/syllabus/[id]/export-pdf/route.ts so the session route and the
// API-key routes (app/api/api-management/academic/syllabus/*) render the same
// document. Any layout change here reaches both callers.

import { BosCourseSyllabus } from '@/types/bos';
import { isPharmacyModel, modelUniversityHeader } from '@/lib/services/bos/academic-model';
import { generatePharmacyFormat } from '@/lib/utils/bos/pharmacy-syllabus-html';
import { generateV35SyllabusHtml } from '@/lib/utils/bos/course-syllabus-html';
import { pdfFontFaceCss } from '@/lib/utils/bos/pdf-fonts';
import { buildSyllabusPrintHtml, type PrintInstitution } from '@/lib/utils/bos/syllabus-print-html';

export type SyllabusPdfFormat = 'official' | 'meeting_summary' | 'obe' | 'v35';

export const SYLLABUS_PDF_FORMATS: readonly SyllabusPdfFormat[] = ['official', 'meeting_summary', 'obe', 'v35'];

export function isSyllabusPdfFormat(v: string | null | undefined): v is SyllabusPdfFormat {
  return !!v && (SYLLABUS_PDF_FORMATS as readonly string[]).includes(v);
}

/**
 * Formats a given syllabus can actually render.
 * - Pharmacy / AHS models own their layout (generatePharmacyFormat) regardless
 *   of `format`, so only `official` is meaningful for them.
 * - `v35` needs at least one of the five Fink's/Capstone JSONB blocks.
 */
export function supportedFormats(s: BosCourseSyllabus): SyllabusPdfFormat[] {
  if (isPharmacyModel(s.academic_model)) return ['official'];
  const formats: SyllabusPdfFormat[] = ['official', 'meeting_summary', 'obe'];
  const hasV35 = !!(s.concept_applications || s.assessment_pattern || s.capstone_project || s.capstone_rubric || s.llc_conference);
  if (hasV35) formats.push('v35');
  return formats;
}

export interface BuildSyllabusHtmlOptions extends SyllabusPdfOptions {
  /** Shown in the v35 branded header (falls back to institution?.name). */
  institutionName?: string;
  /** Letterhead for the print layout. */
  institution?: PrintInstitution;
  regulationCode?: string | null;
  boardName?: string | null;
  /**
   * Print mode (the PDF routes). `official` switches to the A4 print layout in
   * syllabus-print-html.ts (letterhead, boxed header, CO-PO matrix, no empty
   * sections); pharmacy models keep their own layout; other formats get the
   * embedded @font-face stack injected so Chromium renders the same glyphs
   * (Tamil, serif) as the minutes / call-letter PDFs. Off for the
   * browser-download HTML path, which stays byte-identical.
   */
  forPrint?: boolean;
}

/** Single entry point: pick the generator for `format`, optionally switch to the print layout. */
export function buildSyllabusHtml(
  doc: BosCourseSyllabus,
  format: SyllabusPdfFormat,
  options: BuildSyllabusHtmlOptions,
): string {
  if (options.forPrint && format === 'official' && !isPharmacyModel(doc.academic_model)) {
    return buildSyllabusPrintHtml(doc, {
      institution: options.institution ?? (options.institutionName ? { name: options.institutionName } : undefined),
      regulationCode: options.regulationCode,
      boardName: options.boardName,
      includeMappings: options.includeMappings,
      includeReferences: options.includeReferences,
      includePedagogy: options.includePedagogy,
    });
  }
  const html = format === 'v35'
    ? generateV35SyllabusHtml(doc, { institutionName: options.institutionName ?? options.institution?.name })
    : generatePdfHtml(doc, format, options);
  if (!options.forPrint) return html;
  const fonts = `<style>${pdfFontFaceCss()}</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${fonts}</head>`) : fonts + html;
}

// Hoisted so the document <title> stays byte-identical to the pre-lift output.
const PDF_DOC_TITLE = 'Syllabus';

export interface SyllabusPdfOptions {
  includeMappings: boolean;
  includeReferences: boolean;
  includePedagogy: boolean;
}

export function generatePdfHtml(
  doc: BosCourseSyllabus,
  format: 'official' | 'meeting_summary' | 'obe',
  options: SyllabusPdfOptions
): string {
  const courseObj = doc.course_objectives as unknown as Record<string, unknown> | null;
  const cloData = doc.course_learning_outcomes as unknown as Record<string, unknown> | null;
  const contentData = doc.course_content as unknown as Record<string, unknown> | null;
  const textbooksData = doc.textbooks as unknown as Record<string, unknown> | null;
  const resourcesData = doc.web_resources as unknown as Record<string, unknown> | null;
  const pedagogyData = doc.pedagogy as unknown as Record<string, unknown> | null;
  const mappingsData = doc.po_mappings as unknown as Record<string, unknown> | null;

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${PDF_DOC_TITLE}: ${doc.course_code}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
          h2 { color: #34495e; margin-top: 20px; }
          h3 { color: #7f8c8d; }
          table { border-collapse: collapse; width: 100%; margin: 10px 0; }
          th, td { border: 1px solid #bdc3c7; padding: 8px; text-align: left; }
          th { background-color: #ecf0f1; }
          .metadata { background-color: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .section { margin: 20px 0; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
  `;

  // Header — pharmacy (COP) models show the university/regulator and
  // semester/year placement instead of the generic Stream line.
  const pharmacy = isPharmacyModel(doc.academic_model);
  const placement = pharmacy
    ? doc.academic_model === 'pci_pharm'
      ? (doc.semester ? `Semester ${doc.semester}` : '')
      : (doc.academic_year ? `Year ${doc.academic_year}` : '')
    : '';
  html += `
    <h1>${doc.course_code}: ${doc.course_name}</h1>
    <div class="metadata">
      ${pharmacy ? `<p><strong>Regulation:</strong> ${modelUniversityHeader(doc.academic_model)}</p>` : ''}
      ${pharmacy && placement ? `<p><strong>Placement:</strong> ${placement}</p>` : ''}
      <p><strong>Course Credits:</strong> ${doc.course_credits || 'N/A'}</p>
      ${pharmacy ? '' : `<p><strong>Stream:</strong> ${doc.stream || 'General'}</p>`}
      <p><strong>Version:</strong> ${doc.version_number}</p>
      <p><strong>Status:</strong> ${doc.is_latest ? 'Latest' : 'Archived'}</p>
      <p><strong>Last Modified:</strong> ${new Date(doc.last_modified_at).toLocaleDateString()}</p>
    </div>
  `;

  // Format-specific content. Pharmacy (COP) models have no CO-PO/Bloom — they
  // use a dedicated layout (Scope + Objectives + Content + Books + Exam Scheme
  // + Internship) regardless of the requested `format`.
  if (pharmacy) {
    html += generatePharmacyFormat(doc, options);
  } else if (format === 'official') {
    html += generateOfficalFormat(doc, cloData, contentData, textbooksData, resourcesData, pedagogyData, mappingsData, options);
  } else if (format === 'meeting_summary') {
    html += generateMeetingSummaryFormat(doc, mappingsData);
  } else if (format === 'obe') {
    html += generateObeFormat(doc, cloData, contentData, mappingsData, options);
  }

  html += `
      </body>
    </html>
  `;

  return html;
}

function generateOfficalFormat(
  doc: BosCourseSyllabus,
  cloData: Record<string, unknown> | null,
  contentData: Record<string, unknown> | null,
  textbooksData: Record<string, unknown> | null,
  resourcesData: Record<string, unknown> | null,
  pedagogyData: Record<string, unknown> | null,
  mappingsData: Record<string, unknown> | null,
  options: SyllabusPdfOptions
): string {
  let html = '';

  // Course Objectives
  html += `<div class="section"><h2>Course Objectives</h2>`;
  if (doc.course_objectives) {
    const objectives = doc.course_objectives as Record<string, unknown>;
    const objs = objectives.objectives as Array<Record<string, unknown>> || [];
    html += '<ol>';
    objs.forEach(obj => {
      html += `<li>${obj.description || ''}</li>`;
    });
    html += '</ol>';
  }
  html += '</div>';

  // Course Learning Outcomes
  html += `<div class="section"><h2>Course Learning Outcomes (CLOs)</h2>`;
  if (cloData) {
    const clos = cloData.clos as Array<Record<string, unknown>> || [];
    html += '<table><thead><tr><th>CLO</th><th>Description</th><th>K-Values</th></tr></thead><tbody>';
    clos.forEach((clo: Record<string, unknown>) => {
      const kValues = (clo.k_values as string[])?.join(', ') || '';
      html += `<tr><td>${clo.clo_number}</td><td>${clo.description}</td><td>${kValues}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // Course Content
  html += `<div class="section"><h2>Course Content</h2>`;
  if (contentData) {
    const units = contentData.units as Array<Record<string, unknown>> || [];
    units.forEach((unit: Record<string, unknown>) => {
      html += `<h3>Unit ${unit.unit_id}: ${unit.unit_title}</h3>`;
      const chapters = unit.chapters as Array<Record<string, unknown>> || [];
      chapters.forEach((chapter: Record<string, unknown>) => {
        html += `<p><strong>Chapter ${chapter.chapter_number}: ${chapter.title}</strong></p>`;
        if (chapter.sections) html += `<p>${chapter.sections}</p>`;
        const subtopics = chapter.subtopics as Array<Record<string, unknown>> || [];
        if (subtopics.length > 0) {
          html += '<ul style="margin: 4px 0 10px 24px; padding-left: 0;">';
          subtopics.forEach((st: Record<string, unknown>) => {
            html += `<li><strong>${chapter.chapter_number}.${st.number}</strong> ${st.title ?? ''}</li>`;
          });
          html += '</ul>';
        }
      });
    });
  }
  html += '</div>';

  // Textbooks
  if (options.includeReferences) {
    html += `<div class="section"><h2>Textbooks & References</h2>`;
    if (textbooksData) {
      const textbooks = textbooksData.primary as Array<Record<string, unknown>> || [];
      html += '<h3>Primary Textbooks</h3><ol>';
      textbooks.forEach((book: Record<string, unknown>) => {
        html += `<li>${book.title} by ${book.author} (${book.publication_year}), ${book.publisher}</li>`;
      });
      html += '</ol>';

      const references = textbooksData.references as Array<Record<string, unknown>> || [];
      if (references.length > 0) {
        html += '<h3>Reference Books</h3><ol>';
        references.forEach((book: Record<string, unknown>) => {
          html += `<li>${book.title} by ${book.author}</li>`;
        });
        html += '</ol>';
      }
    }
    html += '</div>';
  }

  // Web Resources
  if (options.includeReferences) {
    html += `<div class="section"><h2>Web Resources</h2>`;
    if (resourcesData) {
      const resources = resourcesData.resources as Array<Record<string, unknown>> || [];
      html += '<ul>';
      resources.forEach((resource: Record<string, unknown>) => {
        html += `<li><a href="${resource.url}">${resource.title}</a></li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
  }

  // Pedagogy
  if (options.includePedagogy) {
    html += `<div class="section"><h2>Pedagogical Methods</h2>`;
    if (pedagogyData) {
      const methods = pedagogyData.methods as string[] || [];
      html += '<ul>';
      methods.forEach(method => {
        html += `<li>${method}</li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
  }

  // PO Mappings
  if (options.includeMappings) {
    html += `<div class="section"><h2>Programme Outcome Mappings</h2>`;
    if (mappingsData) {
      const mappings = mappingsData.mappings as Array<Record<string, unknown>> || [];
      html += '<table><thead><tr><th>CO/CLO</th><th>PO Alignment</th></tr></thead><tbody>';
      mappings.forEach((mapping: Record<string, unknown>) => {
        const pos = mapping.pos as Record<string, string> || {};
        const poStr = Object.entries(pos).map(([k, v]) => `${k}:${v}`).join(', ');
        html += `<tr><td>${mapping.co_id}</td><td>${poStr}</td></tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
  }

  return html;
}

function generateMeetingSummaryFormat(
  doc: BosCourseSyllabus,
  mappingsData: Record<string, unknown> | null
): string {
  let html = `<div class="section"><h2>Meeting Summary</h2>`;

  html += `<div class="metadata">
    <p><strong>Course:</strong> ${doc.course_code} - ${doc.course_name}</p>
    <p><strong>Action:</strong> ${doc.is_latest ? 'Approved' : 'Archived'}</p>
  </div>`;

  html += `<div class="section"><h2>Course Learning Outcomes</h2>`;
  if (doc.course_learning_outcomes) {
    const cloData = doc.course_learning_outcomes as Record<string, unknown>;
    const clos = cloData.clos as Array<Record<string, unknown>> || [];
    html += '<ol>';
    clos.forEach((clo: Record<string, unknown>) => {
      html += `<li>${clo.description}</li>`;
    });
    html += '</ol>';
  }
  html += '</div>';

  if (doc.notes) {
    html += `<div class="section"><h2>Meeting Notes</h2><p>${doc.notes}</p></div>`;
  }

  html += '</div>';
  return html;
}

function generateObeFormat(
  doc: BosCourseSyllabus,
  cloData: Record<string, unknown> | null,
  contentData: Record<string, unknown> | null,
  mappingsData: Record<string, unknown> | null,
  options: SyllabusPdfOptions
): string {
  let html = `<div class="section"><h2>OBE Framework - Lesson Planning Guide</h2>`;

  html += `<div class="section"><h2>Learning Outcomes Alignment</h2>`;
  if (cloData) {
    const clos = cloData.clos as Array<Record<string, unknown>> || [];
    html += '<table><thead><tr><th>CLO</th><th>Description</th><th>Assessment Method</th></tr></thead><tbody>';
    clos.forEach((clo: Record<string, unknown>) => {
      html += `<tr><td>CLO ${clo.clo_number}</td><td>${clo.description}</td><td>Direct & Indirect</td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  html += `<div class="section"><h2>Content Delivery Plan</h2>`;
  if (contentData) {
    const units = contentData.units as Array<Record<string, unknown>> || [];
    html += '<table><thead><tr><th>Unit</th><th>Topics</th><th>Hours</th></tr></thead><tbody>';
    units.forEach((unit: Record<string, unknown>) => {
      html += `<tr><td>${unit.unit_id}</td><td>${unit.unit_title}</td><td>-</td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  if (options.includeMappings && mappingsData) {
    html += `<div class="section"><h2>Programme Outcome Mapping</h2>`;
    const mappings = mappingsData.mappings as Array<Record<string, unknown>> || [];
    html += '<table><thead><tr><th>CLO</th><th>PO</th><th>Level</th></tr></thead><tbody>';
    mappings.forEach((mapping: Record<string, unknown>) => {
      const pos = mapping.pos as Record<string, string> || {};
      Object.entries(pos).forEach(([poCode, level]) => {
        html += `<tr><td>${mapping.co_id}</td><td>${poCode}</td><td>${level}</td></tr>`;
      });
    });
    html += '</tbody></table>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}
