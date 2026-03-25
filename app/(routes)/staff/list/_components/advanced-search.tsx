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
import { buildStaffSearchQuery } from '@/lib/utils/staff-search';

interface AdvancedSearchProps {
  onSearch: (query: string, options: SearchOptions) => void;
  onClear: () => void;
  placeholder?: string;
}

export interface SearchOptions {
  searchFields: {
    name: boolean;
    email: boolean;
    institutionEmail: boolean;
    staffId: boolean;
    designation: boolean;
  };
  caseSensitive: boolean;
  exactMatch: boolean;
}

const defaultSearchOptions: SearchOptions = {
  searchFields: {
    name: true,
    email: true,
    institutionEmail: true,
    staffId: false,
    designation: false,
  },
  caseSensitive: false,
  exactMatch: false,
};

export function AdvancedSearch({
  onSearch,
  onClear,
  placeholder = 'Search learning facilitators...'
}: AdvancedSearchProps) {
  const [nameQuery, setNameQuery] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [institutionEmailQuery, setInstitutionEmailQuery] = useState('');
  const [staffIdQuery, setStaffIdQuery] = useState('');
  const [designationQuery, setDesignationQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(defaultSearchOptions);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const hasActiveSearch = useMemo(() => {
    return (
      nameQuery.trim() ||
      emailQuery.trim() ||
      institutionEmailQuery.trim() ||
      staffIdQuery.trim() ||
      designationQuery.trim()
    );
  }, [nameQuery, emailQuery, institutionEmailQuery, staffIdQuery, designationQuery]);

  // Count active search fields
  const activeFieldsCount = useMemo(() => {
    return Object.values(searchOptions.searchFields).filter(Boolean).length;
  }, [searchOptions.searchFields]);

  const handleSearch = useCallback(() => {
    if (!hasActiveSearch) return;

    const query = buildStaffSearchQuery(
      {
        nameQuery,
        emailQuery,
        institutionEmailQuery,
        staffIdQuery,
        designationQuery
      },
      searchOptions.searchFields
    );

    onSearch(query, searchOptions);
  }, [
    nameQuery,
    emailQuery,
    institutionEmailQuery,
    staffIdQuery,
    designationQuery,
    searchOptions,
    onSearch,
    hasActiveSearch
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && hasActiveSearch) {
        handleSearch();
      }
    },
    [handleSearch, hasActiveSearch]
  );

  // Handle search options change
  const handleOptionsChange = useCallback((newOptions: Partial<SearchOptions>) => {
    const updatedOptions = { ...searchOptions, ...newOptions };
    setSearchOptions(updatedOptions);
  }, [searchOptions]);

  // Handle field selection change
  const handleFieldChange = useCallback((field: keyof SearchOptions['searchFields'], checked: boolean) => {
    handleOptionsChange({
      searchFields: {
        ...searchOptions.searchFields,
        [field]: checked,
      },
    });
  }, [searchOptions.searchFields, handleOptionsChange]);

  // Clear search
  const handleClear = useCallback(() => {
    setNameQuery('');
    setEmailQuery('');
    setInstitutionEmailQuery('');
    setStaffIdQuery('');
    setDesignationQuery('');
    onClear();
  }, [onClear]);

  // Reset to defaults
  const handleReset = useCallback(() => {
    setSearchOptions(defaultSearchOptions);
  }, []);

  return (
    <div className="space-y-3">
      {/* Search Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn('pl-9 pr-8', nameQuery && 'border-primary')}
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

        <div className="relative">
          <Input
            placeholder="Search by personal email..."
            value={emailQuery}
            onChange={(e) => setEmailQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn('pr-8', emailQuery && 'border-primary')}
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

        <div className="relative">
          <Input
            placeholder="Search by institution email..."
            value={institutionEmailQuery}
            onChange={(e) => setInstitutionEmailQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn('pr-8', institutionEmailQuery && 'border-primary')}
          />
          {institutionEmailQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInstitutionEmailQuery('')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="relative">
          <Input
            placeholder="Search by staff ID..."
            value={staffIdQuery}
            onChange={(e) => setStaffIdQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn('pr-8', staffIdQuery && 'border-primary')}
          />
          {staffIdQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStaffIdQuery('')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="relative md:col-span-2">
          <Input
            placeholder="Search by designation..."
            value={designationQuery}
            onChange={(e) => setDesignationQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn('pr-8', designationQuery && 'border-primary')}
          />
          {designationQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDesignationQuery('')}
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
          <Button
            onClick={handleSearch}
            size="sm"
            disabled={!hasActiveSearch}
            className={cn('h-9 px-4', hasActiveSearch && 'bg-primary hover:bg-primary/90')}
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>

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

          <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
              >
                <Filter className="h-4 w-4 mr-1" />
                Options
                {(searchOptions.caseSensitive || searchOptions.exactMatch || activeFieldsCount < 5) && (
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

                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">SEARCH IN:</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(searchOptions.searchFields).map(([field, checked]) => (
                      <div key={field} className="flex items-center space-x-2">
                        <Checkbox
                          id={field}
                          checked={checked}
                          onCheckedChange={(checked) =>
                            handleFieldChange(field as keyof SearchOptions['searchFields'], checked as boolean)
                          }
                        />
                        <Label htmlFor={field} className="text-sm font-normal cursor-pointer">
                          {field === 'name' && 'Name (First & Last)'}
                          {field === 'email' && 'Personal Email'}
                          {field === 'institutionEmail' && 'Institution Email'}
                          {field === 'staffId' && 'Staff ID'}
                          {field === 'designation' && 'Designation'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

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

        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          {hasActiveSearch ? (
            <>
              <AlertCircle className="h-3 w-3" />
              Press Enter or click Search to apply
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
      </div>

      {hasActiveSearch && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
          <span className="font-medium">Active searches:</span>
          {nameQuery && <Badge variant="secondary" className="h-5">Name: {nameQuery}</Badge>}
          {emailQuery && <Badge variant="secondary" className="h-5">Email: {emailQuery}</Badge>}
          {institutionEmailQuery && <Badge variant="secondary" className="h-5">Institution: {institutionEmailQuery}</Badge>}
          {staffIdQuery && <Badge variant="secondary" className="h-5">Staff ID: {staffIdQuery}</Badge>}
          {designationQuery && <Badge variant="secondary" className="h-5">Designation: {designationQuery}</Badge>}
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