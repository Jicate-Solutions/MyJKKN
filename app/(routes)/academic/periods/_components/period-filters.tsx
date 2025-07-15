'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PeriodFilters as PeriodFiltersType } from '@/types/academics';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';

interface PeriodFiltersProps {
  filters: PeriodFiltersType;
  onFilterChange: (filters: Partial<PeriodFiltersType>) => void;
}

export function PeriodFilters({ filters, onFilterChange }: PeriodFiltersProps) {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const debouncedSearchTerm = useDebounceValue(searchTerm, 500);

  const { isSuperAdmin, userProfile } = usePermissions();

  // Use ref to track if we've already auto-set the institution to prevent loops
  const hasAutoSetInstitution = useRef(false);

  // Memoize the institutions hook options to prevent recreation
  const institutionsOptions = useMemo(
    () => ({
      isActive: true
    }),
    []
  );

  // Fetch institutions with proper access control
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess(institutionsOptions);

  // Auto-set institution filter for faculty users (only once)
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !filters.institution_id &&
      !hasAutoSetInstitution.current
    ) {
      hasAutoSetInstitution.current = true;
      onFilterChange({ institution_id: userProfile.institution_id });
    }
  }, [userProfile?.institution_id, isSuperAdmin, filters.institution_id]);

  // Handle search term changes
  useEffect(() => {
    if (debouncedSearchTerm !== filters.search) {
      onFilterChange({ search: debouncedSearchTerm || undefined });
    }
  }, [debouncedSearchTerm, filters.search]);

  const handleInstitutionChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ institution_id: undefined });
    } else {
      onFilterChange({ institution_id: value });
    }
  };

  const handleIsBreakChange = (value: string) => {
    if (value === 'all') {
      onFilterChange({ isBreak: undefined });
    } else {
      onFilterChange({ isBreak: value === 'true' });
    }
  };

  return (
    <div className='flex flex-col sm:flex-row gap-4'>
      <div className='relative flex-1'>
        <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Search periods...'
          className='pl-9'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Institution Filter - Only show for super admins */}
      {isSuperAdmin && (
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={handleInstitutionChange}
          disabled={institutionsLoading}
        >
          <SelectTrigger className='w-full sm:w-[200px]'>
            <SelectValue placeholder='Filter by institution' />
          </SelectTrigger>
          <SelectContent className='max-h-60 overflow-y-auto'>
            <SelectItem value='all'>All Institutions</SelectItem>
            {institutions.length === 0 && !institutionsLoading ? (
              <SelectItem value='no-data' disabled>
                No institutions available
              </SelectItem>
            ) : (
              institutions.map((institution) => (
                <SelectItem key={institution.id} value={institution.id}>
                  {institution.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}

      <Select
        value={
          filters.isBreak === undefined
            ? 'all'
            : filters.isBreak
            ? 'true'
            : 'false'
        }
        onValueChange={handleIsBreakChange}
      >
        <SelectTrigger className='w-full sm:w-[180px]'>
          <SelectValue placeholder='Filter by type' />
        </SelectTrigger>
        <SelectContent className='max-h-60 overflow-y-auto'>
          <SelectItem value='all'>All Types</SelectItem>
          <SelectItem value='false'>Academic</SelectItem>
          <SelectItem value='true'>Break</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
