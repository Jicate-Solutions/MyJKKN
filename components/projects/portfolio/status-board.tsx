'use client';

/**
 * Status Board — Kanban-style columns grouping projects by overall status
 * bucket (On Track / At Risk / Delayed / Completed).
 *
 * Read-only swimlanes (no drag-and-drop): a project's column is derived from
 * its status category + rag_status via bucketForProject. This is a portfolio
 * lens, not the task board (that lives in components/projects/board, Agent B).
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  STATUS_BUCKETS,
  STATUS_BUCKET_LABELS,
  bucketForProject,
  type PortfolioProject,
  type StatusBucket,
} from '@/lib/services/projects/portfolio-service';
import { ProjectSummaryCard } from './project-summary-card';
import { BUCKET_ACCENT } from './portfolio-helpers';
import { PortfolioEmpty } from './portfolio-grid';

interface StatusBoardProps {
  projects: PortfolioProject[];
}

export function StatusBoard({ projects }: StatusBoardProps) {
  if (projects.length === 0) {
    return <PortfolioEmpty />;
  }

  const byBucket = new Map<StatusBucket, PortfolioProject[]>();
  for (const bucket of STATUS_BUCKETS) byBucket.set(bucket, []);
  for (const p of projects) {
    byBucket.get(bucketForProject(p))!.push(p);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUS_BUCKETS.map((bucket) => {
        const items = byBucket.get(bucket) ?? [];
        return (
          <div
            key={bucket}
            className={cn(
              'flex min-h-[8rem] flex-col rounded-lg border-t-4 bg-muted/30 p-3',
              BUCKET_ACCENT[bucket]
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{STATUS_BUCKET_LABELS[bucket]}</h3>
              <Badge variant="secondary" className="text-[10px]">
                {items.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-3">
              {items.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No projects
                </p>
              ) : (
                items.map((p) => <ProjectSummaryCard key={p.id} project={p} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
