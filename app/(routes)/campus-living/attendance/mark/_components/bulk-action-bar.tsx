'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, X } from 'lucide-react';

/**
 * Bulk Present / Absent bar for the Mark Attendance page.
 *
 * Renders as a row INSIDE the page's existing sticky footer, above the
 * Review & Submit row — not as its own sticky element. Two independently
 * pinned bars would overlap at the bottom of the viewport.
 *
 * Only Present and Absent are offered in bulk. On Leave / Late Entry / Medical
 * remain per-resident: they are individual determinations, and five buttons
 * wrap badly on a phone, which is where roll call actually happens.
 */
export function BulkActionBar({
  count,
  onMarkPresent,
  onMarkAbsent,
  onClearSelection,
}: {
  /** Residents both selected and currently visible. */
  count: number;
  onMarkPresent: () => void;
  onMarkAbsent: () => void;
  onClearSelection: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">
        {count} resident{count === 1 ? '' : 's'} selected
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onMarkPresent}
          className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 dark:bg-green-950 dark:text-green-400 dark:border-green-900"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark Present
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onMarkAbsent}
          className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:bg-red-950 dark:text-red-400 dark:border-red-900"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Mark Absent
        </Button>
        <Button size="sm" variant="ghost" onClick={onClearSelection}>
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
