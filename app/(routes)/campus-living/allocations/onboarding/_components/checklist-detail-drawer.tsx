'use client';

/**
 * Checklist detail drawer — tick items off, edit notes, delete.
 *
 * `useToggleOnboardingItem` reads the current row, recomputes items, then
 * issues a single update — so we get optimistic re-renders without a custom
 * mutation queue.
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useDeleteOnboardingChecklist,
  useToggleOnboardingItem,
  useUpdateOnboardingChecklist,
} from '@/hooks/campus-living/use-hostel-onboarding';
import {
  computeChecklistProgress,
  type OnboardingChecklistWithJoins,
  type OnboardingStatus,
} from '@/types/campus-living/onboarding';

interface ChecklistDetailDrawerProps {
  checklist: OnboardingChecklistWithJoins | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
}

const statusLabel: Record<OnboardingStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

const statusVariant: Record<
  OnboardingStatus,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  not_started: 'outline',
  in_progress: 'default',
  completed: 'success',
  skipped: 'secondary',
};

export function ChecklistDetailDrawer({
  checklist,
  open,
  onOpenChange,
  institutionId,
}: ChecklistDetailDrawerProps) {
  const { profile } = useAuth();
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const toggleMut = useToggleOnboardingItem();
  const updateMut = useUpdateOnboardingChecklist();
  const deleteMut = useDeleteOnboardingChecklist();

  if (!checklist) return null;

  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const progress = computeChecklistProgress(items);
  const learnerName =
    checklist.learner?.full_name ??
    `Learner ${checklist.learner_id.slice(0, 8)}`;

  const handleToggle = (itemKey: string, completed: boolean) => {
    toggleMut.mutate({
      id: checklist.id,
      itemKey,
      completed,
      completedBy: profile?.id ?? null,
      institutionId,
    });
  };

  const handleSaveNotes = () => {
    if (notesDraft === null) return;
    updateMut.mutate(
      {
        id: checklist.id,
        institutionId,
        updates: { notes: notesDraft },
      },
      {
        onSuccess: () => setNotesDraft(null),
      },
    );
  };

  const handleSkip = () => {
    updateMut.mutate({
      id: checklist.id,
      institutionId,
      updates: { status: 'skipped' },
    });
  };

  const handleDelete = () => {
    deleteMut.mutate(
      { id: checklist.id, institutionId },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{learnerName}</SheetTitle>
          <SheetDescription>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={statusVariant[checklist.status]}>
                {statusLabel[checklist.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {progress}% complete
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground text-right">
              {items.filter((i) => i.completed).length} / {items.length} done
            </p>
          </div>

          <div className="space-y-3">
            <Label>Checklist items</Label>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                This checklist has no items.
              </p>
            )}
            {items.map((item) => (
              <div
                key={item.key}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id={`item-${item.key}`}
                  checked={!!item.completed}
                  disabled={toggleMut.isPending}
                  onCheckedChange={(c) =>
                    handleToggle(item.key, c === true)
                  }
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`item-${item.key}`}
                    className={
                      item.completed
                        ? 'line-through text-muted-foreground cursor-pointer'
                        : 'cursor-pointer'
                    }
                  >
                    {item.label}
                  </Label>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.description}
                    </p>
                  )}
                  {item.completed && item.completed_at && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {new Date(item.completed_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notesDraft ?? checklist.notes ?? ''}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add a note (visible to wardens)"
              rows={3}
            />
            {notesDraft !== null && notesDraft !== (checklist.notes ?? '') && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNotesDraft(null)}
                  disabled={updateMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  Save notes
                </Button>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6 flex sm:justify-between gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this checklist?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the onboarding history for {learnerName}. The
                  allocation itself is not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            {checklist.status !== 'skipped' &&
              checklist.status !== 'completed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkip}
                  disabled={updateMut.isPending}
                >
                  Mark skipped
                </Button>
              )}
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
