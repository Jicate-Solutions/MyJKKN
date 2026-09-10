import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, applyInstitutionScope, readableInstitutionIds, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';
import { courseDisplayFor } from '@/lib/utils/bos/coe-course-display';
import { generateV35SyllabusHtml } from '@/lib/utils/bos/course-syllabus-html';
import { generatePdfHtml } from '@/lib/utils/bos/syllabus-pdf-html';
import { BosCourseSyllabus } from '@/types/bos';

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
