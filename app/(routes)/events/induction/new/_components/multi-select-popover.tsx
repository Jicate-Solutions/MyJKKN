'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronsUpDown } from 'lucide-react';

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
        ) : options.map((o) => (
          <button type="button" key={o.id} onClick={() => toggle(o.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-accent">
            <Checkbox checked={value.includes(o.id)} onCheckedChange={() => {}} className="pointer-events-none" />
            <span className="truncate">{o.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
