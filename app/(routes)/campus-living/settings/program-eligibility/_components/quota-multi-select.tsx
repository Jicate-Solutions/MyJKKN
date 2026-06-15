'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface QuotaMultiSelectOption {
  value: string;
  label: string;
}

interface QuotaMultiSelectProps {
  options: QuotaMultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Multi-select for quotas. Empty selection means "any quota" (stored as NULL).
export function QuotaMultiSelect({
  options,
  value,
  onChange,
  placeholder = 'All quotas — any',
  disabled,
}: QuotaMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const labelById = React.useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options]
  );
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className='w-full justify-between font-normal h-auto min-h-9'
        >
          <span className='flex flex-wrap gap-1 items-center text-left'>
            {value.length === 0 ? (
              <span className='text-muted-foreground'>{placeholder}</span>
            ) : (
              value.map((id) => (
                <Badge key={id} variant='secondary' className='font-normal'>
                  {labelById.get(id) ?? id}
                  <span
                    role='button'
                    tabIndex={0}
                    aria-label='Remove'
                    className='ml-1 inline-flex rounded-sm hover:bg-muted'
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(id);
                      }
                    }}
                  >
                    <X className='h-3 w-3' />
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] p-0'
        align='start'
      >
        <Command>
          <CommandInput placeholder='Search quotas…' />
          <CommandList>
            <CommandEmpty>No quotas found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const selected = value.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
