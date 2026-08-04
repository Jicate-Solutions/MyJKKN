export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Foundation Programme — the sessions a Senior Learner runs, and who is in them.
//
// GET /api/foundation/practice/facilitate
//   -> { cohorts: [{ id, term, schoolName, exam: {...} | null, learners: [...] }] }
//
// WHY THIS ROUTE EXISTS
// Foundation is aimed at children who, for the most part, hold no account on
// this platform — fp_students.profile_id is nullable precisely so a child can
// exist on the programme without a login. Somebody still has to run the
// session, and that person is the cohort's resource person. This route answers
// the only question that screen needs: which groups are mine, and who is in
// them.
//
// AUTHORISATION IS RLS, NOT A FILTER HERE
// The cohort query is scoped to resource_person_id = the caller, and the learner
// read goes through the session client, where fp_students is gated on
// fn_fp_can_view_student — which admits the learner themself, their guardian,
// whoever runs their cohort, and the school's owner. Narrowing in SQL here is
// belt-and-braces, not the boundary.
//
// Question counts come from the service-role client because fp_items carries the
// answer keys and is operator-gated. Only a COUNT crosses back, never an item.

interface LearnerRow {
  id: string;
  full_name: string;
  grade: string | null;
  status: string;
}

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

    const { data: cohortRows, error: cohortError } = await (supabase as any)
      .from('fp_cohorts')
      .select(
        'id, term, is_active, school:schools(id, name), exam:exam_definitions(id, display_name, is_active)',
      )
      .eq('resource_person_id', user.id)
      .eq('is_active', true);

    if (cohortError) {
      return NextResponse.json({ error: cohortError.message }, { status: 400 });
    }

    // Running no cohort is not an error. It is the honest answer for somebody
    // who holds the permission but has not been given a group yet, and it reads
    // differently on the page from "you cannot open this".
    if (!cohortRows?.length) {
      return NextResponse.json({ cohorts: [] });
    }

    const admin = createServiceRoleClient();

    // One count per distinct exam, not per cohort — two cohorts sitting the same
    // exam would otherwise pay for the same count twice.
    const examIds = Array.from(
      new Set(
        (cohortRows as any[])
          .map((c) => c.exam?.id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      ),
    );

    const questionCounts = new Map<string, number>();
    await Promise.all(
      examIds.map(async (examId) => {
        const { count } = await (admin as any)
          .from('fp_items')
          .select('id', { count: 'exact', head: true })
          .eq('exam_definition_id', examId)
          .eq('is_active', true);
        questionCounts.set(examId, count ?? 0);
      }),
    );

    const cohorts = await Promise.all(
      (cohortRows as any[]).map(async (cohort) => {
        const { data: enrolments } = await (supabase as any)
          .from('fp_enrollments')
          .select('status, learner:fp_students(id, full_name, grade, status)')
          .eq('cohort_id', cohort.id);

        const learners = ((enrolments ?? []) as any[])
          .map((e) => e.learner as LearnerRow | null)
          .filter((l): l is LearnerRow => Boolean(l) && l!.status === 'active')
          .map((l) => ({
            id: l.id,
            fullName: l.full_name,
            grade: l.grade,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        const examActive = cohort.exam?.is_active === true;
        const questionCount = cohort.exam?.id
          ? (questionCounts.get(cohort.exam.id) ?? 0)
          : 0;

        return {
          id: cohort.id,
          term: cohort.term ?? null,
          schoolName: cohort.school?.name ?? null,
          // A cohort whose exam is switched off, or whose question bank is still
          // dark, is returned rather than hidden — with the count that says so.
          // Hiding it would look identical to the cohort not existing, which is
          // the failure this module has already had once.
          exam: cohort.exam
            ? {
                examDefinitionId: cohort.exam.id,
                name: cohort.exam.display_name,
                isActive: examActive,
                questionCount,
              }
            : null,
          learners,
        };
      }),
    );

    cohorts.sort((a, b) =>
      (a.exam?.name ?? '').localeCompare(b.exam?.name ?? ''),
    );

    return NextResponse.json({ cohorts });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load your sessions' },
      { status: 500 },
    );
  }
}
