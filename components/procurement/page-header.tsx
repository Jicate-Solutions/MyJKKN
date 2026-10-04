import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
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
          <h2 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>
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

/** Filter row: stacked on phones, inline from `sm`. Children set their own `sm:w-*`. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4', className)}>
      {children}
    </div>
  );
}
