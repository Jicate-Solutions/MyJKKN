import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveInternalMarksAccess } from '@/lib/utils/internal-marks/internal-marks-access';
import {
  loadPaperInScope,
  coeDirectFetchConfig,
} from '@/lib/utils/question-papers/paper-scope-guard';

/**
 * /api/question-papers/[id]/image — proxy to COE
 * `/api/v1/ia/question-papers/{id}/image`.
 *
 * A question figure is stored in COE's PUBLIC `question-images` bucket at
 * `<paperId>/<uuid>.<ext>`, because the COE PDF renderer is what loads the URL at
 * print time. Hosting figures on the MyJKKN side would work (the renderer accepts
 * any http(s) URL) but COE could then never clean up orphans, so we write into the
 * same bucket COE's own authors use.
 *
 * POST   multipart/form-data, field "file"  → { url, path, size, type }
 * DELETE ?path=<paperId>/<uuid>.<ext>       → { success: true }
 *
 * IMPORTANT: an upload is only REFERENCED once the paper is saved with the returned
 * url/path in the question's `image`. Uploading then abandoning the editor leaves an
 * orphan object — harmless, and never worth blocking the author over.
 *
 * CoeRestClient is JSON-only, so both handlers fetch COE directly with the same
 * API-key headers (the PDF route does the same for its binary stream).
 */

/** Same rule COE enforces — on a v1 key there is no CoE override. */
const EDITABLE_STATUSES = ['draft', 'submitted'];

export async function POST(
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
    const paper = await loadPaperInScope(scope, id);
    if (!paper) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }
    // Fail here rather than after the upload, so we never orphan an object that
    // could not have been referenced anyway.
    if (!EDITABLE_STATUSES.includes(paper.status)) {
      return NextResponse.json(
        { error: `Cannot edit images while paper is ${paper.status}` },
        { status: 400 }
      );
    }

    const config = coeDirectFetchConfig();
    if (!config) {
      return NextResponse.json({ error: 'COE API is not configured' }, { status: 500 });
    }

    // Re-post the multipart body verbatim. Do NOT set Content-Type by hand — the
    // multipart boundary lives in the header fetch generates from the FormData.
    const form = await request.formData();
    const res = await fetch(`${config.baseUrl}/api/v1/ia/question-papers/${id}/image`, {
      method: 'POST',
      headers: config.headers,
      body: form,
      cache: 'no-store',
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error ?? `Image upload failed (${res.status})` },
        { status: res.status }
      );
    }
    return NextResponse.json({ data: payload?.data ?? payload }, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id/image] POST error:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

export async function DELETE(
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

    const path = request.nextUrl.searchParams.get('path') ?? '';
    // Mirror COE's guard locally too: only ever touch this paper's own folder.
    // COE re-checks, but rejecting here keeps a traversal attempt out of the
    // upstream request entirely.
    if (!path.startsWith(`${id}/`) || path.includes('..')) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    const paper = await loadPaperInScope(scope, id);
    if (!paper) {
      return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
    }

    const config = coeDirectFetchConfig();
    if (!config) {
      return NextResponse.json({ error: 'COE API is not configured' }, { status: 500 });
    }

    const res = await fetch(
      `${config.baseUrl}/api/v1/ia/question-papers/${id}/image?path=${encodeURIComponent(path)}`,
      { method: 'DELETE', headers: config.headers, cache: 'no-store' }
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: payload?.error ?? `Image delete failed (${res.status})` },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/:id/image] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
