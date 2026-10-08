'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export interface PickedPerson {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** Search team members by name or email — for a "named person" step such as the Chairperson. */
export function PersonPicker({
  value,
  onChange,
  placeholder = 'Choose a person…',
}: {
  value: PickedPerson | null;
  onChange: (p: PickedPerson) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [], isFetching: loading } = useQuery({
    queryKey: ['procurement-person-search', query],
    queryFn: async (): Promise<PickedPerson[]> => {
      const like = `%${query.replace(/[%_,()]/g, ' ')}%`;
      const { data, error } = await createClientSupabaseClient()
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.${like},email.ilike.${like}`)
        .neq('role', 'student')
        .eq('is_active', true)
        .order('full_name')
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PickedPerson[];
    },
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
          <span className="truncate">
            {value ? `${value.full_name ?? '(no name)'}${value.email ? ` · ${value.email}` : ''}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type a name or email…" value={term} onValueChange={setTerm} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : (
              <CommandEmpty>{term.trim().length < 2 ? 'Type at least 2 letters.' : 'Nobody found.'}</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value?.id === p.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">
                    {p.full_name ?? '(no name)'}
                    {p.email && <span className="text-muted-foreground"> · {p.email}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
