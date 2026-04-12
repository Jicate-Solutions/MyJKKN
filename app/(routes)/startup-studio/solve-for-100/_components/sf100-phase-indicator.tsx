'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Phase {
  id: string;
  label: string;
  /** Minimum paid users required to enter this phase */
  threshold: number | null;
}

const PHASES: Phase[] = [
  { id: 'setup', label: 'Setup', threshold: null },
  { id: 'problem_solution_fit', label: 'Problem-Solution Fit', threshold: null },
  { id: 'first_users', label: 'First Users', threshold: 5 },
  { id: 'growth', label: 'Growth', threshold: 25 },
  { id: 'hundred_users', label: '100 Users', threshold: 100 },
  { id: 'graduated', label: 'Graduated → NIF', threshold: null },
];

interface SF100PhaseIndicatorProps {
  /** The ID of the current phase from the enrollment record */
  currentPhase: string;
}

export function SF100PhaseIndicator({ currentPhase }: SF100PhaseIndicatorProps) {
  const currentIndex = PHASES.findIndex((p) => p.id === currentPhase);

  return (
    <div className="space-y-1" role="list" aria-label="Program phases">
      {PHASES.map((phase, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div
            key={phase.id}
            role="listitem"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              isCurrent && 'bg-primary/10',
              isCompleted && 'opacity-80',
            )}
          >
            {/* Phase icon */}
            <div className="flex-shrink-0 relative">
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              ) : isCurrent ? (
                <div className="relative h-5 w-5 flex items-center justify-center" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <span className="relative h-3 w-3 rounded-full bg-primary" />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" aria-hidden="true" />
              )}
            </div>

            {/* Phase label */}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm leading-tight truncate',
                  isCompleted && 'text-muted-foreground line-through',
                  isCurrent && 'font-semibold text-primary',
                  isFuture && 'text-muted-foreground',
                )}
              >
                {phase.label}
                {phase.threshold !== null && (
                  <span className="ml-1 text-xs font-normal opacity-70">
                    ({phase.threshold}+)
                  </span>
                )}
              </p>
            </div>

            {/* "You are here" tag */}
            {isCurrent && (
              <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
