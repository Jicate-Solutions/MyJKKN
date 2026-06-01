'use client';

/**
 * ScopeBadge — read-only display of a project's scope_model.
 *
 * Maps the three DB values to a coloured badge:
 *   single_institution → blue
 *   cross_institution  → violet
 *   global             → amber
 *
 * Does NOT mutate scope_model (editing the create form is owned by another agent).
 */

import { Badge } from '@/components/ui/badge';
import type { ProjectScopeModel } from '@/types/projects';

const SCOPE_LABELS: Record<string, { label: string; variant: string }> = {
  single_institution: { label: 'Single institution', variant: 'secondary' },
  cross_institution: { label: 'Cross-institution', variant: 'outline' },
  global: { label: 'Global', variant: 'default' },
};

interface ScopeBadgeProps {
  scopeModel: ProjectScopeModel | string | null | undefined;
  className?: string;
}

export function ScopeBadge({ scopeModel, className }: ScopeBadgeProps) {
  const meta = scopeModel ? SCOPE_LABELS[scopeModel] : null;

  if (!meta) {
    return (
      <Badge variant="outline" className={className}>
        Unknown scope
      </Badge>
    );
  }

  // Tailwind inline classes for the three variants so they override the
  // default badge palette without touching global styles.
  const colorClass =
    scopeModel === 'single_institution'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : scopeModel === 'cross_institution'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <Badge variant="outline" className={`${colorClass} ${className ?? ''}`}>
      {meta.label}
    </Badge>
  );
}
