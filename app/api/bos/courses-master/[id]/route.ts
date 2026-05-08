// app/api/bos/courses-master/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos } from '@/lib/utils/bos/bos-access';
import { courseFormSchema } from '@/lib/services/bos/courses-schemas';

async function authenticate(action: 'view' | 'edit' | 'delete') {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await canAccessBos(user.id, 'academic.bos-courses', action))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

/** Refuses mutation if course is Locked. Returns 423 (RFC 4918) if so, null otherwise. */
async function assertNotLocked(client: CoeRestClient, id: string): Promise<NextResponse | null> {
  const existing = await client.get<{ course_status?: string }>(`/api/v1/courses/${id}`);
  if (existing?.course_status === 'Locked') {
    return NextResponse.json(
      { error: 'Course is locked and cannot be modified', code: 'LOCKED' },
      { status: 423 },
    );
  }
  return null;
}

// ── GET /api/bos/courses-master/[id] ──────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('view');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const client = CoeRestClient.create();
    const data = await client.get<unknown>(`/api/v1/courses/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 });
  }
}

// ── PUT /api/bos/courses-master/[id] ──────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('edit');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;

    // Defense in depth — even if the UI hid the button, refuse the mutation.
    const client = CoeRestClient.create();
    const lockResp = await assertNotLocked(client, id);
    if (lockResp) return lockResp;

    const body = await request.json();
    // Partial update — only validate fields that are present
    const partial = courseFormSchema.partial().safeParse(body.form ?? body);
    if (!partial.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: partial.error.issues },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { ...partial.data };
    // Recompute totals if both sides were sent
    if ('internal_max_mark' in updates && 'external_max_mark' in updates) {
      const i = (updates.internal_max_mark as number | undefined) ?? 0;
      const e = (updates.external_max_mark as number | undefined) ?? 0;
      updates.total_max_mark = i + e;
    }
    if ('theory_hours' in updates && 'practical_hours' in updates) {
      const t = (updates.theory_hours as number | undefined) ?? 0;
      const p = (updates.practical_hours as number | undefined) ?? 0;
      updates.class_hours = t + p;
    }

    const updated = await client.put<unknown>(`/api/v1/courses/${id}`, updates);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

// ── DELETE /api/bos/courses-master/[id]?check=true ────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate('delete');
  if ('error' in auth) return auth.error;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const check = searchParams.get('check') ?? undefined;

    const client = CoeRestClient.create();
    const lockResp = await assertNotLocked(client, id);
    if (lockResp) return lockResp;

    const result = await client.delete<unknown>(`/api/v1/courses/${id}`, { check });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
