'use client';

/**
 * Premium semester selector — outermost row.
 *
 * Mobile (<sm): horizontally scrollable pill row with snap behavior; the
 * active pill gets a primary background and a subtle scale animation.
 * Desktop (sm+): standard tabs row.
 *
 * Renders only semesters where the student has at least one Approved is_regular
 * registration. The "Current" badge marks the highest-numbered semester.
 */

import { Calendar, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Minimal shape the tab row needs — fed by both the Internal and Result tabs. */
export interface SemesterTabItem {
  semester_code: string;
  semester_label: string;
  /** Subject count shown as the "N subj" pill. */
  count: number;
}

interface SemesterTabsProps {
  semesters: SemesterTabItem[];
  activeCode: string | null;
  currentCode: string | null;
  onSelect: (code: string) => void;
}

export function SemesterTabs({
  semesters,
  activeCode,
  currentCode,
  onSelect,
}: SemesterTabsProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>Semester</span>
      </div>

      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-thin scroll-smooth snap-x snap-mandatory pb-0.5 flex-1"
        role="tablist"
        aria-label="Semester selector"
      >
        {semesters.map((sem) => {
          const isActive = sem.semester_code === activeCode;
          const isCurrent = sem.semester_code === currentCode;
          return (
            <button
              key={sem.semester_code}
              role="tab"
              aria-selected={isActive}
              aria-controls={`semester-panel-${sem.semester_code}`}
              onClick={() => onSelect(sem.semester_code)}
              title={`${sem.semester_label} — ${sem.count} subject${sem.count === 1 ? '' : 's'}`}
              className={cn(
                'snap-start flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all',
                'min-h-[32px]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span>{sem.semester_label}</span>
              {isCurrent && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  <GraduationCap className="h-2.5 w-2.5" />
                  Current
                </span>
              )}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0 text-[10px] font-medium tabular-nums',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
                aria-label={`${sem.count} subjects`}
              >
                {sem.count} subj
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
