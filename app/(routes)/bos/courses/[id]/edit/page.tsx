'use client';

import { use, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CourseForm } from '../../_components/course-form';
import { useBosCourse, useUpdateBosCourse } from '@/hooks/bos/use-bos-courses';
import { useBosBoards } from '@/hooks/bos/use-bos-boards';
import { isLocked } from '@/types/bos-courses';
import { institutionSkipsPartLevel } from '@/lib/services/bos/courses-schemas';
import type { BosBoard } from '@/types/bos';

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: course, isLoading } = useBosCourse(id);
  const update = useUpdateBosCourse();
  // Edit page doesn't know the MyJKKN institution UUID â€” rely on the user's
  // server-side scope (works for non-super-admins). Super-admins editing
  // foreign-institution courses is a known gap; add a reverse-lookup if needed.
  const { data: boards, isLoading: boardsLoading } = useBosBoards(course?.institutions_id);

  // COE's /api/v1/courses/:id record identifies the course's board by CODE only
  // (`board_code`, e.g. "PCH") — there is NO board_id on the course row. The
  // SearchableSelect, however, keys options by board UUID. So we recover the
  // UUID by matching the saved board_code against the loaded boards list and
  // feed THAT as the form's selected value. (Confirmed via COE API 2026-06-22:
  // course 26PCHC04 returns board_code:"PCH", no board_id.)
  const courseBoardCode = course?.board_code?.toUpperCase();

  // If the boards list couldn't be loaded for this institution, still surface a
  // synthetic option keyed by the code so the saved value renders rather than a
  // blank "Select board". When the list IS present, the real PCH option is used.
  const boardsForForm = useMemo<BosBoard[]>(() => {
    const list = boards ? [...boards] : [];
    if (courseBoardCode && !list.some((b) => b.board_code?.toUpperCase() === courseBoardCode)) {
      list.unshift({
        id: course!.board_code!,            // fall back to the code as the option value
        board_code: course!.board_code!,
        board_name: course!.board_code!,    // course GET carries no board_name
      });
    }
    return list;
  }, [boards, courseBoardCode, course]);

  // The form's selected board value: the UUID of the board whose code matches
  // the course's board_code (or the code itself when only the synthetic option
  // exists). Resolved from boardsForForm so it always corresponds to a rendered
  // option.
  const selectedBoardId = useMemo<string | undefined>(() => {
    if (!courseBoardCode) return undefined;
    return boardsForForm.find((b) => b.board_code?.toUpperCase() === courseBoardCode)?.id;
  }, [boardsForForm, courseBoardCode]);

  // Hard-lock check: trust the URL param (set from list row data which is reliable)
  // as well as the fetched course â€” whichever says locked wins.
  const lockedFromUrl = searchParams.get('course_status')?.toLowerCase() === 'locked';
  const courseIsLocked = lockedFromUrl || isLocked(course);

  return (
    <PermissionGuard module='academic.bos-courses' action='edit'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {course ? `Edit ${course.course_code}` : 'Edit Course'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className='h-96 w-full' />
          ) : courseIsLocked ? (
            // Hard block â€” render regardless of whether course data has loaded,
            // because lockedFromUrl is already definitive while the fetch is in flight.
            <div className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
              <Lock className='h-5 w-5 shrink-0' />
              <span>
                This course is <strong>Locked</strong> and cannot be edited.
              </span>
              <button
                onClick={() => router.push('/bos/courses')}
                className='ml-auto underline'
              >
                Back to list
              </button>
            </div>
          ) : (!course || boardsLoading) ? (
            // Wait for the boards list before mounting the form: the selected
            // board is resolved from board_code → UUID against that list, and
            // react-hook-form's defaultValues only apply once at mount. Mounting
            // early would bind board_id before the list arrives and the value
            // would never appear.
            <Skeleton className='h-96 w-full' />
          ) : (
            <CourseForm
              submitting={update.isPending}
              submitLabel='Save Changes'
              boards={boardsForForm}
              boardsLoading={boardsLoading}
              hidePartLevel={institutionSkipsPartLevel(course.institution_code)}
              defaultValues={{
                course_code: course.course_code,
                course_name: course.course_name ?? course.course_title ?? '',
                board_id: selectedBoardId,
                course_category: course.course_category,
                // PG / non-tiered courses store no Part — keep the field blank
                // on load rather than substituting "Part III" on save.
                course_part_master: (course.course_part_master as never) ?? undefined,
                // Leave Type blank for courses with no Type — don't silently
                // substitute 'Core' on save.
                course_type: (course.course_type as never) ?? undefined,
                // Leave Level blank for legacy / non-tiered courses (e.g.,
                // Internship) â€” don't silently substitute 'I' on save.
                course_level: (course.course_level as never) ?? undefined,
                exam_duration: course.exam_duration ?? 3,
                credit: course.credit ?? course.credits ?? 3,
                theory_hours: course.theory_hours ?? 0,
                tutorial_hours: course.tutorial_hours ?? 0,
                practical_hours: course.practical_hours ?? 0,
                // Carried through, not edited: these are COE's question-paper
                // ceilings. Feeding them into form state means the PUT
                // round-trips them unchanged instead of dropping them.
                internal_max_mark: course.internal_max_mark,
                external_max_mark: course.external_max_mark,
                // What the Max Marks inputs actually bind to — the converted
                // (weightage) marks, so Total reconciles with COE's
                // total_max_mark. COE's mapper coerces a NULL converted column
                // to 0, so 0 is indistinguishable from unset: fall back to the
                // paper ceiling, which is the right value for the legacy rows
                // written before the converted columns were populated.
                internal_converted_mark:
                  course.internal_converted_mark || course.internal_max_mark || 0,
                external_converted_mark:
                  course.external_converted_mark || course.external_max_mark || 0,
                total_max_mark: course.total_max_mark ?? 100,
              }}
              onSubmit={async (form) => {
                // Final server-side guard â€” 423 response means COE confirmed lock.
                try {
                  // Resolve board_code from the boards list so the PUT request carries
                  // both lookup keys to COE (mirrors the create flow).
                  const board_code = boardsForForm.find((b) => b.id === form.board_id)?.board_code;
                  await update.mutateAsync({ id, form, board_code });
                  toast.success('Course updated');
                  router.push('/bos/courses');
                } catch (e) {
                  const msg = (e as Error).message;
                  if (msg.toLowerCase().includes('locked')) {
                    toast.error('Course is locked and cannot be modified');
                  } else {
                    toast.error(msg);
                  }
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}