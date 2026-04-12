'use client';

/**
 * Sponsor Picker
 *
 * Searchable user picker for the learner to select who they're working with
 * when applying for an onduty sub-category that requires sponsor approval.
 *
 * Uses a debounced search against the LeaveOndutyApplicationService's
 * searchEligibleSponsors() method — scoped to the learner's institution,
 * filtered to faculty/staff/coordinator roles (excludes students/guests).
 *
 * @module components/academic/leave-onduty/sponsor-picker
 * @created 2026-04-12
 */

import { useState, useEffect } from 'react';
import { useEligibleSponsors, EligibleSponsor } from '@/hooks/academic/use-leave-onduty';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SponsorPickerProps {
  institutionId: string;
  /** Currently selected sponsor ID */
  value: string | null;
  /** Called with (sponsor_id, sponsor_details) when user picks a row */
  onChange: (
    sponsorId: string | null,
    sponsor?: { id: string; full_name: string; email: string; role: string }
  ) => void;
  /** Shown under the label as a hint (e.g., "Event lead or faculty advisor") */
  hint?: string | null;
  /** Category label, used in the empty state copy */
  categoryLabel?: string;
}

export function SponsorPicker({
  institutionId,
  value,
  onChange,
  hint,
  categoryLabel = 'OnDuty',
}: SponsorPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSponsor, setSelectedSponsor] = useState<{
    id: string;
    full_name: string;
    email: string;
    role: string;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Debounce the search query — 250ms feels snappy without hammering the DB
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const eligibleQuery = useEligibleSponsors(
    institutionId,
    debouncedQuery,
    showResults && debouncedQuery.length >= 1
  );
  const results: EligibleSponsor[] = (eligibleQuery.data as EligibleSponsor[] | undefined) || [];
  const isLoading = eligibleQuery.isLoading;

  const handleSelect = (sponsor: {
    id: string;
    full_name: string;
    email: string;
    role: string;
  }) => {
    setSelectedSponsor(sponsor);
    onChange(sponsor.id, sponsor);
    setQuery('');
    setShowResults(false);
  };

  const handleClear = () => {
    setSelectedSponsor(null);
    onChange(null);
    setQuery('');
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      <Label className="text-sm sm:text-base font-medium">
        Who are you working with?
        <span className="text-red-500 ml-1">*</span>
      </Label>
      {hint && (
        <p className="text-xs text-muted-foreground -mt-1">{hint}</p>
      )}

      {selectedSponsor ? (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-lg border-2 p-3 sm:p-4',
            'border-primary bg-primary/5'
          )}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100 truncate">
                {selectedSponsor.full_name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs capitalize">
                  {selectedSponsor.role.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {selectedSponsor.email}
                </span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            aria-label="Clear sponsor"
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search by name or email..."
              className="pl-9 h-10 sm:h-11 text-sm"
              autoComplete="off"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {showResults && debouncedQuery.length >= 1 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg max-h-64 overflow-y-auto">
              {isLoading && (!results || results.length === 0) ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : !results || results.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No matching sponsors found. Try a different name or email.
                </div>
              ) : (
                <ul className="py-1">
                  {results.map((sponsor) => (
                    <li key={sponsor.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(sponsor)}
                        className="w-full flex items-start gap-3 px-3 py-2 hover:bg-primary/5 transition text-left"
                      >
                        <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {sponsor.full_name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-[10px] capitalize px-1 py-0">
                              {sponsor.role.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {sponsor.email}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedSponsor && !value && (
        <p className="text-xs text-muted-foreground">
          Your {categoryLabel.toLowerCase()} application will first be sent to this person for
          approval. Only after they approve will it go to the HOD.
        </p>
      )}

      {/* Hidden input so native form validation picks up the required state */}
      <input type="hidden" name="sponsor_id" value={value || ''} required />
    </div>
  );
}
