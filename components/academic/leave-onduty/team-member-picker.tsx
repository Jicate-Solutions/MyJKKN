'use client';

/**
 * Team Member Picker (v2, 2026-04-21)
 *
 * Searchable multi-select for team OnDuty applications. Learner can search the
 * full institution roster by name / roll / register number / email and build
 * a list of team-mates. The applicant themselves is excluded from results.
 *
 * Used by ApplicationForm when category='onduty' and applicable_type='team'.
 *
 * @module components/academic/leave-onduty/team-member-picker
 */

import { useState, useEffect } from 'react';
import { useSearchTeamMembers, TeamMemberSearchResult } from '@/hooks/academic/use-leave-onduty';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TeamMemberPickerProps {
  institutionId: string;
  /** Applicant's own learner_id so they can't add themselves */
  applicantLearnerId: string;
  /** Current roster (excluding the applicant themself) */
  value: TeamMemberSearchResult[];
  /** Called whenever the roster changes */
  onChange: (members: TeamMemberSearchResult[]) => void;
  /** Optional min/max enforced in the parent form */
  minMembers?: number;
  maxMembers?: number;
}

export function TeamMemberPicker({
  institutionId,
  applicantLearnerId,
  value,
  onChange,
  minMembers = 1,
  maxMembers = 50,
}: TeamMemberPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  // Debounce search — same 250ms as SponsorPicker for consistency.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searchQuery = useSearchTeamMembers(
    institutionId,
    debouncedQuery,
    applicantLearnerId,
    showResults && debouncedQuery.length >= 1
  );

  const results = (searchQuery.data || []).filter(
    (r) => !value.some((m) => m.id === r.id)
  );
  const isLoading = searchQuery.isLoading;

  const handleAdd = (member: TeamMemberSearchResult) => {
    if (value.length >= maxMembers) return;
    onChange([...value, member]);
    setQuery('');
    setShowResults(false);
  };

  const handleRemove = (memberId: string) => {
    onChange(value.filter((m) => m.id !== memberId));
  };

  const atMax = value.length >= maxMembers;
  const belowMin = value.length < minMembers;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm sm:text-base font-medium">
          Team Members<span className="text-red-500 ml-1">*</span>
        </Label>
        <span className="text-xs text-muted-foreground">
          ({value.length} selected)
        </span>
      </div>

      {belowMin && (
        <p className="text-xs text-muted-foreground">
          Add at least {minMembers} team-mate. Searching finds students across the whole institution.
        </p>
      )}

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((m) => (
            <Badge
              key={m.id}
              variant="secondary"
              className="flex items-center gap-1 py-1.5 pl-3 pr-1.5"
            >
              <span className="text-xs">
                {m.first_name} {m.last_name}
                {m.roll_number ? ` · ${m.roll_number}` : ''}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(m.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove ${m.first_name} ${m.last_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder={
              atMax
                ? `Maximum ${maxMembers} team-mates reached`
                : 'Search by name, roll number, or register number…'
            }
            disabled={atMax}
            className="pl-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results dropdown */}
        {showResults && debouncedQuery.length >= 1 && (
          <div
            className={cn(
              'absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg',
              'max-h-64 overflow-y-auto'
            )}
          >
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">Searching…</div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No matching students found.
              </div>
            ) : (
              <ul className="py-1">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(r)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {r.first_name} {r.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.roll_number && <span>Roll: {r.roll_number}</span>}
                          {r.register_number && (
                            <span>
                              {r.roll_number ? ' · ' : ''}Reg: {r.register_number}
                            </span>
                          )}
                          {r.student_email && (
                            <span>
                              {r.roll_number || r.register_number ? ' · ' : ''}
                              {r.student_email}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        tabIndex={-1}
                      >
                        Add
                      </Button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
