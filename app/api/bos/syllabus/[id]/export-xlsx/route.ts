import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosBoardScope, readableInstitutionIds, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';
import { buildSyllabusWorkbook } from '@/lib/utils/bos/syllabus-xlsx';
import type { BosCourseSyllabus } from '@/types/bos';

export const runtime = 'nodejs';

/**
 * GET /api/bos/syllabus/[id]/export-xlsx â€” stream a single syllabus as a
 * multi-sheet XLSX file matching the import template.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id || typeof id !== 'string' || id.includes('undefined')) {
      return NextResponse.json({ error: 'Invalid syllabus ID' }, { status: 400 });
    }

    const scope = await resolveBosBoardScope(user.id);
    // View-only observer tier: holder of the view grant who sits on no board reads all institutions (never widens writes).
    const hasView = await hasBosPermission(user.id, 'academic.bos-syllabus.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);

    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    const readDb = canReadAllBos ? createServiceRoleClient() : supabase;
    let query = readDb.from('bos_course_syllabi').select('*').eq('id', id);

    // CAS-aware filter â€” see syllabus/[id]/route.ts for rationale.
    const allowedIds = readableInstitutionIds(scope, canReadAllBos);
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 });
      }
      query = allowedIds.length === 1
        ? query.eq('institutions_id', allowedIds[0])
        : query.in('institutions_id', allowedIds);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Syllabus not found' },
        { status: 404 },
      );
    }

    const syllabus = data as BosCourseSyllabus;
    const buffer = await buildSyllabusWorkbook(syllabus);

    const safe = `${syllabus.course_code ?? 'syllabus'}-${(syllabus.course_name ?? '').slice(0, 40)}`
      .replace(/[^a-zA-Z0-9\-_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safe || 'syllabus'}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('XLSX export error:', error);
    return NextResponse.json({ error: 'Failed to export syllabus' }, { status: 500 });
  }
}