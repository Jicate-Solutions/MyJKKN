import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveInternalMarksAccess } from '@/lib/utils/internal-marks/internal-marks-access';
import {
  loadPaperInScope,
  coeDirectFetchConfig,
} from '@/lib/utils/question-papers/paper-scope-guard';

/**
 * /api/question-papers/[id]/pdf — streams the COE-rendered question-paper PDF.
 *
 * The COE endpoint returns raw application/pdf bytes (not JSON), so we bypass
 * CoeRestClient's JSON client and fetch directly with the same API-key headers.
 * A CAS-aware scope guard runs first so cross-institution ids are rejected before
 * we fetch the binary.
 *
 * `?layout=2up` asks COE for the A4-landscape two-identical-copies-side-by-side
 * sheet (cut down the middle). Anything else renders the standard A4 portrait.
 * The layout is forwarded verbatim — COE owns the rendering, MyJKKN never
 * re-lays-out a paper.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scope = await resolveInternalMarksAccess(user.id);

    // Scope guard via the JSON client (cheap, cached) before pulling the binary.
    const paper = await loadPaperInScope(scope, id);
    if (!paper) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }

    const config = coeDirectFetchConfig();
    if (!config) {
      return NextResponse.json({ error: 'COE API is not configured' }, { status: 500 });
    }

    // Only '2up' is a real alternative layout; ignore anything else rather than
    // forwarding an arbitrary string into the renderer.
    const layout = request.nextUrl.searchParams.get('layout') === '2up' ? '2up' : null;
    const upstream =
      `${config.baseUrl}/api/v1/ia/question-papers/${id}/pdf` +
      (layout ? `?layout=${layout}` : '');

    const res = await fetch(upstream, {
      headers: config.headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `COE PDF export failed (${res.status})` },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();
    const filename =
      res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ??
      `question-paper-${id}.pdf`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id/pdf] GET error:', error);
    return NextResponse.json({ error: 'Failed to export PDF' }, { status: 500 });
  }
}
