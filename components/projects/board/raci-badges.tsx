'use client';

/**
 * RACI badge strip — compact A/R/C/I letters showing which accountability roles
 * are filled on a task. Filled letters are colored; unfilled are dimmed.
 *
 * Spec: RACI substrate (PR1) for the auto-accountability meeting engine.
 */

import { RACI_ROLES, RACI_LETTERS, RACI_LABELS, type RaciRole } from '@/types/projects';
import { cn } from '@/lib/utils';

const ROLE_FILLED_CLASS: Record<RaciRole, string> = {
  responsible: 'bg-blue-100 text-blue-700 border-blue-200',
  accountable: 'bg-amber-100 text-amber-800 border-amber-300',
  consulted: 'bg-violet-100 text-violet-700 border-violet-200',
  informed: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface RaciBadgesProps {
  /** The roles currently filled on the task. */
  filledRoles: Set<RaciRole> | RaciRole[];
  className?: string;
  /** When true, render unfilled letters dimmed too (full A/R/C/I strip). */
  showEmpty?: boolean;
}

export function RaciBadges({ filledRoles, className, showEmpty = false }: RaciBadgesProps) {
  const filled = filledRoles instanceof Set ? filledRoles : new Set(filledRoles);

  const visibleRoles = showEmpty ? RACI_ROLES : RACI_ROLES.filter((r) => filled.has(r));
  if (visibleRoles.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {visibleRoles.map((role) => {
        const isFilled = filled.has(role);
        return (
          <span
            key={role}
            title={`${RACI_LABELS[role]}${isFilled ? '' : ' (unassigned)'}`}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] font-semibold leading-none',
              isFilled
                ? ROLE_FILLED_CLASS[role]
                : 'border-dashed border-muted-foreground/30 text-muted-foreground/40'
            )}
          >
            {RACI_LETTERS[role]}
          </span>
        );
      })}
    </div>
  );
}
