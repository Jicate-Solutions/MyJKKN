/**
 * PDE Course Linkage — REST surface for T4.2.
 * ============================================================================
 *
 * GET   /api/pde/course-linkage?course_id=<uuid>  → demos linked to a course
 * GET   /api/pde/course-linkage?lesson_id=<uuid>  → demos linked to a lesson
 * PATCH /api/pde/course-linkage                   → link/unlink a demo
 *
 * Auth pattern mirrors /api/pde/demonstrations: cookie SSR + getUser, RLS does
 * the heavy lifting. The PATCH UPDATE policy on pde_demonstrations decides
 * who may link (typically: owning learner or admin/staff role).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDemonstrationsByCourse,
  getDemonstrationsByLesson,
  linkDemonstrationToCourse,
} from '@/lib/services/pde-course-linkage-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    const lessonId = searchParams.get('lesson_id');

    if (!courseId && !lessonId) {
      return NextResponse.json(
        { error: 'course_id or lesson_id query param is required' },
        { status: 400 }
      );
    }
    if (courseId && lessonId) {
      return NextResponse.json(
        { error: 'pass course_id OR lesson_id, not both' },
        { status: 400 }
      );
    }

    if (courseId) {
      const data = await getDemonstrationsByCourse(courseId, supabase);
      return NextResponse.json({ data });
    }

    // lessonId branch (guaranteed truthy here)
    const data = await getDemonstrationsByLesson(lessonId!, supabase);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    // 400 for shape errors raised by the service layer; 500 otherwise.
    const status = /must be a uuid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  await connection();
  try {
    const supabase = (await createClient()) as unknown as SupabaseClient;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      demonstration_id?: string;
      course_id?: string | null;
      lesson_id?: string | null;
    };

    if (!body.demonstration_id) {
      return NextResponse.json(
        { error: 'demonstration_id is required' },
        { status: 400 }
      );
    }
    if (body.course_id === undefined) {
      return NextResponse.json(
        { error: 'course_id is required (pass null to unlink)' },
        { status: 400 }
      );
    }

    const row = await linkDemonstrationToCourse(
      {
        demonstrationId: body.demonstration_id,
        courseId: body.course_id,
        lessonId: body.lesson_id,
      },
      supabase
    );

    return NextResponse.json({ data: row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    const status = /must be a uuid|required/i.test(message)
      ? 400
      : /not found|RLS-denied/i.test(message)
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
