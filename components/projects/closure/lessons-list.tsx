'use client';

/**
 * LessonsList — renders the project_lessons_learned table for a project.
 *
 * Features:
 *  - Empty state with CTA to add first lesson.
 *  - Per-row edit + delete actions.
 *  - Add-lesson button opens LessonFormDialog.
 *  - SuggestedLessonsPanel shown above the list when similar-project lessons
 *    exist (only visible when projectTypeId is non-null).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { MoreHorizontal, Plus, BookOpen, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLessonsLearned, useAddLesson, useUpdateLesson, useDeleteLesson } from '@/hooks/projects/use-closure';
import { LessonFormDialog } from './lesson-form-dialog';
import { SuggestedLessonsPanel } from './suggested-lessons-panel';
import type { ProjectLessonLearned } from '@/types/projects';
import type { LessonFormValues } from './lesson-form-dialog';

interface LessonsListProps {
  projectId: string;
  closureReportId?: string | null;
  projectTypeId?: string | null;
}

export function LessonsList({ projectId, closureReportId, projectTypeId }: LessonsListProps) {
  const { data: lessons = [], isLoading } = useLessonsLearned(projectId);
  const addLesson = useAddLesson();
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectLessonLearned | null>(null);

  async function handleAdd(values: LessonFormValues) {
    try {
      await addLesson.mutateAsync({
        project_id: projectId,
        closure_report_id: closureReportId ?? null,
        project_type_id: projectTypeId ?? null,
        category: values.category,
        lesson: values.lesson,
        tags: values.tags.length > 0 ? values.tags : null,
      });
      setAddOpen(false);
      toast({ title: 'Lesson added' });
    } catch (err) {
      toast({ title: 'Failed to add lesson', variant: 'destructive' });
      console.error(err);
    }
  }

  async function handleEdit(values: LessonFormValues) {
    if (!editTarget) return;
    try {
      await updateLesson.mutateAsync({
        id: editTarget.id,
        projectId,
        input: {
          category: values.category,
          lesson: values.lesson,
          tags: values.tags.length > 0 ? values.tags : null,
        },
      });
      setEditTarget(null);
      toast({ title: 'Lesson updated' });
    } catch (err) {
      toast({ title: 'Failed to update lesson', variant: 'destructive' });
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteLesson.mutateAsync({ id, projectId });
      toast({ title: 'Lesson deleted' });
    } catch (err) {
      toast({ title: 'Failed to delete lesson', variant: 'destructive' });
      console.error(err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Lessons Learned</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Capture what worked, what didn&apos;t, and what the next team should know.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add lesson
        </Button>
      </div>

      <Separator />

      {/* Suggested lessons from similar projects */}
      <SuggestedLessonsPanel projectId={projectId} projectTypeId={projectTypeId} />

      {/* Lessons list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading lessons…</span>
        </div>
      ) : lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No lessons yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add the first lesson to capture knowledge for future projects.
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add first lesson
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                {lesson.category && (
                  <Badge variant="secondary" className="text-xs">
                    {lesson.category}
                  </Badge>
                )}
                <p className="text-sm leading-snug">{lesson.lesson}</p>
                {lesson.tags && lesson.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lesson.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 shrink-0 ${TAP_TARGET_ICON}`}
                    aria-label="Lesson actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditTarget(lesson)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => handleDelete(lesson.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {/* Add dialog */}
      <LessonFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isSaving={addLesson.isPending}
        onSubmit={handleAdd}
      />

      {/* Edit dialog */}
      <LessonFormDialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        initialValues={editTarget ?? undefined}
        isSaving={updateLesson.isPending}
        onSubmit={handleEdit}
      />
    </div>
  );
}
