import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, applyInstitutionScope, readableInstitutionIds, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';
import { courseDisplayFor } from '@/lib/utils/bos/coe-course-display';
import { generateV35SyllabusHtml } from '@/lib/utils/bos/course-syllabus-html';
import { BosCourseSyllabus } from '@/types/bos';
import { isPharmacyModel, modelUniversityHeader } from '@/lib/services/bos/academic-model';
import { generatePharmacyFormat } from '@/lib/utils/bos/pharmacy-syllabus-html';

/**
 * GET /api/bos/syllabus/[id]/export-pdf
 *
 * Export syllabus to PDF in multiple formats.
 *
 * Query parameters:
 * - format: 'official' | 'meeting_summary' | 'obe' (default: 'official')
 * - include_mappings: boolean (default: true)
 * - include_references: boolean (default: true)
 * - include_pedagogy: boolean (default: true)
 *
 * Returns: HTML content formatted for PDF rendering.
 * Note: Actual PDF generation can be done client-side (html2pdf) or via headless browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosBoardScope(user.id);
    // View-only observer tier: holder of the view grant who sits on no board reads all institutions (never widens writes).
    const hasView = await hasBosPermission(user.id, 'academic.bos-syllabus.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);

    // Step 3: Parse query parameters
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'official') as 'official' | 'meeting_summary' | 'obe' | 'v35';
    const includeMappings = searchParams.get('include_mappings') !== 'false';
    const includeReferences = searchParams.get('include_references') !== 'false';
    const includePedagogy = searchParams.get('include_pedagogy') !== 'false';

    // Step 4: Fetch syllabus (CAS-aware filter — see syllabus/[id]/route.ts)
    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    const readDb = canReadAllBos ? createServiceRoleClient() : supabase;
    let query = readDb
      .from('bos_course_syllabi')
      .select('*')
      .eq('id', params.id);

    const allowedIds = readableInstitutionIds(scope, canReadAllBos);
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
      }
      query = allowedIds.length === 1
        ? query.eq('institutions_id', allowedIds[0])
        : query.in('institutions_id', allowedIds);
    }

    const { data: syllabus, error } = await query.maybeSingle();

    if (error) {
      console.error('[GET /api/bos/syllabus/[id]/export-pdf] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch syllabus' },
        { status: 500 }
      );
    }

    if (!syllabus) {
      return NextResponse.json(
        { error: 'Syllabus not found' },
        { status: 404 }
      );
    }

    // Prefer the live COE course_code/course_name (resolved by the stable
    // course_id) over the stored snapshot, so a COE rename is reflected in the
    // report. Falls back to the snapshot when course_id is null or COE is down.
    const display = await courseDisplayFor(syllabus as BosCourseSyllabus);
    const syllabusForPdf: BosCourseSyllabus = {
      ...(syllabus as BosCourseSyllabus),
      course_code: display.course_code,
      course_name: display.course_name,
    };

    // Step 5: Generate HTML based on format
    // v3.5: the branded JKKN document (green template, capstone cards, LLC
    // panel) — print-ready, renders the five Fink's/Capstone JSONB columns.
    if (format === 'v35') {
      const { data: inst } = await supabase
        .from('institutions')
        .select('name')
        .eq('id', syllabusForPdf.institutions_id)
        .maybeSingle();
      const v35Html = generateV35SyllabusHtml(syllabusForPdf, {
        institutionName: (inst?.name as string | undefined) ?? undefined,
      });
      return new NextResponse(v35Html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${syllabusForPdf.course_code}-syllabus-v35.html"`,
        },
      });
    }

    const html = generatePdfHtml(
      syllabusForPdf,
      format,
      {
        includeMappings,
        includeReferences,
        includePedagogy,
      }
    );

    // Step 6: Return HTML for PDF generation
    // Client can use html2pdf library to convert this to PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="syllabus-${syllabusForPdf.course_code}-${format}.html"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/syllabus/[id]/export-pdf] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface ExportOptions {
  includeMappings: boolean;
  includeReferences: boolean;
  includePedagogy: boolean;
}

function generatePdfHtml(
  syllabus: BosCourseSyllabus,
  format: 'official' | 'meeting_summary' | 'obe',
  options: ExportOptions
): string {
  const courseObj = syllabus.course_objectives as Record<string, unknown> | null;
  const cloData = syllabus.course_learning_outcomes as Record<string, unknown> | null;
  const contentData = syllabus.course_content as Record<string, unknown> | null;
  const textbooksData = syllabus.textbooks as Record<string, unknown> | null;
  const resourcesData = syllabus.web_resources as Record<string, unknown> | null;
  const pedagogyData = syllabus.pedagogy as Record<string, unknown> | null;
  const mappingsData = syllabus.po_mappings as Record<string, unknown> | null;

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Syllabus: ${syllabus.course_code}</title>
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
  const pharmacy = isPharmacyModel(syllabus.academic_model);
  const placement = pharmacy
    ? syllabus.academic_model === 'pci_pharm'
      ? (syllabus.semester ? `Semester ${syllabus.semester}` : '')
      : (syllabus.academic_year ? `Year ${syllabus.academic_year}` : '')
    : '';
  html += `
    <h1>${syllabus.course_code}: ${syllabus.course_name}</h1>
    <div class="metadata">
      ${pharmacy ? `<p><strong>Regulation:</strong> ${modelUniversityHeader(syllabus.academic_model)}</p>` : ''}
      ${pharmacy && placement ? `<p><strong>Placement:</strong> ${placement}</p>` : ''}
      <p><strong>Course Credits:</strong> ${syllabus.course_credits || 'N/A'}</p>
      ${pharmacy ? '' : `<p><strong>Stream:</strong> ${syllabus.stream || 'General'}</p>`}
      <p><strong>Version:</strong> ${syllabus.version_number}</p>
      <p><strong>Status:</strong> ${syllabus.is_latest ? 'Latest' : 'Archived'}</p>
      <p><strong>Last Modified:</strong> ${new Date(syllabus.last_modified_at).toLocaleDateString()}</p>
    </div>
  `;

  // Format-specific content. Pharmacy (COP) models have no CO-PO/Bloom — they
  // use a dedicated layout (Scope + Objectives + Content + Books + Exam Scheme
  // + Internship) regardless of the requested `format`.
  if (pharmacy) {
    html += generatePharmacyFormat(syllabus, options);
  } else if (format === 'official') {
    html += generateOfficalFormat(syllabus, cloData, contentData, textbooksData, resourcesData, pedagogyData, mappingsData, options);
  } else if (format === 'meeting_summary') {
    html += generateMeetingSummaryFormat(syllabus, mappingsData);
  } else if (format === 'obe') {
    html += generateObeFormat(syllabus, cloData, contentData, mappingsData, options);
  }

  html += `
      </body>
    </html>
  `;

  return html;
}

function generateOfficalFormat(
  syllabus: BosCourseSyllabus,
  cloData: Record<string, unknown> | null,
  contentData: Record<string, unknown> | null,
  textbooksData: Record<string, unknown> | null,
  resourcesData: Record<string, unknown> | null,
  pedagogyData: Record<string, unknown> | null,
  mappingsData: Record<string, unknown> | null,
  options: ExportOptions
): string {
  let html = '';

  // Course Objectives
  html += `<div class="section"><h2>Course Objectives</h2>`;
  if (syllabus.course_objectives) {
    const objectives = syllabus.course_objectives as Record<string, unknown>;
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
  syllabus: BosCourseSyllabus,
  mappingsData: Record<string, unknown> | null
): string {
  let html = `<div class="section"><h2>Meeting Summary</h2>`;

  html += `<div class="metadata">
    <p><strong>Course:</strong> ${syllabus.course_code} - ${syllabus.course_name}</p>
    <p><strong>Action:</strong> ${syllabus.is_latest ? 'Approved' : 'Archived'}</p>
  </div>`;

  html += `<div class="section"><h2>Course Learning Outcomes</h2>`;
  if (syllabus.course_learning_outcomes) {
    const cloData = syllabus.course_learning_outcomes as Record<string, unknown>;
    const clos = cloData.clos as Array<Record<string, unknown>> || [];
    html += '<ol>';
    clos.forEach((clo: Record<string, unknown>) => {
      html += `<li>${clo.description}</li>`;
    });
    html += '</ol>';
  }
  html += '</div>';

  if (syllabus.notes) {
    html += `<div class="section"><h2>Meeting Notes</h2><p>${syllabus.notes}</p></div>`;
  }

  html += '</div>';
  return html;
}

function generateObeFormat(
  syllabus: BosCourseSyllabus,
  cloData: Record<string, unknown> | null,
  contentData: Record<string, unknown> | null,
  mappingsData: Record<string, unknown> | null,
  options: ExportOptions
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
