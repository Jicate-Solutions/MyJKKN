'use client';

/**
 * Portfolio Grid — responsive card grid of full-metric project cards.
 *
 * Pure presentational: takes an already-loaded list of PortfolioProjects.
 * Loading / error / empty states are handled by the page so the grid stays
 * reusable inside the status board too.
 */

import { FolderKanban } from 'lucide-react';
import type { PortfolioProject } from '@/lib/services/projects/portfolio-service';
import { ProjectSummaryCard } from './project-summary-card';

interface PortfolioGridProps {
  projects: PortfolioProject[];
}

export function PortfolioGrid({ projects }: PortfolioGridProps) {
  if (projects.length === 0) {
    return <PortfolioEmpty />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((p) => (
        <ProjectSummaryCard key={p.id} project={p} />
      ))}
    </div>
  );
}

export function PortfolioEmpty({
  message = 'No projects match the current view.',
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium">Nothing to show yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
