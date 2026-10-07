'use client';

import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The one header for a procurement document page (purchase, order, delivery):
 *   ‹ back · title · status badge · meta line          actions (right)
 * The app bar already names the section, so there is no second, larger title.
 * On a phone the actions drop under the title and share the row width.
 */
export function DetailHeader({
  backLabel,
  onBack,
  title,
  badge,
  meta,
  actions,
}: {
  /** Where back goes, for the button's accessible name ("Back to the purchase"). */
  backLabel: string;
  onBack: () => void;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  /** Buttons; the filled (primary) one goes last. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 break-words text-xl font-bold">{title}</h1>
        {badge}
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>
      )}
    </header>
  );
}
