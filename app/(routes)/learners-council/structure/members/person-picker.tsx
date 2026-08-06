'use client';
// app/(routes)/learners-council/structure/members/person-picker.tsx
// Searchable people picker for the LC "Assign Member" dialog.
//
// Replaces a raw UUID text input ("Enter the learner's user ID") that no office
// bearer could realistically fill in — the same failure CDC fixed for its own
// pickers. Emits profiles.id, which is what lc_members.user_id references.

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface PersonOption {
  value: string;
  label: string;
  sublabel?: string | null;
}

interface PersonPickerProps {
  value: string;
  onChange: (userId: string) => void;
  id?: string;
  disabled?: boolean;
  /**
   * 'lc_members' narrows the pool to the sitting council for the given term —
   * used for the 4 executive seats, which are elected FROM existing members.
   */
  scope?: 'all' | 'lc_members';
  termId?: string;
}

export function PersonPicker({
  value,
  onChange,
  id,
  disabled,
  scope = 'all',
  termId,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [options, setOptions] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce typing so we do not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ search: debounced, scope });
    if (termId) params.set('term_id', termId);
    fetch(`/api/learners-council/pickers/people?${params.toString()}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((d) => {
        if (!cancelled) setOptions(d.options || []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, scope, termId]);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && 'text-muted-foreground')}>
            {selected?.label || (value ? 'Selected' : 'Search by name or email…')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a name or email…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            )}
            {!loading && (
              <>
                <CommandEmpty>No one found.</CommandEmpty>
                <CommandGroup>
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === o.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="flex flex-col">
                        <span>{o.label}</span>
                        {o.sublabel && (
                          <span className="text-xs text-muted-foreground">
                            {o.sublabel}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
