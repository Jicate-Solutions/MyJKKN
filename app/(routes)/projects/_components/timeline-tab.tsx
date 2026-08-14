'use client';

/**
 * Timeline Tab (Feature F2 entry point on /projects?view=timeline)
 *
 * The Gantt itself has existed since F2 — `TimelineView`, rendered by the
 * per-project route `/projects/[id]/timeline`. Only this tab was missing, so
 * the shell kept showing a "Coming in the next PR (Wave 3)" card for a view
 * that was already built. `TimelineView`'s own header anticipated this wiring:
 * "the `/projects` shell Timeline tab can render it once a project is picked."
 *
 * Deliberately mirrors BoardTab, down to sharing the `?project=` search param,
 * so a project chosen on the Board is still chosen when you switch to Timeline.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md (F2).
 */

import { useCallback } from 'react';
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
import { TimelineView } from '@/components/projects/timeline/timeline-view';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';

export function TimelineTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project') ?? '';

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
        <TimelineView projectId={projectId} />
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Pick a project above to see its timeline.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
