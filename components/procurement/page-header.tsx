import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Omit when the page already shows its title (ContentLayout) — avoids a duplicate heading. */
  title?: ReactNode;
  description?: ReactNode;
  /** Buttons; they stack full-width on phones and sit inline from `sm`. */
  actions?: ReactNode;
  /** Back link / breadcrumb rendered above the title. */
  back?: ReactNode;
  className?: string;
}

/** Shared header for every procurement page, so titles and actions line up. */
export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {back}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {title && <h2 className="break-words text-2xl font-semibold tracking-tight">{title}</h2>}
          {description && (
            <p className={cn('text-sm text-muted-foreground', title && 'mt-1')}>{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The list toolbar: one wrapping row (search flex-1 · filters · primary action last),
 * as on Requests. Children size themselves (h-9; `w-full sm:w-52` for selects).
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
