'use client';

import { useState, useCallback, useMemo } from 'react';
import { Search, X, Filter } from 'lucide-react';
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
  placeholder = "Search staff by name, email, or institution..."
}: AdvancedSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(defaultSearchOptions);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Count active search fields
  const activeFieldsCount = useMemo(() => {
    return Object.values(searchOptions.searchFields).filter(Boolean).length;
  }, [searchOptions.searchFields]);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Trigger search immediately (debounced in parent)
    onSearch(value, searchOptions);
  }, [onSearch, searchOptions]);

  // Handle search options change
  const handleOptionsChange = useCallback((newOptions: Partial<SearchOptions>) => {
    const updatedOptions = { ...searchOptions, ...newOptions };
    setSearchOptions(updatedOptions);

    // Re-trigger search with new options if there's a query
    if (searchQuery.trim()) {
      onSearch(searchQuery, updatedOptions);
    }
  }, [searchOptions, searchQuery, onSearch]);

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
    setSearchQuery('');
    onClear();
  }, [onClear]);

  // Reset to defaults
  const handleReset = useCallback(() => {
    setSearchOptions(defaultSearchOptions);
    if (searchQuery.trim()) {
      onSearch(searchQuery, defaultSearchOptions);
    }
  }, [searchQuery, onSearch]);

  return (
    <div className="space-y-2">
      {/* Main Search Input */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Advanced Options Toggle */}
        <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="px-3"
            >
              <Filter className="h-4 w-4 mr-1" />
              Options
              {activeFieldsCount < 3 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                  {activeFieldsCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Search Options</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-8 px-2 text-xs"
                >
                  Reset
                </Button>
              </div>

              {/* Search Fields */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Search in:</Label>
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
                      <Label htmlFor={field} className="text-sm">
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

              {/* Search Modifiers */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Search Mode:</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="caseSensitive"
                      checked={searchOptions.caseSensitive}
                      onCheckedChange={(checked) =>
                        handleOptionsChange({ caseSensitive: checked as boolean })
                      }
                    />
                    <Label htmlFor="caseSensitive" className="text-sm">
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
                    <Label htmlFor="exactMatch" className="text-sm">
                      Exact match only
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Search Indicator */}
      {searchQuery && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Searching in:</span>
          {Object.entries(searchOptions.searchFields)
            .filter(([, enabled]) => enabled)
            .map(([field], index, array) => (
              <span key={field}>
                {field === 'name' && 'Name'}
                {field === 'email' && 'Email'}
                {field === 'institutionEmail' && 'Institution Email'}
                {field === 'staffId' && 'Staff ID'}
                {field === 'designation' && 'Designation'}
                {index < array.length - 1 && ', '}
              </span>
            ))}
          {(searchOptions.caseSensitive || searchOptions.exactMatch) && (
            <Badge variant="outline" className="h-4 px-1 text-xs">
              {searchOptions.exactMatch ? 'Exact' : searchOptions.caseSensitive ? 'Case' : ''}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}