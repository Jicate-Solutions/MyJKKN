'use client';

/**
 * Segmented control for Assessment | Final inside the Internal Marks view.
 *
 * iOS-style pill on mobile, full-width on small screens. Animated active
 * indicator using a sliding background. The "Final" tab shows a small
 * pulse dot when in Phase 1 stub mode (Coming Soon).
 */

import { ClipboardCheck, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

type Subview = 'assessment' | 'final';

interface Props {
  value: Subview;
  onChange: (next: Subview) => void;
}

const TABS: Array<{ key: Subview; label: string; icon: typeof ClipboardCheck; helper?: string }> = [
  { key: 'assessment', label: 'Assessment', icon: ClipboardCheck, helper: 'Round-wise marks' },
  { key: 'final', label: 'Final', icon: Award, helper: 'Consolidated total' },
];

export function AssessmentFinalTabs({ value, onChange }: Props) {
  return (
    <div className="rounded-lg border bg-muted/40 p-0.5 grid grid-cols-2 gap-0.5">
      {TABS.map((tab) => {
        const isActive = value === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={cn(
              'relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-all',
              'min-h-[36px]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-primary' : '')} />
            <span>{tab.label}</span>
            <span className="hidden sm:inline text-[10px] text-muted-foreground/80 font-normal">
              {tab.helper}
            </span>
          </button>
        );
      })}
    </div>
  );
}
