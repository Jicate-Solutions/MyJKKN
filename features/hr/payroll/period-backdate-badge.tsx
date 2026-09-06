'use client';

/**
 * PeriodBackdateBadge — amber pill rendered next to a status pill when
 * hr_payroll_periods.is_backdated = true.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md E2 + E5:
 *   - Color amber (collision-resolved against accounts_verified purple).
 *   - Icon: clock-rewind (lucide History).
 *   - Hover tooltip shows backdate_reason.
 *   - Click scrolls audit timeline to the row tagged stage='backdated_approval'.
 *   - On mobile (touch): hover becomes long-press → bottom-sheet (handled by
 *     Shadcn Tooltip primitive, which falls back to click-to-open on touch).
 */

import { History } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const BACKDATE_AUDIT_ROW_ID = 'audit-row-backdated_approval';

export function PeriodBackdateBadge({
  isBackdated,
  reason,
  scrollToAudit = true,
}: {
  isBackdated: boolean;
  reason?: string | null;
  scrollToAudit?: boolean;
}) {
  if (!isBackdated) return null;

  const handleClick = () => {
    if (!scrollToAudit) return;
    const el = document.getElementById(BACKDATE_AUDIT_ROW_ID);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
              'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
            )}
            aria-label={reason ? `Backdated: ${reason}` : 'Backdated'}
          >
            <History className="h-3 w-3" />
            Backdated
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium mb-1">Backdated approval</p>
          {reason ? (
            <p className="text-xs whitespace-pre-wrap">{reason}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No reason recorded</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
