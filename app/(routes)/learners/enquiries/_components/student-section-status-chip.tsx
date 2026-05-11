'use client';

// student-section-status-chip.tsx — small badge showing whether a student
// section was filled by the student via QR, by admission as override, or
// is still empty.

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface Props {
  filled: boolean;
  filledAt: string | null;
  filledBy: 'student' | 'admission_override' | null;
  canOverride: boolean;
  onOverrideClick?: () => void;
}

export function StudentSectionStatusChip({
  filled, filledAt, filledBy, canOverride, onOverrideClick,
}: Props) {
  if (filled) {
    const ts = filledAt
      ? new Date(filledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '—';
    const label = filledBy === 'admission_override'
      ? `Filled by admission (override) on ${ts}`
      : `Filled by student via QR on ${ts}`;
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        <Check className="h-3 w-3 mr-1" /> {label}
      </Badge>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <X className="h-3 w-3 mr-1" /> Empty
      </Badge>
      {canOverride && onOverrideClick && (
        <Button size="sm" variant="outline" onClick={onOverrideClick}>
          Edit override
        </Button>
      )}
    </div>
  );
}
