'use client';

/**
 * Searchable State / District picker for the staff form.
 *
 * THE ONE RULE THIS COMPONENT EXISTS TO ENFORCE: an unrecognised stored value
 * must still be VISIBLE. The label falls back to the raw value
 * (`options.find(...)?.name ?? value`) rather than rendering empty.
 *
 * Why that matters: a fixed picker fed a value outside its dataset shows a blank
 * field, and because State/District are required the operator's only way to save
 * an unrelated edit is to choose something else — silently overwriting a correct
 * address. That is not hypothetical; it happened to learner taluks, where a
 * learner whose taluk was KANAGAGRI could not be saved without destroying it.
 *
 * The staff address data was standardised before this shipped, so the fallback
 * should rarely fire — it is here for anything that slips in later.
 */

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface LocationOption {
  id: string;
  name: string;
}

export function LocationCombobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  disabledText,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  options: LocationOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  /** Shown instead of the placeholder while disabled, e.g. "First select state". */
  disabledText?: string;
}) {
  const [open, setOpen] = useState(false);

  // Fallback to the raw value — see the note at the top of this file.
  const label = value ? (options.find((o) => o.id === value)?.name ?? value) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !label && 'text-muted-foreground'
          )}
        >
          <span className='truncate'>
            {label || (disabled && disabledText ? disabledText : placeholder)}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
