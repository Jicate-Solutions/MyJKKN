'use client';

/**
 * Board Tab (Feature F13 entry point on /projects?view=board)
 *
 * The top-level board needs a project to scope tasks to. This wrapper lets the
 * user pick one (persisted to URL ?project=) then renders the BoardView. From a
 * project's own detail page the board is rendered directly with a fixed id.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md (F13).
 */

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useProjects } from '@/hooks/projects/use-projects';
import { BoardView } from '@/components/projects/board/board-view';
import { TaskDetailDialog } from '@/components/projects/board/task-detail-dialog';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';

export function BoardTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project') ?? '';
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useProjects();

  const setProject = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set('project', value);
      else params.delete('project');
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm text-muted-foreground">Project</Label>
        <Select value={projectId} onValueChange={setProject}>
          <SelectTrigger className={`w-full sm:w-72 ${TAP_TARGET}`}>
            <SelectValue placeholder={isLoading ? 'Loading…' : 'Select a project'} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projectId ? (
        <>
          <BoardView projectId={projectId} onCardClick={setOpenTaskId} />
          <TaskDetailDialog
            taskId={openTaskId}
            open={!!openTaskId}
            onOpenChange={(next) => {
              if (!next) setOpenTaskId(null);
            }}
          />
        </>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Pick a project above to see its task board.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
