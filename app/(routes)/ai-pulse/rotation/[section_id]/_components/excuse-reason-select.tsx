// app/(routes)/ai-pulse/rotation/[section_id]/_components/excuse-reason-select.tsx
// Wave B.3 — dropdown for absent-learner excuse reason.
// Reason vocabulary is locked in rotation-service (EXCUSE_REASON_OPTIONS) so
// the chip set + service contract stay in lockstep.

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EXCUSE_REASON_OPTIONS,
  type ExcuseReason,
} from '@/lib/services/ai-pulse/rotation-service';

interface ExcuseReasonSelectProps {
  value: ExcuseReason | undefined;
  onChange: (next: ExcuseReason) => void;
  disabled?: boolean;
  /** Render small enough to sit inline on a row. */
  compact?: boolean;
}

export function ExcuseReasonSelect({
  value,
  onChange,
  disabled = false,
  compact = true,
}: ExcuseReasonSelectProps) {
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as ExcuseReason)}
      disabled={disabled}
    >
      <SelectTrigger
        className={compact ? 'h-8 w-[160px] text-xs' : 'h-9 w-[200px]'}
        aria-label="Excuse reason"
      >
        <SelectValue placeholder="Pick reason" />
      </SelectTrigger>
      <SelectContent>
        {EXCUSE_REASON_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
