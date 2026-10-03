'use client';

// "Before you submit" — the checklist + submit panel beside the report /
// request forms, ported from the standalone app (components/form-submit-panel.tsx).
// Desktop: a sticky card beside the form. Phone: the same card below the form.

import type { ReactNode } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export function FormSubmitPanel({
  items,
  submitLabel,
  pendingLabel = 'Submitting…',
  isPending,
  disabled,
  onCancel,
  note
}: {
  items: readonly ChecklistItem[];
  submitLabel: string;
  pendingLabel?: string;
  isPending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  note?: ReactNode;
}) {
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Submit">
      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Before you submit</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {done} of {total}
            </p>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Required fields filled in"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
                  item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                )}
                aria-hidden
              >
                {item.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className={item.done ? 'text-muted-foreground' : undefined}>{item.label}</span>
              <span className="sr-only">{item.done ? ' — filled in' : ' — still needed'}</span>
            </li>
          ))}
        </ul>

        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

        <Button type="submit" size="lg" disabled={isPending || disabled} className="w-full">
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </aside>
  );
}
