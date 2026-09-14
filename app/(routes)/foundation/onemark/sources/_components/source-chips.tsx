'use client';

// OneMark — pick which sources a sitting draws from.
//
// Director ruling (c) of 2026-09-06: a learner may choose sources in practice
// and in vault review, not only a Senior Learner building a paper. This is that
// picker, built once and imported wherever it is needed, so the wording and the
// "none ticked means all" rule can never drift between two screens.
//
// TWO RULES THE CHIPS OBEY
//   · Nothing ticked = every source. An empty choice must never mean an empty
//     sitting, which is exactly what a naive `.in()` would produce.
//   · A retired source is hidden — unless it is already ticked, in which case it
//     stays visible so a saved choice is never dropped out from under the person
//     who made it. They can untick it; the screen will not untick it for them.
//
// Used by the sources screen's own preview and offered to the practice start
// card and the vault-review panel (files Lane L owns — see the PR body).

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickerSources, type OneMarkSourceRow } from '@/lib/services/onemark/sources-service';

export interface SourceChipsProps {
  sources: readonly OneMarkSourceRow[];
  /** Ticked keys. Empty = every source, which is the default. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
  /** Shown above the chips. Pass null for a bare row of chips. */
  label?: string | null;
}

export function SourceChips({
  sources,
  value,
  onChange,
  disabled = false,
  className,
  label = 'Where the questions come from',
}: SourceChipsProps) {
  const visible = pickerSources(sources, value);
  const allSelected = value.length === 0;

  if (visible.length === 0) return null;

  function toggle(key: string) {
    if (disabled) return;
    const next = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    // Every chip ticked is the same request as none ticked. Normalising here
    // keeps what gets stored on the sitting honest for the evidence screen,
    // which reads it back to know what was asked for.
    onChange(next.length === visible.length ? [] : next);
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          {!allSelected ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([])}
              className="text-xs font-medium text-[#0b6d41] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Use all
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Chip
          selected={allSelected}
          disabled={disabled}
          onClick={() => onChange([])}
          title="Draw from every source"
        >
          All sources
        </Chip>
        {visible.map((s) => (
          <Chip
            key={s.key}
            selected={value.includes(s.key)}
            disabled={disabled}
            retired={!s.is_active}
            onClick={() => toggle(s.key)}
            title={s.description ?? undefined}
          >
            {s.label}
            {!s.is_active ? <span className="ml-1 text-[10px] uppercase">· retired</span> : null}
          </Chip>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {allSelected
          ? 'Drawing from every source. Tick one or more to narrow it.'
          : 'Only the ticked sources will be drawn from. If a tick leaves too few questions, you will be given the ones there are — never questions from somewhere else.'}
      </p>
    </div>
  );
}

function Chip({
  selected,
  disabled,
  retired,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  retired?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41] focus-visible:ring-offset-1',
        selected
          ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
          : 'border-border bg-background text-foreground hover:border-[#0b6d41]/50 hover:bg-muted',
        retired && !selected && 'opacity-60',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
      {children}
    </button>
  );
}
