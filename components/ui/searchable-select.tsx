'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Applied to the trigger button (use to set width, e.g. "w-[220px]") */
  className?: string;
  /**
   * Set to `true` when rendering this inside a Radix `Dialog`. Without it,
   * the Popover portals outside the Dialog DOM and Dialog's pointer-down-
   * outside handler races (and beats) cmdk's `onSelect` — clicks appear to
   * do nothing. Defaults to `false` for page-level usage so the page can
   * still scroll while the popover is open.
   */
  modal?: boolean;
}

/**
 * Searchable combobox — wraps Command + Popover to give every dropdown a
 * built-in %value% contains-search input. Options are filtered client-side
 * across both label and value so users can search by code or display name.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No results found.',
  disabled = false,
  loading = false,
  className,
  modal = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // When opened inside a Radix Dialog (modal), portal the popover INTO the
  // dialog instead of document.body. Otherwise the Dialog's focus-trap eats
  // keystrokes (search input dead) and react-remove-scroll's scroll-lock eats
  // wheel events (dropdown won't scroll) because the portaled content sits
  // outside the dialog DOM subtree. Resolve the container in the open handler
  // (not an effect) to avoid the set-state-in-effect cascade lint.
  const [dialogContainer, setDialogContainer] = React.useState<HTMLElement | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next && modal) {
      setDialogContainer(
        (triggerRef.current?.closest(
          '[role="dialog"],[role="alertdialog"]',
        ) as HTMLElement | null) ?? null,
      );
    }
    setOpen(next);
  };

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'justify-between font-normal',
            !selectedLabel && 'text-muted-foreground',
            className,
          )}
        >
          {loading ? (
            <span className='flex items-center gap-1.5'>
              <Loader2 className='h-3 w-3 animate-spin' />
              Loading…
            </span>
          ) : (
            <span className='truncate'>{selectedLabel ?? placeholder}</span>
          )}
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        container={modal ? dialogContainer : undefined}
        className='p-0 w-full'
        style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '250px' }}
        align='start'
        onOpenAutoFocus={(e) => {
          // When portaled INTO a scrollable DialogContent (modal), the
          // popover's DOM sits at the end of the container, so the default
          // focus scrolls the dialog to the bottom and the dropdown appears
          // to jump. Focus the search input without scrolling instead.
          e.preventDefault();
          contentRef.current
            ?.querySelector<HTMLInputElement>('[cmdk-input]')
            ?.focus({ preventScroll: true });
        }}
      >
        <Command
          filter={(cmdValue, search) =>
            cmdValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opt, idx) => (
                <CommandItem
                  key={opt.value || `empty-${idx}`}
                  // Include both label + value so search matches either
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === opt.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
