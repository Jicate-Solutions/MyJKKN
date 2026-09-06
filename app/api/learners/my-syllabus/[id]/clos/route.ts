/**
 * GET /api/learners/my-syllabus/[id]/clos
 *
 * Course learning outcomes for one approved syllabus, for the signed-in
 * learner. Auth-only by design: fn_pde_get_syllabus_outcomes (SECURITY
 * DEFINER) already scopes rows to the caller's institution, so a permission
 * gate here would only duplicate — and could contradict — the DB rule.
 */

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSyllabusCLOs } from '@/lib/services/pde-curriculum-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await getSyllabusCLOs(id);
    if (!result) {
      return NextResponse.json(
        { error: 'That syllabus is not available to you.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
