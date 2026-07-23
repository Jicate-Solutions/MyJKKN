'use client';

/**
 * AudienceMultiSelect — a small generic multi-select used by the CDC bulletin
 * "Post Opportunity" form to pick a structured target audience (BUG-004080).
 *
 * Modeled on components/ui/multi-role-selector.tsx (Popover + cmdk Command +
 * Badge), but generic over a plain { id, label } item shape so the same widget
 * drives both the Departments and Programs pickers. Kept local to the bulletin
 * form rather than promoted to components/ui — it has no other consumer yet.
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

export interface AudienceOption {
  id: string;
  label: string;
}

interface AudienceMultiSelectProps {
  options: AudienceOption[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AudienceMultiSelect({
  options,
  selectedIds,
  onSelectionChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  loading = false,
  disabled = false,
  className,
}: AudienceMultiSelectProps) {
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

export default AudienceMultiSelect;
