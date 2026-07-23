'use client';

/**
 * LessonFormDialog — add / edit a project_lessons_learned row.
 *
 * Used by LessonsList for both "Add lesson" and inline edit flows.
 * Tags are entered as a comma-separated string and split on submit.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { LESSON_CATEGORIES } from './types';
import type { ProjectLessonLearned } from '@/types/projects';

export interface LessonFormValues {
  category: string | null;
  lesson: string;
  tags: string[];
}

interface LessonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<ProjectLessonLearned>;
  isSaving?: boolean;
  onSubmit: (values: LessonFormValues) => void;
}

export function LessonFormDialog({
  open,
  onOpenChange,
  initialValues,
  isSaving = false,
  onSubmit,
}: LessonFormDialogProps) {
  const isEdit = !!initialValues?.id;

  const [category, setCategory] = useState<string>(initialValues?.category ?? '');
  const [lesson, setLesson] = useState(initialValues?.lesson ?? '');
  const [tagsRaw, setTagsRaw] = useState((initialValues?.tags ?? []).join(', '));

  // Reset when dialog re-opens with new initialValues
  useEffect(() => {
    if (open) {
      setCategory(initialValues?.category ?? '');
      setLesson(initialValues?.lesson ?? '');
      setTagsRaw((initialValues?.tags ?? []).join(', '));
    }
  }, [open, initialValues]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lesson.trim()) return;
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSubmit({ category: category || null, lesson: lesson.trim(), tags });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lesson' : 'Add lesson learned'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="lesson-category">
                <SelectValue placeholder="Select a category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {LESSON_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lesson text */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-text">
              Lesson <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lesson-text"
              placeholder="What should the next team know? Be specific and actionable."
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              rows={4}
              required
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="lesson-tags">Tags</Label>
            <Input
              id="lesson-tags"
              placeholder="e.g. communication, timeline, vendor (comma-separated)"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!lesson.trim() || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Add lesson'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
