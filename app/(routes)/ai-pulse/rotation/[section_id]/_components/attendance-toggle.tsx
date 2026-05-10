// app/(routes)/ai-pulse/rotation/[section_id]/_components/attendance-toggle.tsx
// Wave B.3 — Present / Absent / Late three-state toggle for one learner.
//
// Pattern: segmented button group, mirrors faculty-quick-attendance.tsx
// (academic/attendance) which uses inline button group rather than a Radix
// component. Keeps the row dense (one short tap path on mobile).

'use client';

import { Check, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AttendanceStatus } from '@/lib/services/ai-pulse/rotation-service';

interface AttendanceToggleProps {
  value: AttendanceStatus | null;
  onChange: (next: AttendanceStatus) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{
  value: AttendanceStatus;
  label: string;
  Icon: typeof Check;
  /** Tailwind classes when this option is the active selection. */
  activeClass: string;
}> = [
  {
    value: 'Present',
    label: 'Present',
    Icon: Check,
    activeClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
  {
    value: 'Late',
    label: 'Late',
    Icon: Clock,
    activeClass: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  {
    value: 'Absent',
    label: 'Absent',
    Icon: X,
    activeClass: 'bg-red-600 text-white hover:bg-red-700',
  },
];

export function AttendanceToggle({
  value,
  onChange,
  disabled = false,
}: AttendanceToggleProps) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
      role="radiogroup"
      aria-label="Attendance status"
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        const Icon = opt.Icon;
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant="ghost"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-8 px-2.5 gap-1 text-xs font-medium transition-colors',
              isActive
                ? opt.activeClass
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
