'use client';

/**
 * Suggested Tasks Panel — renders the suggested_tasks JSONB array from a
 * meeting link and lets the user confirm each into a real project_task.
 *
 * Each row shows: title, optional description, "Create task" button.
 * Once confirmed the button becomes a "Task created" badge so the user can't
 * double-confirm within the same mount. The panel does NOT track persistence of
 * confirmed state across remounts — that would require storing which items have
 * been confirmed (a future improvement).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ListTodo, Loader2 } from 'lucide-react';
import { useConfirmSuggestedTask } from '@/hooks/projects/use-meetings';
import type { SuggestedTaskItem } from '@/lib/services/projects/meeting-service';

interface SuggestedTasksPanelProps {
  projectId: string;
  meetingTitle: string;
  suggestions: SuggestedTaskItem[];
}

interface ItemState {
  confirmed: boolean;
  loading: boolean;
}

export function SuggestedTasksPanel({
  projectId,
  meetingTitle,
  suggestions,
}: SuggestedTasksPanelProps) {
  const confirmTask = useConfirmSuggestedTask(projectId);

  // Track per-item confirmation state (index-keyed — titles can duplicate)
  const [itemStates, setItemStates] = useState<Record<number, ItemState>>({});

  function setLoading(index: number, loading: boolean) {
    setItemStates((prev) => ({
      ...prev,
      [index]: { confirmed: prev[index]?.confirmed ?? false, loading },
    }));
  }

  function setConfirmed(index: number) {
    setItemStates((prev) => ({
      ...prev,
      [index]: { confirmed: true, loading: false },
    }));
  }

  function handleConfirm(item: SuggestedTaskItem, index: number) {
    if (itemStates[index]?.confirmed || itemStates[index]?.loading) return;

    setLoading(index, true);
    confirmTask.mutate(item, {
      onSuccess: (task) => {
        setConfirmed(index);
        toast.success(`Task created: "${task.title}"`);
      },
      onError: (err) => {
        setLoading(index, false);
        toast.error(`Failed to create task: ${(err as Error).message}`);
      },
    });
  }

  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No suggested tasks for this meeting.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          Suggested tasks from &ldquo;{meetingTitle}&rdquo;
        </span>
        <Badge variant="secondary" className="text-xs">
          {suggestions.length} action item{suggestions.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Review each action item and click &ldquo;Create task&rdquo; to add it to this
        project. Fireflies API fetch and AI extraction are deferred to a future update.
      </p>

      <ul className="space-y-2">
        {suggestions.map((item, index) => {
          const state = itemStates[index];
          const isConfirmed = state?.confirmed ?? false;
          const isLoading = state?.loading ?? false;

          return (
            <li
              key={index}
              className="flex items-start gap-3 rounded-md border bg-background p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {isConfirmed ? (
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs text-green-700 border-green-300 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Task created
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs whitespace-nowrap"
                    onClick={() => handleConfirm(item, index)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Creating…
                      </>
                    ) : (
                      'Create task'
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
