/**
 * Advanced Search Component for Learner Profiles
 *
 * Features:
 * - Separate search fields for name, roll number, and college email
 * - Advanced search options (case sensitive, exact match)
 * - Field-specific search selection
 * - Visual indicators for active searches
 * - Clear filters functionality
 *
 * Pattern based on:
 * - staff/list/_components/advanced-search.tsx
 * - billing/schedule/students/_components/student-search-filters.tsx
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { Search, X, Filter, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface LearnerSearchOptions {
  searchFields: {
    name: boolean;
    rollNumber: boolean;
    collegeEmail: boolean;
    applicationId: boolean;
  };
  caseSensitive: boolean;
  exactMatch: boolean;
}

export interface LearnerSearchFilters {
  nameQuery: string;
  rollNumberQuery: string;
  emailQuery: string;
  searchOptions: LearnerSearchOptions;
}

interface LearnerAdvancedSearchProps {
  onSearch: (filters: LearnerSearchFilters) => void;
  onClear: () => void;
  placeholder?: string;
  initialValues?: {
    nameQuery: string;
    rollNumberQuery: string;
    emailQuery: string;
  };
}

const defaultSearchOptions: LearnerSearchOptions = {
  searchFields: {
    name: true,
    rollNumber: true,
    collegeEmail: true,
    applicationId: false,
  },
  caseSensitive: false,
  exactMatch: false,
};

export function LearnerAdvancedSearch({
  onSearch,
  onClear,
  placeholder = "Search students...",
  initialValues
}: LearnerAdvancedSearchProps) {
  // Separate query states for each search field - initialized from URL if available
  const [nameQuery, setNameQuery] = useState(initialValues?.nameQuery || '');
  const [rollNumberQuery, setRollNumberQuery] = useState(initialValues?.rollNumberQuery || '');
  const [emailQuery, setEmailQuery] = useState(initialValues?.emailQuery || '');
  const [searchOptions, setSearchOptions] = useState<LearnerSearchOptions>(defaultSearchOptions);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Track if any search is active
  const hasActiveSearch = useMemo(() => {
    return nameQuery.trim() || rollNumberQuery.trim() || emailQuery.trim();
  }, [nameQuery, rollNumberQuery, emailQuery]);

  // Count active search fields
  const activeFieldsCount = useMemo(() => {
    return Object.values(searchOptions.searchFields).filter(Boolean).length;
  }, [searchOptions.searchFields]);

  // Handle search execution
  const handleSearch = useCallback(() => {
    if (!hasActiveSearch) return;

    onSearch({
      nameQuery: nameQuery.trim(),
      rollNumberQuery: rollNumberQuery.trim(),
      emailQuery: emailQuery.trim(),
      searchOptions,
    });
  }, [nameQuery, rollNumberQuery, emailQuery, searchOptions, onSearch, hasActiveSearch]);

  // Handle Enter key in input fields
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hasActiveSearch) {
      handleSearch();
    }
  }, [handleSearch, hasActiveSearch]);

  // Handle search options change
  const handleOptionsChange = useCallback((newOptions: Partial<LearnerSearchOptions>) => {
    const updatedOptions = { ...searchOptions, ...newOptions };
    setSearchOptions(updatedOptions);
  }, [searchOptions]);

  // Handle field selection change
  const handleFieldChange = useCallback((field: keyof LearnerSearchOptions['searchFields'], checked: boolean) => {
    handleOptionsChange({
      searchFields: {
        ...searchOptions.searchFields,
        [field]: checked,
      },
    });
  }, [searchOptions.searchFields, handleOptionsChange]);

  // Clear all searches
  const handleClear = useCallback(() => {
    setNameQuery('');
    setRollNumberQuery('');
    setEmailQuery('');
    onClear();
  }, [onClear]);

  // Reset options to defaults
  const handleReset = useCallback(() => {
    setSearchOptions(defaultSearchOptions);
  }, []);

  return (
    <div className="space-y-3">
      {/* Search Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Student Name Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pl-9 pr-8",
              nameQuery && "border-primary"
            )}
          />
          {nameQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNameQuery('')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Roll Number Search */}
        <div className="relative">
          <Input
            placeholder="Search by roll number..."
            value={rollNumberQuery}
            onChange={(e) => setRollNumberQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pr-8",
              rollNumberQuery && "border-primary"
            )}
          />
          {rollNumberQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRollNumberQuery('')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* College Email Search */}
        <div className="relative">
          <Input
            placeholder="Search by email..."
            value={emailQuery}
            onChange={(e) => setEmailQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pr-8",
              emailQuery && "border-primary"
            )}
          />
          {emailQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEmailQuery('')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Search Actions Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <Button
            onClick={handleSearch}
            size="sm"
            disabled={!hasActiveSearch}
            className={cn(
              "h-9 px-4",
              hasActiveSearch && "bg-primary hover:bg-primary/90"
            )}
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>

          {/* Clear Button */}
          {hasActiveSearch && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-9"
            >
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}

          {/* Advanced Options Toggle */}
          <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
              >
                <Filter className="h-4 w-4 mr-1" />
                Options
                {(searchOptions.caseSensitive || searchOptions.exactMatch || activeFieldsCount < 4) && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                    {activeFieldsCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Search Options</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 px-2 text-xs"
                  >
                    Reset
                  </Button>
                </div>

                {/* Search Fields */}
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">SEARCH IN:</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(searchOptions.searchFields).map(([field, checked]) => (
                      <div key={field} className="flex items-center space-x-2">
                        <Checkbox
                          id={field}
                          checked={checked}
                          onCheckedChange={(checked) =>
                            handleFieldChange(field as keyof LearnerSearchOptions['searchFields'], checked as boolean)
                          }
                        />
                        <Label htmlFor={field} className="text-sm font-normal cursor-pointer">
                          {field === 'name' && 'Student Name (First & Last)'}
                          {field === 'rollNumber' && 'Roll Number'}
                          {field === 'collegeEmail' && 'College Email'}
                          {field === 'applicationId' && 'Application ID'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search Modifiers */}
                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-xs font-medium text-muted-foreground">SEARCH MODE:</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="caseSensitive"
                        checked={searchOptions.caseSensitive}
                        onCheckedChange={(checked) =>
                          handleOptionsChange({ caseSensitive: checked as boolean })
                        }
                      />
                      <Label htmlFor="caseSensitive" className="text-sm font-normal cursor-pointer">
                        Case sensitive
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="exactMatch"
                        checked={searchOptions.exactMatch}
                        onCheckedChange={(checked) =>
                          handleOptionsChange({ exactMatch: checked as boolean })
                        }
                      />
                      <Label htmlFor="exactMatch" className="text-sm font-normal cursor-pointer">
                        Exact match only
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Helper Text */}
        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          {hasActiveSearch ? (
            <>
              <AlertCircle className="h-3 w-3" />
              Press Enter or click Search to apply
            </>
          ) : (
            <span>Enter search terms and press Search or Enter</span>
          )}
        </div>
      </div>

      {/* Active Search Indicator */}
      {hasActiveSearch && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
          <span className="font-medium">Active searches:</span>
          {nameQuery && <Badge variant="secondary" className="h-5">Name: {nameQuery}</Badge>}
          {rollNumberQuery && <Badge variant="secondary" className="h-5">Roll: {rollNumberQuery}</Badge>}
          {emailQuery && <Badge variant="secondary" className="h-5">Email: {emailQuery}</Badge>}
          {(searchOptions.caseSensitive || searchOptions.exactMatch) && (
            <Badge variant="outline" className="h-5">
              {searchOptions.exactMatch ? 'Exact' : searchOptions.caseSensitive ? 'Case' : ''}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
