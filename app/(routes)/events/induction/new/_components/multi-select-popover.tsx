'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';

export function MultiSelectPopover({ options, value, onChange, placeholder, disabled }: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const selected = options.filter((o) => value.includes(o.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected.length === 0 ? <span className="text-muted-foreground">{placeholder}</span>
              : selected.length <= 2 ? selected.map((o) => o.name).join(', ')
              : `${selected.length} selected`}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto p-1" align="start">
        {options.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">No options.</p>
        ) : (
          <div role="listbox" aria-multiselectable>
            {options.map((o) => {
              const checked = value.includes(o.id);
              return (
                <button type="button" key={o.id} role="option" aria-selected={checked} onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-accent">
                  {/* Painted tick box, not a <Checkbox> — Radix's checkbox is itself a <button>,
                      and a button inside this row's button is invalid HTML (hydration mismatch).
                      The row already owns the toggle; this is decoration only. */}
                  <span aria-hidden className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow',
                    checked && 'bg-primary text-primary-foreground',
                  )}>
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate">{o.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
