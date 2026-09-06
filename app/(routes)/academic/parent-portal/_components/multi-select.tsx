'use client';

/**
 * Lightweight multi-select with search (%value%), Select All, and selected chips.
 * Self-contained (no Popover) to avoid portal/race issues; a fixed backdrop
 * closes it on outside click.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiOption {
  value: string;
  label: string;
  sub?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled,
}: {
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.sub?.toLowerCase().includes(needle)
    );
  }, [options, q]);

  const allSelected = options.length > 0 && selected.length === options.length;
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-white p-2.5 text-left text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41] disabled:opacity-60 dark:bg-neutral-900"
      >
        <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
          {selected.length === 0
            ? placeholder
            : selected.length === options.length
            ? `All (${selected.length})`
            : `${selected.length} selected`}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-72 w-full overflow-hidden rounded-lg border bg-white shadow-lg dark:bg-neutral-900">
            <div className="flex items-center gap-2 border-b px-2.5 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            {options.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className={cn('grid h-4 w-4 place-items-center rounded border', allSelected && 'border-[#0b6d41] bg-[#0b6d41] text-white')}>
                  {allSelected && <Check className="h-3 w-3" />}
                </span>
                Select all
              </button>
            )}
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">No matches</p>
              ) : (
                filtered.map((o) => {
                  const on = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', on && 'border-[#0b6d41] bg-[#0b6d41] text-white')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.sub && <span className="shrink-0 text-xs text-muted-foreground">{o.sub}</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* selected chips — show all, brand yellow */}
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-[#ffde59]/70 px-2 py-0.5 text-[11px] font-medium text-neutral-800 ring-1 ring-[#ffde59]"
            >
              <span className="max-w-[12rem] truncate">{labelOf(v)}</span>
              <button type="button" onClick={() => toggle(v)} aria-label="Remove" className="text-neutral-600 hover:text-neutral-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
