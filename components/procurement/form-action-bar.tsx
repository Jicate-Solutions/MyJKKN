'use client';

import type { ReactNode } from 'react';

/**
 * The save bar for every procurement form: pinned to the bottom of the screen so
 * Save never scrolls away on a long form.
 *
 *   status (left)                                  Cancel · Primary (right)
 *
 * - Sits above the phone bottom navigation (bottom-nav-safe), flush at lg+.
 * - Right padding keeps the buttons clear of the floating help buttons on phones;
 *   from md the procurement layout's right gutter does that.
 * - On a phone the buttons go full width with the primary on top (flex-col-reverse:
 *   pass Cancel first, then the primary).
 * - Bleeds to the page edges (ContentLayout pads px-4 / sm:px-8), so render it as a
 *   direct child of the page wrapper, not inside a card.
 */
export function FormActionBar({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-nav-safe z-20 -mx-4 mt-2 border-t bg-background/95 px-4 py-3 pr-20 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-8 sm:px-8 sm:pr-20 md:pr-8 lg:bottom-0">
      <div className="flex flex-wrap items-center gap-2">
        {status && <div className="w-full min-w-0 text-xs text-muted-foreground sm:mr-auto sm:w-auto">{status}</div>}
        <div className="flex w-full flex-col-reverse gap-2 sm:ml-auto sm:w-auto sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
