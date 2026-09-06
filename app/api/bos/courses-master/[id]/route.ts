// app/api/bos/courses-master/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveBosBoardScope, resolveCoeInstitutionId, type BosBoardScope } from '@/lib/utils/bos/bos-access';
import { courseFormSchema } from '@/lib/services/bos/courses-schemas';

async function authenticate(action: 'view' | 'edit' | 'delete') {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const [hasAccess, scope] = await Promise.all([
    canAccessBos(user.id, 'academic.bos-courses', action),
    resolveBosBoardScope(user.id),
  ]);
  if (!hasAccess) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, scope };
}

/**
 * Fetches the course, checks lock status, and for non-super-admins verifies
 * the course belongs to an institution where the user has board membership.
 * Multi-institution-aware: a faculty serving on Board X in Institution A and
 * Board Y in Institution B can mutate courses in either, provided the course
 * also sits on one of their boards.
 *
 * Returns an error response or null.
 */
async function assertMutationAllowed(
  client: CoeRestClient,
  id: string,
  scope: BosBoardScope,
): Promise<NextResponse | null> {
  const existing = await client.get<{ course_status?: string; courses_status?: string; institutions_id?: string; board_id?: string; board_code?: string }>(`/api/v1/courses/${id}`);
  const lockVal = existing?.courses_status ?? existing?.course_status;
  if (lockVal?.toLowerCase() === 'locked') {
    return NextResponse.json(
      { error: 'Course is locked and cannot be modified', code: 'LOCKED' },
      { status: 423 },
    );
  }
  if (scope.isSuperAdmin) return null;

  // Resolve the COE institution_id of every institution the user has
  // membership in (union of allInstitutionIds + institutionsOf), then accept
  // the mutation only if the course's institutions_id is in that set.
  if (existing?.institutions_id) {
    const myJkknIds = new Set<string>([
      ...(scope.institutionsId ? [scope.institutionsId] : []),
      ...scope.allInstitutionIds,
      ...scope.institutionsOf,
    ]);
    if (myJkknIds.size === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const allowedCoeIds = await Promise.all(
      Array.from(myJkknIds).map((id) => resolveCoeInstitutionId(id)),
    );
    const allowed = new Set(allowedCoeIds.filter((x): x is string => !!x));
    if (!allowed.has(existing.institutions_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Board-membership gate: the course's board_id must be in the user's
  // boardsOf set. Falls back to board_code when COE only returns the code
  // (older course rows).
  if (existing?.board_id && !scope.boardsOf.has(existing.board_id)) {
    return NextResponse.json(
      { error: 'Forbidden: this course belongs to a board you do not serve on' },
      { status: 403 },
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
    const client = CoeRestClient.create();
    const guardResp = await assertMutationAllowed(client, id, auth.scope);
    if (guardResp) return guardResp;

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

    // COE PUT endpoint field name aliases — confirmed by live API test 2026-05-12:
    //   form 'course_name'  → COE requires 'course_title'  (singular 'course_name' ignored)
    //   form 'credit'       → COE requires 'credits'       (singular 'credit' ignored on PUT)
    if ('course_name' in updates) updates.course_title = updates.course_name;
    if ('credit' in updates) updates.credits = updates.credit;

    // Board code travels alongside board_id so COE persists both lookup keys.
    // It's not part of the Zod-validated form (it's client-resolved), so we read
    // it from the request body and attach it directly.
    if (typeof body.board_code === 'string' && body.board_code.length > 0) {
      updates.board_code = body.board_code;
    }

    // Recompute the total from the CONVERTED marks — the weightage pair the
    // Max Marks form edits. Summing the question-paper ceilings instead would
    // store 50 + 100 = 150 for a Theory + Practical course whose real total is
    // 100. Falls back to the ceilings only for callers that send just those.
    if ('internal_converted_mark' in updates && 'external_converted_mark' in updates) {
      const i = (updates.internal_converted_mark as number | undefined) ?? 0;
      const e = (updates.external_converted_mark as number | undefined) ?? 0;
      updates.total_max_mark = i + e;
    } else if ('internal_max_mark' in updates && 'external_max_mark' in updates) {
      const i = (updates.internal_max_mark as number | undefined) ?? 0;
      const e = (updates.external_max_mark as number | undefined) ?? 0;
      updates.total_max_mark = i + e;
    }
    if ('theory_hours' in updates && 'practical_hours' in updates) {
      const t = (updates.theory_hours as number | undefined) ?? 0;
      const tut = (updates.tutorial_hours as number | undefined) ?? 0;
      const p = (updates.practical_hours as number | undefined) ?? 0;
      updates.class_hours = t + tut + p;
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
    const guardResp = await assertMutationAllowed(client, id, auth.scope);
    if (guardResp) return guardResp;

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
