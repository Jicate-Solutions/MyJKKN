export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/pde/assessments/auto-generate
//
// GATED (2026-07-06). This endpoint was written to "auto-generate a quiz from
// lesson content" — it read `pde_lessons.content.self_check` / `.exercises`.
// That table does not exist in this schema and never did: PDE has no
// lesson-content model (no `pde_lessons`, no `pde_courses`). Every call
// therefore 500'd on an undefined table before doing anything.
//
// Rather than 500 on a phantom table, the route now returns an explicit 501
// (Not Implemented). Making it functional would require building an entire
// lesson-content authoring model, which is out of scope for the PDE pilot
// (the pilot path is quest → enrollment → demonstration → agency, not
// lesson-based quizzes). This is flagged as a larger follow-up gap.
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: 'Not implemented',
        detail:
          'Auto-generation of assessments from lesson content is unavailable: ' +
          'this deployment has no lesson-content model (no pde_lessons / pde_courses table). ' +
          'Create assessments directly, or generate them from the clinical-reasoning / quest path.',
      },
      { status: 501 }
    );
  } catch (error: any) {
    console.error('Error in auto-generate (gated):', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
