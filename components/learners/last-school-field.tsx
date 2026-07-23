'use client';

// Last School field with Board → District → School cascade.
//
// Board = state_board (UG): District combobox → School combobox with
// debounced server-side search (trigram-backed ILIKE), plus a manual-entry
// fallback for schools not in the master. Any other board / PG keeps the
// plain free-text input.
//
// Legacy data is never lost: records saved before the school master existed
// hydrate into manual mode with their text prefilled (or auto-link when the
// text unambiguously matches a master school). Only an explicit selection
// overwrites the stored name.

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, PencilLine, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import type { SchoolMaster, SchoolMasterDistrict } from '@/types/school-master';

const STATE_BOARD = 'state_board';

export interface LastSchoolValue {
  name: string;
  schoolId: string | null;
  district: string | null;
}

export interface LastSchoolFetchers {
  fetchDistricts: () => Promise<SchoolMasterDistrict[]>;
  fetchSchools: (q: { district: string; search: string }) => Promise<{
    schools: SchoolMaster[];
    total: number;
  }>;
  /** Optional: exact-name auto-link for legacy free-text values. */
  matchExactName?: (name: string, district?: string | null) => Promise<SchoolMaster | null>;
}

interface LastSchoolFieldProps {
  /** Normalized board value ('state_board', 'cbse', …). Cascade only for state_board. */
  board?: string | null;
  isPG?: boolean;
  value: string;
  schoolId?: string | null;
  district?: string | null;
  onChange: (next: LastSchoolValue) => void;
  disabled?: boolean;
  /** Data adapters — admin uses the default Supabase-backed ones; the public
   *  student-form injects token-endpoint fetchers. */
  fetchers: LastSchoolFetchers;
  /** Set when rendered inside a Radix Dialog (see SearchableSelect.modal). */
  modal?: boolean;
  placeholder?: string;
}

const SEARCH_LIMIT = 50;

export function LastSchoolField({
  board,
  isPG = false,
  value,
  schoolId = null,
  district = null,
  onChange,
  disabled = false,
  fetchers,
  modal = false,
  placeholder = 'Enter school/college name',
}: LastSchoolFieldProps) {
  const isStateBoard = !isPG && (board ?? '') === STATE_BOARD;

  // manual = free-text input; select = district→school cascade
  const [mode, setMode] = React.useState<'select' | 'manual'>(() =>
    schoolId ? 'select' : value ? 'manual' : 'select',
  );
  const [schoolOpen, setSchoolOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearch = useDebounceValue(searchTerm, 300);
  // Remember the pre-toggle value so "cancel" restores it exactly
  const manualBackupRef = React.useRef<LastSchoolValue | null>(null);

  const { data: districts = [], isLoading: districtsLoading } = useQuery({
    queryKey: queryKeys.schoolMaster.districts(STATE_BOARD),
    queryFn: fetchers.fetchDistricts,
    enabled: isStateBoard,
    staleTime: 5 * 60 * 1000,
  });

  const { data: schoolResult, isFetching: schoolsLoading } = useQuery({
    queryKey: queryKeys.schoolMaster.list({
      board: STATE_BOARD,
      district,
      search: debouncedSearch,
      limit: SEARCH_LIMIT,
    }),
    queryFn: () => fetchers.fetchSchools({ district: district as string, search: debouncedSearch }),
    enabled: isStateBoard && mode === 'select' && !!district,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const schools = schoolResult?.schools ?? [];
  const total = schoolResult?.total ?? 0;

  // Clear a stale master link if the board moves away from state_board —
  // the FK must not survive a board change (text value is kept).
  React.useEffect(() => {
    if (!isStateBoard && schoolId) {
      onChange({ name: value, schoolId: null, district: district ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStateBoard]);

  // Legacy auto-link: free-text value with no FK — if it unambiguously matches
  // a master school, link it (select mode). Runs once per mount.
  const attemptedMatchRef = React.useRef(false);
  React.useEffect(() => {
    if (
      attemptedMatchRef.current ||
      !isStateBoard ||
      schoolId ||
      !value?.trim() ||
      !fetchers.matchExactName
    ) {
      return;
    }
    attemptedMatchRef.current = true;
    let cancelled = false;
    fetchers
      .matchExactName(value, district)
      .then((match) => {
        if (cancelled || !match) return;
        setMode('select');
        onChange({ name: match.school_name, schoolId: match.id, district: match.district });
      })
      .catch(() => {
        // Match is best-effort; manual mode already preserves the value.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStateBoard, schoolId, value]);

  // ---- Plain input: PG or non-state-board (unchanged legacy behavior) ----
  if (!isStateBoard) {
    return (
      <Input
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value, schoolId: null, district: district ?? null })}
      />
    );
  }

  // ---- Manual mode: free text + link back to the dropdown ----
  if (mode === 'manual') {
    return (
      <div className="space-y-1.5">
        <Input
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value, schoolId: null, district: district ?? null })}
        />
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={disabled}
          className="h-auto px-0 text-xs"
          onClick={() => {
            manualBackupRef.current = { name: value, schoolId: null, district: district ?? null };
            setSearchTerm(value?.trim() ?? '');
            setMode('select');
          }}
        >
          <ListChecks className="mr-1 h-3 w-3" />
          Select from school list
        </Button>
      </div>
    );
  }

  // ---- Select mode: District → School cascade ----
  const districtOptions = districts.map((d) => ({
    value: d.district,
    label: `${d.district} (${d.school_count})`,
  }));
  const selectedSchoolLabel = schoolId
    ? (schools.find((s) => s.id === schoolId)?.school_name ?? value)
    : value || undefined;

  return (
    <div className="space-y-2">
      <SearchableSelect
        value={district ?? ''}
        onValueChange={(next) => {
          if (next !== district) {
            // District change resets the picked school
            onChange({ name: '', schoolId: null, district: next });
            setSearchTerm('');
          }
        }}
        options={districtOptions}
        placeholder="Select district"
        searchPlaceholder="Search district…"
        emptyMessage="No districts with schools yet."
        disabled={disabled}
        loading={districtsLoading}
        className="w-full"
        modal={modal}
      />

      <Popover open={schoolOpen} onOpenChange={setSchoolOpen} modal={modal}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={schoolOpen}
            disabled={disabled || !district}
            className={cn(
              'w-full justify-between font-normal',
              !selectedSchoolLabel && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {selectedSchoolLabel ?? (district ? 'Select school' : 'Select district first')}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-full"
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '280px' }}
          align="start"
        >
          {/* Server-side search — cmdk's own filtering is disabled */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search school name…"
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {schoolsLoading ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              ) : (
                <>
                  <CommandEmpty>No school found — use manual entry below.</CommandEmpty>
                  <CommandGroup>
                    {schools.map((school) => (
                      <CommandItem
                        key={school.id}
                        value={school.id}
                        onSelect={() => {
                          onChange({
                            name: school.school_name,
                            schoolId: school.id,
                            district: school.district,
                          });
                          setSchoolOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            schoolId === school.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{school.school_name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {total > schools.length && (
                    <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                      Showing {schools.length} of {total} — type to narrow down.
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="link"
        size="sm"
        disabled={disabled}
        className="h-auto px-0 text-xs"
        onClick={() => {
          // Restore the pre-toggle text if the user backs out of the dropdown
          const backup = manualBackupRef.current;
          if (backup && !schoolId) {
            onChange(backup);
          }
          setMode('manual');
        }}
      >
        <PencilLine className="mr-1 h-3 w-3" />
        School not listed? Enter manually
      </Button>
    </div>
  );
}
