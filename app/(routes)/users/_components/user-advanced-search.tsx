/**
 * User Advanced Search Component
 *
 * Provides advanced search functionality for users with separate fields for:
 * - Full Name
 * - Email
 * - Phone Number
 *
 * Features:
 * - Field-specific search inputs
 * - Advanced options (case sensitive, exact match)
 * - Visual indicators for active searches
 * - Clear filters functionality
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

export interface UserSearchOptions {
  searchFields: {
    fullName: boolean;
    email: boolean;
    phoneNumber: boolean;
  };
  caseSensitive: boolean;
  exactMatch: boolean;
}

export interface UserSearchFilters {
  fullNameQuery: string;
  emailQuery: string;
  phoneQuery: string;
  searchOptions: UserSearchOptions;
}

interface UserAdvancedSearchProps {
  onSearch: (filters: UserSearchFilters) => void;
  onClear: () => void;
  placeholder?: string;
}

const defaultSearchOptions: UserSearchOptions = {
  searchFields: {
    fullName: true,
    email: true,
    phoneNumber: true,
  },
  caseSensitive: false,
  exactMatch: false,
};

export function UserAdvancedSearch({
  onSearch,
  onClear,
  placeholder = "Search users...",
}: UserAdvancedSearchProps) {
  // Separate query states for each search field
  const [fullNameQuery, setFullNameQuery] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<UserSearchOptions>(defaultSearchOptions);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Track if any search is active
  const hasActiveSearch = useMemo(() => {
    return fullNameQuery.trim() || emailQuery.trim() || phoneQuery.trim();
  }, [fullNameQuery, emailQuery, phoneQuery]);

  // Count active search fields
  const activeFieldsCount = useMemo(() => {
    return Object.values(searchOptions.searchFields).filter(Boolean).length;
  }, [searchOptions.searchFields]);

  // Handle search execution
  const handleSearch = useCallback(() => {
    if (!hasActiveSearch) return;

    onSearch({
      fullNameQuery: fullNameQuery.trim(),
      emailQuery: emailQuery.trim(),
      phoneQuery: phoneQuery.trim(),
      searchOptions,
    });
  }, [fullNameQuery, emailQuery, phoneQuery, searchOptions, onSearch, hasActiveSearch]);

  // Handle Enter key in input fields
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hasActiveSearch) {
      handleSearch();
    }
  }, [handleSearch, hasActiveSearch]);

  // Handle search options change
  const handleOptionsChange = useCallback((newOptions: Partial<UserSearchOptions>) => {
    const updatedOptions = { ...searchOptions, ...newOptions };
    setSearchOptions(updatedOptions);
  }, [searchOptions]);

  // Handle field selection change
  const handleFieldChange = useCallback((field: keyof UserSearchOptions['searchFields'], checked: boolean) => {
    handleOptionsChange({
      searchFields: {
        ...searchOptions.searchFields,
        [field]: checked,
      },
    });
  }, [searchOptions.searchFields, handleOptionsChange]);

  // Clear all searches
  const handleClear = useCallback(() => {
    setFullNameQuery('');
    setEmailQuery('');
    setPhoneQuery('');
    onClear();
  }, [onClear]);

  // Clear individual field and trigger search update
  const handleClearField = useCallback((field: 'fullName' | 'email' | 'phone') => {
    // Calculate what the queries will be after clearing this field
    const updatedQueries = {
      fullName: field === 'fullName' ? '' : fullNameQuery,
      email: field === 'email' ? '' : emailQuery,
      phone: field === 'phone' ? '' : phoneQuery
    };

    // Update the state
    if (field === 'fullName') {
      setFullNameQuery('');
    } else if (field === 'email') {
      setEmailQuery('');
    } else if (field === 'phone') {
      setPhoneQuery('');
    }

    // If all fields are now empty, call onClear()
    if (!updatedQueries.fullName && !updatedQueries.email && !updatedQueries.phone) {
      onClear();
    } else {
      // Trigger search with remaining fields
      onSearch({
        fullNameQuery: updatedQueries.fullName,
        emailQuery: updatedQueries.email,
        phoneQuery: updatedQueries.phone,
        searchOptions,
      });
    }
  }, [fullNameQuery, emailQuery, phoneQuery, searchOptions, onClear, onSearch]);

  // Reset options to defaults
  const handleReset = useCallback(() => {
    setSearchOptions(defaultSearchOptions);
  }, []);

  return (
    <div className="space-y-3">
      {/* Search Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Full Name Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by full name..."
            value={fullNameQuery}
            onChange={(e) => setFullNameQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pl-9 pr-8",
              fullNameQuery && "border-primary"
            )}
          />
          {fullNameQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleClearField('fullName')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Email Search */}
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
              onClick={() => handleClearField('email')}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Phone Number Search */}
        <div className="relative">
          <Input
            placeholder="Search by phone number..."
            value={phoneQuery}
            onChange={(e) => setPhoneQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "pr-8",
              phoneQuery && "border-primary"
            )}
          />
          {phoneQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleClearField('phone')}
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
                {(searchOptions.caseSensitive || searchOptions.exactMatch || activeFieldsCount < 3) && (
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
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="fullName"
                        checked={searchOptions.searchFields.fullName}
                        onCheckedChange={(checked) =>
                          handleFieldChange('fullName', checked as boolean)
                        }
                      />
                      <Label htmlFor="fullName" className="text-sm font-normal cursor-pointer">
                        Full Name
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="email"
                        checked={searchOptions.searchFields.email}
                        onCheckedChange={(checked) =>
                          handleFieldChange('email', checked as boolean)
                        }
                      />
                      <Label htmlFor="email" className="text-sm font-normal cursor-pointer">
                        Email Address
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="phoneNumber"
                        checked={searchOptions.searchFields.phoneNumber}
                        onCheckedChange={(checked) =>
                          handleFieldChange('phoneNumber', checked as boolean)
                        }
                      />
                      <Label htmlFor="phoneNumber" className="text-sm font-normal cursor-pointer">
                        Phone Number
                      </Label>
                    </div>
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
          {fullNameQuery && <Badge variant="secondary" className="h-5">Name: {fullNameQuery}</Badge>}
          {emailQuery && <Badge variant="secondary" className="h-5">Email: {emailQuery}</Badge>}
          {phoneQuery && <Badge variant="secondary" className="h-5">Phone: {phoneQuery}</Badge>}
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
