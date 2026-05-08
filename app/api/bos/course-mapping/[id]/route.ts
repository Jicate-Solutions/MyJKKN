// app/api/bos/course-mapping/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos } from '@/lib/utils/bos/bos-access';

async function gate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'edit'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

/**
 * Refuses mutation if mapping is Locked (e.g. ratified by a BoS meeting).
 * Returns 423 (RFC 4918) if so, null otherwise.
 *
 * COE's /course-mapping list response shape may be either a flat object or
 * { data: [...] } depending on the filter — handle both.
 */
async function assertMappingNotLocked(
  client: CoeRestClient,
  id: string,
): Promise<NextResponse | null> {
  const r = await client.get<
    { data?: Array<{ mapping_status?: string }> } | { mapping_status?: string }
  >(`/api/v1/course-mapping?id=${id}`);
  const row = Array.isArray((r as { data?: unknown[] })?.data)
    ? (r as { data: Array<{ mapping_status?: string }> }).data[0]
    : (r as { mapping_status?: string });
  if (row?.mapping_status === 'Locked') {
    return NextResponse.json(
      { error: 'Mapping is locked and cannot be modified', code: 'LOCKED' },
      { status: 423 },
    );
  }
  return null;
}

// ── PUT /api/bos/course-mapping/[id] ──────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await gate();
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const lockResp = await assertMappingNotLocked(client, id);
    if (lockResp) return lockResp;

    const body = await request.json();
    const result = await client.put<unknown>(`/api/v1/course-mapping/${id}`, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/course-mapping/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

// ── DELETE /api/bos/course-mapping/[id] (soft via is_active=false) ────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await gate();
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const lockResp = await assertMappingNotLocked(client, id);
    if (lockResp) return lockResp;

    // Soft-delete: PUT is_active=false (matches the partial-unique index in schema)
    const result = await client.put<unknown>(`/api/v1/course-mapping/${id}`, {
      is_active: false,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/course-mapping/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove mapping' }, { status: 500 });
  }
}
