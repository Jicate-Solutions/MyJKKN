'use client';

/**
 * Project Summary Card — full-metric card for the portfolio grid / status board.
 *
 * Shows: title + code, R/A/G left border, status + type chips, % complete bar,
 * X/Y task count, due date, owner avatar, budget summary, open-risk count,
 * last-activity timestamp. Clicking opens the project detail route.
 *
 * Pattern: components/hr/recruitment-need/signal-card.tsx
 *   (left-border R/A/G accent, clickable Card, muted metadata row).
 */

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  ListChecks,
  AlertTriangle,
  Wallet,
  Clock,
} from 'lucide-react';
import type { PortfolioProject } from '@/lib/services/projects/portfolio-service';
import {
  ragBorder,
  ragDot,
  RAG_LABEL,
  initials,
  formatInrCompact,
  formatRelative,
  formatShortDate,
} from './portfolio-helpers';

interface ProjectSummaryCardProps {
  project: PortfolioProject;
  className?: string;
}

export function ProjectSummaryCard({ project, className }: ProjectSummaryCardProps) {
  const m = project.metrics;
  const pct = Math.max(0, Math.min(100, Math.round(project.percent_complete ?? 0)));
  const dueLabel = formatShortDate(project.due_date);
  const isOverdue =
    !!project.due_date &&
    new Date(project.due_date).getTime() < Date.now() &&
    project.status?.category !== 'done';

  return (
    <Card
      className={cn(
        'group h-full border-l-4 transition-all hover:shadow-md',
        ragBorder(project.rag_status),
        className
      )}
    >
      <Link
        href={`/projects/${project.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
      >
        <CardContent className="p-4">
          {/* Header: title + status chip */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold group-hover:text-primary">
                {project.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {project.code ? `${project.code} · ` : ''}
                {project.institutionName ?? 'Unassigned'}
              </p>
            </div>
            <span
              className={cn(
                'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                'bg-muted text-muted-foreground'
              )}
              title={RAG_LABEL[project.rag_status] ?? project.rag_status}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', ragDot(project.rag_status))} />
              {project.status?.name ?? RAG_LABEL[project.rag_status] ?? '—'}
            </span>
          </div>

          {/* Type + OKR chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {project.project_type?.name && (
              <Badge variant="outline" className="text-[10px]">
                {project.project_type.name}
              </Badge>
            )}
            {project.is_okr && (
              <Badge variant="secondary" className="text-[10px]">
                OKR
              </Badge>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{pct}% complete</span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3 w-3" />
                {m.taskDone}/{m.taskTotal} tasks
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  pct >= 100 ? 'bg-emerald-500' : 'bg-primary'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Metrics row */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className={cn(isOverdue && 'font-medium text-red-600')}>
                Due {dueLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              {m.budgetPlanned > 0 ? (
                <span>
                  {formatInrCompact(m.budgetActual)}/{formatInrCompact(m.budgetPlanned)}
                </span>
              ) : (
                <span>No budget</span>
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  m.openRiskCount > 0 ? 'text-amber-500' : ''
                )}
              />
              {m.openRiskCount} open risk{m.openRiskCount === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {formatRelative(m.lastActivityAt)}
            </span>
          </div>

          {/* Owner footer */}
          <div className="mt-3 flex items-center gap-2 border-t pt-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {initials(project.ownerName)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-muted-foreground">
              {project.ownerName ?? 'Unassigned owner'}
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
