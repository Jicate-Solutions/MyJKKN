'use client';

// The Director's alert for complaints "about the Joint MD" (#4079, round 8).
// These complaints raise no bell or push notice — the notifications tables
// have too many privileged readers to keep one from the Joint MD — so the
// complaint list tells the Director instead. The count comes from
// fn_grievance_confidential_awaiting_count, which answers 0 for everybody who
// is not the Director handling them (the Joint MD and every other super admin
// included); at 0 nothing renders.

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfidentialAwaitingBanner({
  count,
  showingOnlyThese,
  onToggle,
}: {
  count: number;
  showingOnlyThese: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (count <= 0 && !showingOnlyThese) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        Confidential: {count} awaiting you
      </p>
      <Button size="sm" variant="outline" onClick={() => onToggle(!showingOnlyThese)}>
        {showingOnlyThese ? 'Show all tickets' : 'Show them'}
      </Button>
    </div>
  );
}
