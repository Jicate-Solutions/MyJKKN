'use client';

/**
 * Institution + staff filter for the My Attendance page.
 * Created: 2026-08-09.
 *
 * Rendered ONLY for super admins and holders of hr.attendance.view_all
 * (HR Head, HR Administrator — 2 roles today). Everyone else never sees it and
 * always reads their own record.
 *
 * This is a convenience gate, not the security boundary. The real one is the
 * `hr_attendance_records_select` RLS policy, which permits the row's own staff
 * member plus view_all/override holders within role_has_institution_access().
 * A user who forges a ?staff= id outside their scope gets zero rows back, not
 * someone else's attendance.
 *
 * Institution options come from useInstitutionsWithAccess (via
 * HrInstitutionSelect), never from a branch on isSuperAdmin — branching on the
 * flag silently strips access from secondary roles carrying scope='all'.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HrInstitutionSelect } from '@/components/hr/hr-institution-select';
import { useStaffSearch } from '@/hooks/hr/use-leave-assignments';
import { cn } from '@/lib/utils';

export interface SelectedStaff {
  id: string;
  name: string;
}

export function AttendanceStaffFilter({
  selected,
  onSelect,
  onReset,
  selfName,
}: {
  /** null = viewing your own record. */
  selected: SelectedStaff | null;
  onSelect: (staff: SelectedStaff) => void;
  onReset: () => void;
  selfName: string;
}) {
  const [institutionId, setInstitutionId] = useState('');
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debouncing a keystroke stream is the legitimate use of an effect: it
  // synchronises with a timer and cleans up on change.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isLoading } = useStaffSearch(institutionId || undefined, debounced);
  const options = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
      <div className="w-full sm:w-64">
        <HrInstitutionSelect
          id="attendance-institution"
          value={institutionId}
          onChange={(instId) => setInstitutionId(instId)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Viewing</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={!institutionId}
              className="w-[16rem] justify-between font-normal"
            >
              <span className="flex items-center gap-2 truncate">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selected ? selected.name : `${selfName} (me)`}</span>
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[20rem] p-0" align="start">
            {/* shouldFilter={false}: the server already filtered by the term.
                Letting cmdk filter again would hide rows whose match is on a
                column it cannot see, such as the staff code. */}
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search name or staff code…"
                value={term}
                onValueChange={setTerm}
              />
              <CommandList>
                {isLoading ? (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Search className="h-4 w-4 animate-pulse" />
                    Searching…
                  </div>
                ) : (
                  <CommandEmpty>No staff match that search.</CommandEmpty>
                )}
                <CommandGroup>
                  {options.map((opt) => (
                    <CommandItem
                      key={opt.id}
                      value={opt.id}
                      onSelect={() => {
                        onSelect({ id: opt.id, name: opt.name });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selected?.id === opt.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex flex-col">
                        <span>{opt.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[opt.staff_code, opt.department_name].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected && (
        <Button variant="ghost" onClick={onReset}>
          Back to my record
        </Button>
      )}
    </div>
  );
}
