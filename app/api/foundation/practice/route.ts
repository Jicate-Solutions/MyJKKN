export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Foundation Programme — what the signed-in learner can practise.
//
// GET /api/foundation/practice
//   -> { learner: { id, full_name, grade } | null, exams: [...] }
//
// TWO CLIENTS, ON PURPOSE
//   identity  -> SESSION client. fp_students has an RLS clause
//                `profile_id = auth.uid()`, so the caller can only ever read
//                their own row. That policy, not this code, is the boundary.
//   content   -> SERVICE-ROLE client. fp_items is gated to
//                foundation.items.view/manage because it carries the ANSWER
//                KEYS; a learner cannot read it and must not be able to. So the
//                counting happens above RLS and this route returns counts only.
//
// A learner who has never been enrolled gets learner: null and an empty list.
// That is the honest answer, not an error — nothing is broken, they are simply
// not on the programme yet.

export async function GET() {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ever the caller's OWN enrolment. Someone who also manages a school
    // can read other rows under RLS, but this screen answers as yourself —
    // answering on behalf of somebody else belongs on the console, not here.
    const { data: learner, error: learnerError } = await (supabase as any)
      .from('fp_students')
      .select('id, full_name, grade, status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (learnerError) {
      return NextResponse.json({ error: learnerError.message }, { status: 400 });
    }
    if (!learner || learner.status !== 'active') {
      return NextResponse.json({ learner: null, exams: [] });
    }

    const admin = createServiceRoleClient();

    // Pools come from the migration — one per exam definition, cohort-free.
    const { data: pools, error: poolError } = await (admin as any)
      .from('fp_assessments')
      .select('id, exam_definition_id, exam:exam_definitions!inner(id, display_name, is_active)')
      .eq('kind', 'practice')
      .is('cohort_id', null)
      .eq('is_active', true);

    if (poolError) {
      return NextResponse.json({ error: poolError.message }, { status: 400 });
    }

    // One count per exam. A pool whose questions are all switched off reports
    // zero and is filtered out below — that is how the 116 Class-6 questions
    // stay invisible until somebody deliberately activates them.
    const exams = [];
    for (const pool of pools ?? []) {
      if (!pool.exam?.is_active) continue;
      const { count } = await (admin as any)
        .from('fp_items')
        .select('id', { count: 'exact', head: true })
        .eq('exam_definition_id', pool.exam_definition_id)
        .eq('is_active', true);

      if ((count ?? 0) > 0) {
        exams.push({
          examDefinitionId: pool.exam_definition_id,
          name: pool.exam.display_name,
          questionCount: count ?? 0,
        });
      }
    }

    exams.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      learner: { id: learner.id, full_name: learner.full_name, grade: learner.grade },
      exams,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load practice' },
      { status: 500 },
    );
  }
}
