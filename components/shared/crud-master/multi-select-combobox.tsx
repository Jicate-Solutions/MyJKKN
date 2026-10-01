'use client';

/**
 * MultiSelectCombobox — a generic "pick several from a list" control.
 *
 * WHERE IT CAME FROM. This is the widget that shipped inside
 * app/(routes)/cdc/bulletin/new/_components/audience-multi-select.tsx
 * (BUG-004080), lifted here unchanged when a second caller appeared — the joint
 * departments picker on the community engagement register. It is MOVED rather
 * than copied on purpose: two independent copies of a Popover + cmdk + Badge
 * multi-select drift, and the drift shows up as two controls that behave
 * differently on the same screen. The CDC file is now a thin re-export, so its
 * own caller and its own props are untouched.
 *
 * WHY NOT A RADIX SELECT. Radix Select is single-value and rejects value=""
 * outright (scripts/ci/check-radix-select-empty-values.sh is a CI gate on
 * exactly that). Anything multi-value in this repo is cmdk inside a Popover.
 */

import * as React from 'react';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
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

export interface MultiSelectOption {
  id: string;
  label: string;
}

export interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MultiSelectCombobox({
  options,
  selectedIds,
  onSelectionChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  loading = false,
  disabled = false,
  className,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOptions = React.useMemo(
    () => options.filter((o) => selectedIds.includes(o.id)),
    [options, selectedIds]
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'w-full justify-between min-h-[42px] h-auto py-2',
            !selectedIds.length && 'text-muted-foreground',
            className
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </span>
          ) : selectedOptions.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {selectedOptions.map((o) => (
                <Badge key={o.id} variant="secondary" className="flex items-center gap-1">
                  {o.label}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${o.label}`}
                    className="ml-0.5 hover:bg-accent rounded-full p-0.5 cursor-pointer"
                    onClick={(e) => remove(o.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        remove(o.id, e as unknown as React.MouseEvent);
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(420px,calc(100vw-2rem))] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        avoidCollisions={true}
      >
        <Command className="max-h-[320px] overflow-hidden">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[260px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = selectedIds.includes(o.id);
                return (
                  <CommandItem
                    key={o.id}
                    value={o.label}
                    onSelect={() => toggle(o.id)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border flex-shrink-0',
                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{o.label}</span>
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

export default MultiSelectCombobox;
