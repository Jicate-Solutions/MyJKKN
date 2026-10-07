'use client';

// Loading, error and empty states for the intake screens. An error is never
// drawn as an empty list (rule #27): it says what went wrong and offers a retry.

import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function IntakeLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-border p-6 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function IntakeError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.';
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-600/30 bg-red-600/5 p-4 text-sm dark:border-red-400/30 dark:bg-red-400/5 sm:flex-row sm:items-start"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function IntakeEmpty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium text-foreground">{title}</p>
      {detail && <p className="text-muted-foreground">{detail}</p>}
    </div>
  );
}
