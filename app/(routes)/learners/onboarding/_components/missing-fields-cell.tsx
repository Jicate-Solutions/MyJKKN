'use client';
/**
 * Renders one red pill per missing required field.
 * Field labels come from MISSING_FIELD_LABELS so they stay consistent with the
 * filter dropdown and the API auto-correction log.
 */

import { Badge } from '@/components/ui/badge';
import { MISSING_FIELD_LABELS, type MissingField } from '@/types/learner-onboarding';

interface MissingFieldsCellProps {
  fields: MissingField[];
}

export function MissingFieldsCell({ fields }: MissingFieldsCellProps) {
  if (fields.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {fields.map((f) => (
        <Badge
          key={f}
          variant="outline"
          className="border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 text-[10px] font-medium px-1.5 py-0"
        >
          {MISSING_FIELD_LABELS[f]}
        </Badge>
      ))}
    </div>
  );
}
